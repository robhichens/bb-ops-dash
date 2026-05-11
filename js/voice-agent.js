import { db } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const TASKS_COLLECTION = "tasks";
const tasksCol = () => collection(db, TASKS_COLLECTION);
const taskDoc = (id) => doc(db, TASKS_COLLECTION, String(id));

let conversationHistory = [];
let recognition = null;
let isRecording = false;
let panelOpen = false;
let speechAvailable = false;

try {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-ZA";
    speechAvailable = true;
  }
} catch {
  speechAvailable = false;
}

function getElements() {
  return {
    micBtn: document.getElementById("voice-mic-btn"),
    panel: document.getElementById("voice-panel"),
    chatBody: document.getElementById("voice-chat-body"),
    textInput: document.getElementById("voice-text-input"),
    sendBtn: document.getElementById("voice-send-btn"),
    closeBtn: document.getElementById("voice-close-btn"),
  };
}

async function getCurrentTasks() {
  try {
    const snap = await getDocs(tasksCol());
    const tasks = snap.docs.map((d) => d.data());
    return tasks
      .filter((t) => t.status !== "done")
      .map((t) => `- [${t.status}] ${t.title} (${t.category}, ${t.site})`)
      .join("\n");
  } catch {
    return "";
  }
}

async function getNextId() {
  const snap = await getDocs(tasksCol());
  const ids = snap.docs.map((d) => parseInt(d.id, 10)).filter((n) => !isNaN(n));
  return ids.length ? Math.max(...ids) + 1 : 100;
}

function appendMessage(role, text) {
  const { chatBody } = getElements();
  const div = document.createElement("div");
  div.className = `voice-msg voice-msg-${role}`;
  div.textContent = text;
  chatBody.appendChild(div);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function appendTaskPreview(taskData) {
  const { chatBody } = getElements();
  const SITES = { cr: "Crozet", mc: "Mill Creek", fl: "Forest Lakes", all: "All sites" };
  const STATUSES = { new: "New", critical: "Critical", inprogress: "In progress", monitoring: "Monitoring", done: "Done" };

  const card = document.createElement("div");
  card.className = "voice-task-preview";
  card.innerHTML = `
    <div class="voice-preview-title">${taskData.title || "Untitled"}</div>
    <div class="voice-preview-fields">
      <span class="voice-preview-field"><strong>Category:</strong> ${taskData.category || "—"}</span>
      <span class="voice-preview-field"><strong>Site:</strong> ${SITES[taskData.site] || taskData.site || "—"}</span>
      <span class="voice-preview-field"><strong>Status:</strong> ${STATUSES[taskData.status] || taskData.status || "—"}</span>
      <span class="voice-preview-field"><strong>Priority:</strong> ${taskData.priority ? "P" + taskData.priority : "None"}</span>
      <span class="voice-preview-field"><strong>Due:</strong> ${taskData.dueDate || "None"}</span>
      ${taskData.notes ? `<span class="voice-preview-field voice-preview-notes"><strong>Notes:</strong> ${taskData.notes}</span>` : ""}
    </div>
    <button class="voice-add-task-btn">Add task</button>
  `;

  const addBtn = card.querySelector(".voice-add-task-btn");
  addBtn.addEventListener("click", () => createTask(taskData, card));

  chatBody.appendChild(card);
  chatBody.scrollTop = chatBody.scrollHeight;
}

async function createTask(taskData, cardEl) {
  try {
    const nextId = await getNextId();
    const snap = await getDocs(tasksCol());
    const tasks = snap.docs.map((d) => d.data());

    let order;
    if (taskData.status === "done") {
      const doneTasks = tasks.filter((t) => t.status === "done");
      order = doneTasks.reduce((m, t) => Math.max(m, typeof t.order === "number" ? t.order : 0), -1) + 1;
    } else {
      const peerTasks = tasks.filter((t) => t.category === taskData.category && t.status !== "done");
      const minOrder = peerTasks.reduce((m, t) => Math.min(m, typeof t.order === "number" ? t.order : 1e9), Infinity);
      order = minOrder === Infinity ? 0 : minOrder - 1;
    }

    const task = {
      id: String(nextId),
      title: taskData.title || "Untitled task",
      status: taskData.status || "new",
      site: taskData.site || "all",
      category: taskData.category || "Operations / Tech",
      priority: taskData.priority || "",
      notes: taskData.notes || "",
      deps: "",
      dueDate: taskData.dueDate || "",
      order,
      updatedAt: Timestamp.now(),
    };

    await setDoc(taskDoc(task.id), task);

    cardEl.querySelector(".voice-add-task-btn").textContent = "Added!";
    cardEl.querySelector(".voice-add-task-btn").disabled = true;
    cardEl.classList.add("voice-task-added");

    showVoiceToast("Task added");
  } catch {
    showVoiceToast("Error adding task");
  }
}

function showVoiceToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function parseTaskFromResponse(text) {
  const match = text.match(/<task>([\s\S]*?)<\/task>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1].trim());
  } catch {
    return null;
  }
}

function stripTaskTags(text) {
  return text.replace(/<task>[\s\S]*?<\/task>/g, "").trim();
}

