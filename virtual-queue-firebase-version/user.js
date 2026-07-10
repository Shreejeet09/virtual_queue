import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { firebaseConfig, QUEUE_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const queueRef = ref(db, `queues/${QUEUE_ID}`);

const myTokenEl = document.getElementById("myToken");
const statusText = document.getElementById("statusText");
const currentTokenEl = document.getElementById("currentToken");
const waitingCountEl = document.getElementById("waitingCount");
const estimatedWaitEl = document.getElementById("estimatedWait");
const takeTokenBtn = document.getElementById("takeTokenBtn");

const DEVICE_KEY = "virtualQueueDeviceIdV2";
const MY_TOKEN_KEY = `virtualQueueMyToken_${QUEUE_ID}`;
let myToken = localStorage.getItem(MY_TOKEN_KEY);
let previousStatus = null;

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
const deviceId = getDeviceId();

function padToken(num) {
  return `T${String(num).padStart(3, "0")}`;
}

function listTokens(tokens = {}) {
  return Object.values(tokens).filter(Boolean).sort((a, b) => a.token - b.token);
}

function notifyTurn(token) {
  if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 500]);
  try {
    const audio = new Audio("data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgA==");
    audio.play().catch(() => {});
  } catch (_) {}
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("It is your turn!", { body: `${padToken(token)} is now being served. Please go to the counter.` });
  }
}

function setNoTokenState() {
  myTokenEl.textContent = "--";
  statusText.textContent = "Tap below to generate your queue token.";
  estimatedWaitEl.textContent = "--";
  takeTokenBtn.disabled = false;
  takeTokenBtn.textContent = "Take Token";
}

function render(data) {
  const tokens = listTokens(data.tokens);
  const serving = tokens.find(item => item.status === "serving");
  const waiting = tokens.filter(item => item.status === "waiting");
  const averageMinutes = Number(data.averageServiceMinutes || 3);

  currentTokenEl.textContent = serving ? padToken(serving.token) : "--";
  waitingCountEl.textContent = waiting.length;

  if (!myToken) {
    const deviceActive = data.activeDevices?.[deviceId]?.activeToken;
    if (deviceActive && data.tokens?.[deviceActive] && ["waiting", "serving"].includes(data.tokens[deviceActive].status)) {
      myToken = String(deviceActive);
      localStorage.setItem(MY_TOKEN_KEY, myToken);
    } else {
      setNoTokenState();
      return;
    }
  }

  const item = data.tokens?.[myToken];
  if (!item) {
    localStorage.removeItem(MY_TOKEN_KEY);
    myToken = null;
    previousStatus = null;
    setNoTokenState();
    return;
  }

  myTokenEl.textContent = padToken(Number(myToken));
  takeTokenBtn.disabled = true;
  takeTokenBtn.textContent = "Active Token Already Taken";

  if (item.status === "serving") {
    statusText.textContent = "It is your turn now. Please go to the counter.";
    estimatedWaitEl.textContent = "Now";
    if (previousStatus && previousStatus !== "serving") notifyTurn(item.token);
  } else if (item.status === "waiting") {
    const ahead = waiting.filter(token => token.token < item.token).length + (serving ? 1 : 0);
    statusText.textContent = `${ahead} ${ahead === 1 ? "person is" : "people are"} ahead of you.`;
    estimatedWaitEl.textContent = ahead === 0 ? "Less than 3 min" : `About ${ahead * averageMinutes} min`;
  } else if (item.status === "served") {
    statusText.textContent = "Your token has been served. You may now take a new token if needed.";
    estimatedWaitEl.textContent = "Completed";
    takeTokenBtn.disabled = false;
    takeTokenBtn.textContent = "Take New Token";
  } else if (item.status === "skipped") {
    statusText.textContent = "Your token was skipped. Please contact the counter or take a new token.";
    estimatedWaitEl.textContent = "Skipped";
    takeTokenBtn.disabled = false;
    takeTokenBtn.textContent = "Take New Token";
  }
  previousStatus = item.status;
}

onValue(queueRef, snapshot => render(snapshot.val() || {}));

takeTokenBtn.addEventListener("click", async () => {
  takeTokenBtn.disabled = true;
  takeTokenBtn.textContent = "Generating...";

  try {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }

    let assignedToken = null;
    let blockedToken = null;
    const result = await runTransaction(queueRef, queue => {
      queue = queue || { currentServing: 0, lastToken: 0, servedCount: 0, averageServiceMinutes: 3, tokens: {}, activeDevices: {} };
      queue.tokens = queue.tokens || {};
      queue.activeDevices = queue.activeDevices || {};

      const existingNumber = queue.activeDevices[deviceId]?.activeToken;
      const existing = existingNumber ? queue.tokens[existingNumber] : null;
      if (existing && ["waiting", "serving"].includes(existing.status)) {
        blockedToken = existingNumber;
        return; // abort transaction; one active token per device
      }

      const newToken = (queue.lastToken || 0) + 1;
      queue.lastToken = newToken;
      queue.tokens[newToken] = {
        token: newToken,
        status: "waiting",
        createdAt: Date.now(),
        deviceId
      };
      queue.activeDevices[deviceId] = { activeToken: newToken, createdAt: Date.now() };
      assignedToken = newToken;
      return queue;
    });

    if (!result.committed) {
      if (blockedToken) {
        myToken = String(blockedToken);
        localStorage.setItem(MY_TOKEN_KEY, myToken);
        alert(`This phone already has active token ${padToken(blockedToken)}. You cannot take another token until it is served or skipped.`);
      } else {
        alert("Could not generate a token. Please try again.");
      }
    } else {
      myToken = String(assignedToken);
      localStorage.setItem(MY_TOKEN_KEY, myToken);
    }
  } catch (error) {
    console.error(error);
    alert("Could not connect to Firebase. Check firebase-config.js and your database rules.");
  } finally {
    if (!myToken) {
      takeTokenBtn.disabled = false;
      takeTokenBtn.textContent = "Take Token";
    }
  }
});
