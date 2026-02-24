// ----------------- STATE -----------------

let myName = "";
let roomKey = "";

let myPeer = null;
let connections = {};

let cryptoKey = null;


// ----------------- CRYPTO -----------------

async function deriveKey(password) {
  const enc = new TextEncoder();

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("cipher-salt"),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}


async function encrypt(data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(JSON.stringify(data));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  const buffer = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);

  return btoa(String.fromCharCode(...buffer));
}


async function decrypt(data) {
  const buffer = Uint8Array.from(atob(data), c => c.charCodeAt(0));

  const iv = buffer.slice(0, 12);
  const text = buffer.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    text
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}


// ----------------- CONNECT -----------------

async function connect() {

  myName = document.getElementById("nameInput").value.trim();
  roomKey = document.getElementById("keyInput").value.trim();

  if (!myName || !roomKey) {
    alert("Enter name and key");
    return;
  }

  cryptoKey = await deriveKey(roomKey);

  await loadPeer();

  const roomId = await hashRoom(roomKey);

  createPeer(roomId);
}


async function loadPeer() {

  return new Promise((resolve) => {

    if (window.Peer) return resolve();

    const s = document.createElement("script");
    s.src = "https://unpkg.com/peerjs@1.5.1/dist/peerjs.min.js";

    s.onload = resolve;

    document.head.appendChild(s);
  });

}


async function hashRoom(key) {

  const enc = new TextEncoder();

  const hash = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(key)
  );

  return Array.from(new Uint8Array(hash))
    .slice(0, 6)
    .map(b => b.toString(16))
    .padStart(2, "0")
    .join("");
}


function createPeer(roomId) {

  myPeer = new Peer("room-" + roomId);

  myPeer.on("open", () => {

    document.getElementById("joinSection").style.display = "none";
    document.getElementById("chatSection").style.display = "block";

    myPeer.on("connection", conn => {

      connections[conn.peer] = conn;

      setupConnection(conn);

    });

  });


  myPeer.on("error", err => {

    if (err.type === "unavailable-id") {
      joinRoom(roomId);
    }

  });

}


function joinRoom(roomId) {

  myPeer = new Peer();

  myPeer.on("open", () => {

    const conn = myPeer.connect("room-" + roomId);

    connections[conn.peer] = conn;

    setupConnection(conn);

  });

}


// ----------------- CONNECTION -----------------

function setupConnection(conn) {

  conn.on("data", data => {
    receiveData(data);
  });

}


// ----------------- CHAT -----------------

async function sendMessage() {

  const input = document.getElementById("msgInput");

  const msg = input.value.trim();

  if (!msg) return;

  const encrypted = await encrypt({
    name: myName,
    text: msg
  });

  broadcast({
    type: "msg",
    data: encrypted
  });

  showMessage(myName, msg);

  input.value = "";

}


function broadcast(data) {

  Object.values(connections).forEach(c => {
    c.send(data);
  });

}


async function receiveData(data) {

  if (data.type === "msg") {

    const msg = await decrypt(data.data);

    showMessage(msg.name, msg.text);

  }

}


function showMessage(name, text) {

  const box = document.getElementById("chatBox");

  const div = document.createElement("div");

  div.textContent = name + ": " + text;

  box.appendChild(div);

  box.scrollTop = box.scrollHeight;

}
