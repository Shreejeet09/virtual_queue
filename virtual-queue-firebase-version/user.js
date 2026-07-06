import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  set,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { firebaseConfig, QUEUE_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const queueRef = ref(db, `queues/${QUEUE_ID}`);

const myTokenEl = document.getElementById("myToken");
const statusText = document.getElementById("statusText");
const currentTokenEl = document.getElementById("currentToken");
const waitingCountEl = document.getElementById("waitingCount");
const takeTokenBtn = document.getElementById("takeTokenBtn");
const clearMyTokenBtn = document.getElementById("clearMyTokenBtn");

const MY_TOKEN_KEY = "virtualQueueMyToken";
let myToken = localStorage.getItem(MY_TOKEN_KEY);

function padToken(num) {
  return `T${String(num).padStart(3, "0")}`;
}

function renderMyToken(currentServing) {
  if (!myToken) {
    myTokenEl.textContent = "--";
    statusText.textContent = "Tap below to generate your queue token.";
    return;
  }

  myTokenEl.textContent = padToken(Number(myToken));

  if (Number(myToken) === Number(currentServing)) {
    statusText.textContent = "It is your turn now. Please go to the counter.";
  } else if (currentServing && Number(myToken) <= Number(currentServing)) {
    statusText.textContent = "Your token has already been called.";
  } else {
    const ahead = Math.max(Number(myToken) - Number(currentServing || 0) - 1, 0);
    statusText.textContent = `${ahead} people are ahead of you.`;
  }
}

onValue(queueRef, (snapshot) => {
  const data = snapshot.val() || {};
  const currentServing = data.currentServing || 0;
  const lastToken = data.lastToken || 0;

  currentTokenEl.textContent = currentServing ? padToken(currentServing) : "--";
  waitingCountEl.textContent = Math.max(lastToken - currentServing, 0);
  renderMyToken(currentServing);
});

takeTokenBtn.addEventListener("click", async () => {
  if (myToken) {
    alert("You already have a token on this device.");
    return;
  }

  takeTokenBtn.disabled = true;
  takeTokenBtn.textContent = "Generating...";

  try {
    const counterRef = ref(db, `queues/${QUEUE_ID}/lastToken`);
    const result = await runTransaction(counterRef, (currentValue) => {
      return (currentValue || 0) + 1;
    });

    const newToken = result.snapshot.val();
    await set(ref(db, `queues/${QUEUE_ID}/tokens/${newToken}`), {
      token: newToken,
      status: "waiting",
      createdAt: serverTimestamp()
    });

    myToken = String(newToken);
    localStorage.setItem(MY_TOKEN_KEY, myToken);
    renderMyToken(0);
  } catch (error) {
    alert("Firebase is not configured correctly. Check firebase-config.js and Realtime Database rules.");
    console.error(error);
  }

  takeTokenBtn.disabled = false;
  takeTokenBtn.textContent = "Take Token";
});

clearMyTokenBtn.addEventListener("click", () => {
  localStorage.removeItem(MY_TOKEN_KEY);
  myToken = null;
  renderMyToken(0);
});
