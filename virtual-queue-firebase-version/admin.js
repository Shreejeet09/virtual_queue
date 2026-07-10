import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { firebaseConfig, QUEUE_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const queueRef = ref(db, `queues/${QUEUE_ID}`);

const currentTokenEl = document.getElementById("currentToken");
const lastTokenEl = document.getElementById("lastToken");
const waitingCountEl = document.getElementById("waitingCount");
const servedCountEl = document.getElementById("servedCount");
const queueTable = document.getElementById("queueTable");
const callNextBtn = document.getElementById("callNextBtn");
const skipBtn = document.getElementById("skipBtn");
const resetBtn = document.getElementById("resetBtn");

let currentData = {};

function padToken(num) {
  return `T${String(num).padStart(3, "0")}`;
}

function formatTime(timestamp) {
  if (!timestamp) return "--";
  return new Date(timestamp).toLocaleString();
}

function tokenList(tokens = {}) {
  return Object.values(tokens).filter(Boolean).sort((a, b) => a.token - b.token);
}

function findNextWaiting(tokens = {}) {
  return tokenList(tokens).find(item => item.status === "waiting") || null;
}

function releaseDevice(queue, tokenItem) {
  if (!tokenItem?.deviceId || !queue.activeDevices) return;
  const device = queue.activeDevices[tokenItem.deviceId];
  if (device && Number(device.activeToken) === Number(tokenItem.token)) {
    delete queue.activeDevices[tokenItem.deviceId];
  }
}

function render(data) {
  const tokens = tokenList(data.tokens);
  const serving = tokens.find(item => item.status === "serving");
  const waiting = tokens.filter(item => item.status === "waiting");
  const served = tokens.filter(item => item.status === "served");

  currentTokenEl.textContent = serving ? padToken(serving.token) : "--";
  lastTokenEl.textContent = data.lastToken || 0;
  waitingCountEl.textContent = waiting.length;
  servedCountEl.textContent = served.length;

  queueTable.innerHTML = waiting.map(item => `
    <tr>
      <td>${padToken(item.token)}</td>
      <td><span class="badge">${item.status}</span></td>
      <td>${formatTime(item.createdAt)}</td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="empty">No waiting tokens</td></tr>`;
}

onValue(queueRef, snapshot => {
  currentData = snapshot.val() || {};
  render(currentData);
});

async function callNext({ skipCurrent = false } = {}) {
  const result = await runTransaction(queueRef, queue => {
    queue = queue || { lastToken: 0, servedCount: 0, tokens: {}, activeDevices: {} };
    queue.tokens = queue.tokens || {};
    queue.activeDevices = queue.activeDevices || {};

    const now = Date.now();
    const current = tokenList(queue.tokens).find(item => item.status === "serving");

    if (current) {
      const item = queue.tokens[current.token];
      item.status = skipCurrent ? "skipped" : "served";
      item.completedAt = now;
      if (!skipCurrent) queue.servedCount = (queue.servedCount || 0) + 1;
      releaseDevice(queue, item);
    } else if (skipCurrent) {
      return; // abort: there is nothing to skip
    }

    const next = findNextWaiting(queue.tokens);
    if (next) {
      queue.tokens[next.token].status = "serving";
      queue.tokens[next.token].calledAt = now;
      queue.currentServing = next.token;
    } else {
      queue.currentServing = 0;
    }

    return queue;
  });

  if (!result.committed) {
    alert(skipCurrent ? "No active token to skip." : "No waiting tokens in the queue.");
  }
}

callNextBtn.addEventListener("click", async () => {
  callNextBtn.disabled = true;
  try { await callNext(); }
  catch (error) { console.error(error); alert("Could not call the next token."); }
  finally { callNextBtn.disabled = false; }
});

skipBtn.addEventListener("click", async () => {
  skipBtn.disabled = true;
  try { await callNext({ skipCurrent: true }); }
  catch (error) { console.error(error); alert("Could not skip the current token."); }
  finally { skipBtn.disabled = false; }
});

resetBtn.addEventListener("click", async () => {
  if (!confirm("Are you sure you want to reset the full queue?")) return;
  await set(queueRef, {
    currentServing: 0,
    lastToken: 0,
    servedCount: 0,
    averageServiceMinutes: 3,
    tokens: {},
    activeDevices: {}
  });
});
