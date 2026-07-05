const QUEUE_KEY = "smartQueueData";
const CURRENT_KEY = "smartQueueCurrent";
const MY_TOKEN_KEY = "smartQueueMyToken";
const AVG_SERVICE_TIME = 3; // minutes per person

function getQueue() {
  return JSON.parse(localStorage.getItem(QUEUE_KEY)) || [];
}

function saveQueue(queue) {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function getCurrentToken() {
  return localStorage.getItem(CURRENT_KEY) || "";
}

function setCurrentToken(token) {
  localStorage.setItem(CURRENT_KEY, token || "");
}

function formatToken(number) {
  return "T-" + String(number).padStart(3, "0");
}

function takeToken() {
  const name = document.getElementById("userName").value.trim();
  const phone = document.getElementById("userPhone").value.trim();
  const purpose = document.getElementById("userPurpose").value;

  if (!name || !phone) {
    alert("Please enter your name and mobile number.");
    return;
  }

  const queue = getQueue();
  const nextNumber = queue.length + 1;
  const token = formatToken(nextNumber);

  const entry = {
    token,
    name,
    phone,
    purpose,
    status: "waiting",
    createdAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };

  queue.push(entry);
  saveQueue(queue);
  localStorage.setItem(MY_TOKEN_KEY, token);
  showMyToken();
}

function showMyToken() {
  const token = localStorage.getItem(MY_TOKEN_KEY);
  if (!token) return;

  const formCard = document.getElementById("formCard");
  const tokenCard = document.getElementById("tokenCard");
  if (!formCard || !tokenCard) return;

  const queue = getQueue();
  const myEntry = queue.find(item => item.token === token);

  formCard.classList.add("hidden");
  tokenCard.classList.remove("hidden");
  document.getElementById("tokenNumber").innerText = token;

  if (!myEntry) {
    document.getElementById("statusText").innerText = "Your token is no longer active.";
    document.getElementById("peopleAhead").innerText = "-";
    document.getElementById("waitTime").innerText = "-";
    document.getElementById("alertBox").innerText = "Your token may have been reset by admin.";
    return;
  }

  const waitingQueue = queue.filter(item => item.status === "waiting");
  const myIndex = waitingQueue.findIndex(item => item.token === token);
  const current = getCurrentToken();

  if (myEntry.status === "called" || current === token) {
    document.getElementById("statusText").innerText = "Your token has been called.";
    document.getElementById("peopleAhead").innerText = "0";
    document.getElementById("waitTime").innerText = "Now";
    document.getElementById("alertBox").innerText = "Please go to the counter now.";
  } else if (myEntry.status === "served") {
    document.getElementById("statusText").innerText = "Your service is completed.";
    document.getElementById("alertBox").innerText = "Thank you for visiting.";
  } else if (myEntry.status === "skipped") {
    document.getElementById("statusText").innerText = "Your token was skipped.";
    document.getElementById("alertBox").innerText = "Please contact the help desk.";
  } else if (myEntry.status === "cancelled") {
    document.getElementById("statusText").innerText = "Your token was cancelled.";
    document.getElementById("alertBox").innerText = "Generate a new token if needed.";
  } else {
    const peopleAhead = myIndex >= 0 ? myIndex : 0;
    document.getElementById("statusText").innerText = "You are waiting in queue.";
    document.getElementById("peopleAhead").innerText = peopleAhead;
    document.getElementById("waitTime").innerText = peopleAhead * AVG_SERVICE_TIME + " min";

    if (peopleAhead <= 2) {
      document.getElementById("alertBox").innerText = "Your turn is coming soon. Please stay nearby.";
    } else {
      document.getElementById("alertBox").innerText = "Keep this page open to see live updates.";
    }
  }
}

function cancelMyToken() {
  const token = localStorage.getItem(MY_TOKEN_KEY);
  if (!token) return;
  const queue = getQueue();
  const item = queue.find(q => q.token === token);
  if (item && item.status === "waiting") item.status = "cancelled";
  saveQueue(queue);
  localStorage.removeItem(MY_TOKEN_KEY);
  location.reload();
}

function callNextToken() {
  const queue = getQueue();
  const current = getCurrentToken();

  if (current) {
    const active = queue.find(item => item.token === current);
    if (active && active.status === "called") {
      alert("First mark current token as served or skipped.");
      return;
    }
  }

  const next = queue.find(item => item.status === "waiting");
  if (!next) {
    alert("No waiting tokens available.");
    return;
  }

  next.status = "called";
  setCurrentToken(next.token);
  saveQueue(queue);
  renderAdmin();
}

function markServed() {
  const current = getCurrentToken();
  if (!current) return alert("No current token selected.");
  const queue = getQueue();
  const item = queue.find(q => q.token === current);
  if (item) item.status = "served";
  setCurrentToken("");
  saveQueue(queue);
  renderAdmin();
}

function skipCurrent() {
  const current = getCurrentToken();
  if (!current) return alert("No current token selected.");
  const queue = getQueue();
  const item = queue.find(q => q.token === current);
  if (item) item.status = "skipped";
  setCurrentToken("");
  saveQueue(queue);
  renderAdmin();
}

function resetQueue() {
  if (!confirm("Are you sure you want to reset the complete queue?")) return;
  localStorage.removeItem(QUEUE_KEY);
  localStorage.removeItem(CURRENT_KEY);
  localStorage.removeItem(MY_TOKEN_KEY);
  renderAdmin();
}

function renderAdmin() {
  const queue = getQueue();
  const table = document.getElementById("queueTable");
  if (!table) return;

  const current = getCurrentToken();
  document.getElementById("currentToken").innerText = current || "None";
  document.getElementById("waitingCount").innerText = queue.filter(q => q.status === "waiting").length;
  document.getElementById("servedCount").innerText = queue.filter(q => q.status === "served").length;
  document.getElementById("skippedCount").innerText = queue.filter(q => q.status === "skipped").length;
  document.getElementById("lastUpdated").innerText = "Updated " + new Date().toLocaleTimeString();

  table.innerHTML = "";

  if (queue.length === 0) {
    table.innerHTML = `<tr><td colspan="6">No tokens generated yet.</td></tr>`;
    return;
  }

  queue.slice().reverse().forEach(item => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${item.token}</strong></td>
      <td>${item.name}</td>
      <td>${item.phone}</td>
      <td>${item.purpose}</td>
      <td><span class="status ${item.status}">${item.status}</span></td>
      <td>${item.createdAt}</td>
    `;
    table.appendChild(row);
  });
}

window.addEventListener("storage", () => {
  showMyToken();
  renderAdmin();
});

setInterval(() => {
  showMyToken();
  renderAdmin();
}, 2000);

document.addEventListener("DOMContentLoaded", () => {
  showMyToken();
  renderAdmin();
});
