import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  update,
  set,
  get
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

function render(data) {
  const currentServing = data.currentServing || 0;
  const lastToken = data.lastToken || 0;
  const servedCount = data.servedCount || 0;
  const tokens = data.tokens || {};

  currentTokenEl.textContent = currentServing ? padToken(currentServing) : "--";
  lastTokenEl.textContent = lastToken;
  waitingCountEl.textContent = Math.max(lastToken - currentServing, 0);
  servedCountEl.textContent = servedCount;

  const rows = Object.values(tokens)
    .sort((a, b) => a.token - b.token)
    .filter(item => item.status === "waiting")
    .map(item => `
      <tr>
        <td>${padToken(item.token)}</td>
        <td><span class="badge">${item.status}</span></td>
        <td>${formatTime(item.createdAt)}</td>
      </tr>
    `)
    .join("");

  queueTable.innerHTML = rows || `<tr><td colspan="3" class="empty">No waiting tokens</td></tr>`;
}

onValue(queueRef, (snapshot) => {
  currentData = snapshot.val() || {};
  render(currentData);
});

callNextBtn.addEventListener("click", async () => {
  const snapshot = await get(queueRef);
  const data = snapshot.val() || {};
  const currentServing = data.currentServing || 0;
  const lastToken = data.lastToken || 0;

  if (currentServing >= lastToken) {
    alert("No more tokens in queue.");
    return;
  }

  const nextToken = currentServing + 1;
  await update(queueRef, {
    currentServing: nextToken,
    servedCount: data.servedCount || 0
  });
  await update(ref(db, `queues/${QUEUE_ID}/tokens/${nextToken}`), {
    status: "serving"
  });
});

skipBtn.addEventListener("click", async () => {
  const currentServing = currentData.currentServing || 0;
  if (!currentServing) {
    alert("No active token to skip.");
    return;
  }
  await update(ref(db, `queues/${QUEUE_ID}/tokens/${currentServing}`), {
    status: "skipped"
  });
});

resetBtn.addEventListener("click", async () => {
  const ok = confirm("Are you sure you want to reset the full queue?");
  if (!ok) return;

  await set(queueRef, {
    currentServing: 0,
    lastToken: 0,
    servedCount: 0,
    tokens: {}
  });
});