async function sendMessage(text) {
  if (!text.trim()) return;

  appendMessage("user", text);
  conversationHistory.push({ role: "user", content: text });

  const { sendBtn, textInput } = getElements();
  sendBtn.disabled = true;
  textInput.disabled = true;

  const thinkingDiv = document.createElement("div");
  thinkingDiv.className = "voice-msg voice-msg-thinking";
  thinkingDiv.textContent = "Thinking...";
  const { chatBody } = getElements();
  chatBody.appendChild(thinkingDiv);
  chatBody.scrollTop = chatBody.scrollHeight;

  try {
    const taskContext = await getCurrentTasks();

    const res = await fetch("/api/voice-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: conversationHistory,
        taskContext,
      }),
    });

    if (!res.ok) throw new Error("API request failed");

    const data = await res.json();
    const responseText = data.response;

    thinkingDiv.remove();

    conversationHistory.push({ role: "assistant", content: responseText });

    const taskData = parseTaskFromResponse(responseText);
    const displayText = stripTaskTags(responseText);

    if (displayText) {
      appendMessage("assistant", displayText);
    }

    if (taskData) {
      appendTaskPreview(taskData);
    }
  } catch {
    thinkingDiv.remove();
    appendMessage("assistant", "Sorry, something went wrong. Please try again.");
  }

  sendBtn.disabled = false;
  textInput.disabled = false;
  textInput.focus();
}

function togglePanel(show) {
  const { panel, micBtn } = getElements();
  panelOpen = show;
  panel.classList.toggle("voice-panel-open", show);
  micBtn.classList.toggle("voice-mic-active", show);
}

let liveTranscriptEl = null;
let finalTranscript = "";
let lastConfidence = 1;

function showLiveTranscript(text) {
  const { chatBody } = getElements();
  if (!liveTranscriptEl) {
    liveTranscriptEl = document.createElement("div");
    liveTranscriptEl.className = "voice-msg voice-msg-user voice-msg-live";
    chatBody.appendChild(liveTranscriptEl);
  }
  liveTranscriptEl.textContent = text || "Listening...";
  chatBody.scrollTop = chatBody.scrollHeight;
}

function removeLiveTranscript() {
  if (liveTranscriptEl) {
    liveTranscriptEl.remove();
    liveTranscriptEl = null;
  }
}

function showConfidenceHint(confidence) {
  const { chatBody } = getElements();
  const existing = chatBody.querySelector(".voice-confidence-hint");
  if (existing) existing.remove();

  if (confidence < 0.8) {
    const hint = document.createElement("div");
    hint.className = "voice-confidence-hint";
    hint.textContent = confidence < 0.5
      ? "Low confidence — please review and edit before sending"
      : "Check the transcript below and edit if needed";
    chatBody.appendChild(hint);
    chatBody.scrollTop = chatBody.scrollHeight;
  }
}

function startRecording() {
  if (!recognition || isRecording) return;

  const { micBtn } = getElements();
  isRecording = true;
  finalTranscript = "";
  lastConfidence = 1;
  micBtn.classList.add("voice-mic-recording");
  showLiveTranscript("Listening...");

  recognition.onresult = (event) => {
    let interim = "";
    finalTranscript = "";
    let totalConfidence = 0;
    let finalCount = 0;
    for (let i = 0; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
        totalConfidence += event.results[i][0].confidence;
        finalCount++;
      } else {
        interim += event.results[i][0].transcript;
      }
    }
    if (finalCount > 0) lastConfidence = totalConfidence / finalCount;
    showLiveTranscript(finalTranscript + interim || "Listening...");
  };

  recognition.onerror = (e) => {
    if (e.error === "no-speech") {
      showLiveTranscript("No speech detected — try again");
      setTimeout(() => {
        removeLiveTranscript();
      }, 1500);
    } else {
      removeLiveTranscript();
    }
    isRecording = false;
    micBtn.classList.remove("voice-mic-recording");
  };

  recognition.onend = () => {
    if (isRecording) {
      recognition.start();
      return;
    }
    micBtn.classList.remove("voice-mic-recording");
  };

  recognition.start();
}

function stopRecording() {
  if (!recognition || !isRecording) return;
  isRecording = false;
  recognition.stop();
  const { micBtn, textInput } = getElements();
  micBtn.classList.remove("voice-mic-recording");

  const text = finalTranscript.trim();
  removeLiveTranscript();
  if (text) {
    textInput.value = text;
    textInput.focus();
    textInput.classList.add("voice-review-active");
    showConfidenceHint(lastConfidence);
  }
  finalTranscript = "";
}

export function initVoiceAgent() {
  const { micBtn, panel, textInput, sendBtn, closeBtn } = getElements();

  if (!speechAvailable) {
    micBtn.classList.add("voice-mic-novoice");
  }

  micBtn.addEventListener("click", () => {
    if (!panelOpen) {
      togglePanel(true);
      if (conversationHistory.length === 0) {
        appendMessage("assistant", speechAvailable
          ? "Hi Rob! Tap the mic to speak — your words will appear in the text box so you can review and edit before sending."
          : "Hi Rob! Voice is not available in this browser — type your task below.");
      }
      if (speechAvailable) {
        startRecording();
      } else {
        textInput.focus();
      }
    } else if (speechAvailable) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  });

  closeBtn.addEventListener("click", () => {
    togglePanel(false);
    stopRecording();
  });

  sendBtn.addEventListener("click", () => {
    textInput.classList.remove("voice-review-active");
    const hint = document.querySelector(".voice-confidence-hint");
    if (hint) hint.remove();
    sendMessage(textInput.value);
    textInput.value = "";
  });

  textInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      textInput.classList.remove("voice-review-active");
      const hint = document.querySelector(".voice-confidence-hint");
      if (hint) hint.remove();
      sendMessage(textInput.value);
      textInput.value = "";
    }
  });
}
