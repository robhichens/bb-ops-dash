// ============================================================
// app.js — Main application logic
// Reads/writes all task data to Firestore in real time
// ============================================================

import { db } from "./firebase.js";
import { DEFAULT_TASKS } from "./data.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── Constants ───────────────────────────────────────────────
const TASKS_COLLECTION = "tasks";
const SITES = { cr: "Crozet", mc: "Mill Creek", fl: "Forest Lakes", all: "All sites" };
const CAT_ORDER = [
  "Website & Digital", "Marketing & Enrollment", "Legal / Incident",
  "Staffing / Leadership", "Staffing / Ratios", "Enrollment / Move-ups",
  "Operations / Tech", "Legal / HR", "HR / Benefits", "Training & Curriculum",
];

// ─── State ───────────────────────────────────────────────────
let tasks = [];
let nextId = 100; // Will be set from existing data
let expandedIds = {};
let collapsedCats = new Set(JSON.parse(localStorage.getItem("bb_collapsed_cats") || "[]"));
let unsubscribe = null;

// ─── Firestore helpers ───────────────────────────────────────
const tasksCol = () => collection(db, TASKS_COLLECTION);
const taskDoc = (id) => doc(db, TASKS_COLLECTION, String(id));

async function seedIfEmpty() {
  const snap = await getDocs(tasksCol());
  if (!snap.empty) return;
  console.log("Seeding Firestore with default tasks...");
  const batch = writeBatch(db);
  DEFAULT_TASKS.forEach((t) => {
    batch.set(doc(db, TASKS_COLLECTION, String(t.id)), t);
  });
  await batch.commit();
  console.log("Seed complete.");
}

function subscribeToTasks() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(tasksCol(), (snap) => {
    tasks = snap.docs.map((d) => ({ ...d.data(), id: String(d.id) }));
    // Keep nextId ahead of all existing numeric ids
    const numericIds = tasks.map((t) => parseInt(t.id, 10)).filter((n) => !isNaN(n));
    if (numericIds.length) nextId = Math.max(...numericIds) + 1;
    render();
    updateSaveLabel();
  });
}

async function persistTask(task) {
  await setDoc(taskDoc(task.id), task);
}

async function patchTask(id, fields) {
  await updateDoc(taskDoc(id), fields);
}

async function removeTask(id) {
  await deleteDoc(taskDoc(id));
}

// ─── UI helpers ──────────────────────────────────────────────
function siteLabel(s) { return SITES[s] || s; }

function siteBadge(s) {
  return `<span class="badge b-${s}">${siteLabel(s)}</span>`;
}

function statusBadge(s) {
  const map = {
    critical: ["b-crit", "Critical"],
    inprogress: ["b-prog", "In progress"],
    monitoring: ["b-mon", "Monitoring"],
    done: ["b-done", "Done"],
  };
  const [cls, lbl] = map[s] || ["b-all", s];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

function priorityFlag(p) {
  if (!p) return "";
  return `<span class="flag flag-${p}">P${p}</span>`;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

function updateSaveLabel() {
  const now = new Date();
  document.getElementById("last-save").textContent =
    `Rob Hichens · Synced ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function updateStats() {
  const c = { critical: 0, inprogress: 0, monitoring: 0, done: 0 };
  tasks.forEach((t) => (c[t.status] = (c[t.status] || 0) + 1));
  document.getElementById("s-crit").textContent = c.critical || 0;
  document.getElementById("s-prog").textContent = c.inprogress || 0;
  document.getElementById("s-mon").textContent = c.monitoring || 0;
  document.getElementById("s-done").textContent = c.done || 0;
}

function updateCatFilter() {
  const sel = document.getElementById("f-cat");
  const cur = sel.value;
  const cats = [...new Set(tasks.map((t) => t.category))].sort();
  sel.innerHTML =
    '<option value="">All categories</option>' +
    cats.map((c) => `<option${cur === c ? " selected" : ""}>${c}</option>`).join("");
}

function filtered() {
  const fs = document.getElementById("f-status").value;
  const fsi = document.getElementById("f-site").value;
  const fcat = document.getElementById("f-cat").value;
  const fq = document.getElementById("f-search").value.toLowerCase();
  return tasks.filter((t) => {
    if (fs && t.status !== fs) return false;
    if (fsi && t.site !== fsi) return false;
    if (fcat && t.category !== fcat) return false;
    if (fq && !(
      t.title.toLowerCase().includes(fq) ||
      (t.notes || "").toLowerCase().includes(fq) ||
      t.category.toLowerCase().includes(fq)
    )) return false;
    return true;
  });
}

// ─── Render ──────────────────────────────────────────────────
function render() {
  updateStats();
  updateCatFilter();
  const list = document.getElementById("task-list");
  const ft = filtered();

  if (!ft.length) {
    list.innerHTML = '<div class="empty">No tasks match this filter.</div>';
    return;
  }

  const groups = {};
  ft.forEach((t) => {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  });

  const cats = CAT_ORDER.filter((c) => groups[c]).concat(
    Object.keys(groups).filter((c) => !CAT_ORDER.includes(c))
  );

  let html = "";
  cats.forEach((cat) => {
    const key = "cat-" + encodeURIComponent(cat).replace(/%/g, "_");
    const isCollapsed = collapsedCats.has(cat);
    const count = groups[cat].length;

    html += `
      <div class="section-wrap">
        <div class="section-hd${isCollapsed ? " collapsed" : ""}" id="hd-${key}" data-cat="${cat}">
          <div class="section-hd-left">
            <span>${cat}</span>
            <span class="section-count">${count}</span>
          </div>
          <svg class="section-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M5 8l5 5 5-5"/>
          </svg>
        </div>
        <div class="section-body${isCollapsed ? " hidden" : ""}" id="body-${key}">`;

    groups[cat].forEach((t) => {
      html += `
        <div class="task-card${expandedIds[t.id] ? " expanded" : ""}" id="tc-${t.id}">
          <div class="task-top" data-task-id="${t.id}">
            <div class="task-priority p-${t.status}"></div>
            <div class="task-main">
              <div class="task-title-row">
                ${t.priority ? priorityFlag(t.priority) : ""}
                <span class="task-name">${t.title}</span>
              </div>
              <div class="task-meta">${statusBadge(t.status)} ${siteBadge(t.site)}</div>
            </div>
            <svg class="chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M5 8l5 5 5-5"/>
            </svg>
          </div>
          <div class="task-detail">
            <div class="detail-grid">
              <div class="det-row">
                <span class="det-label">Notes</span>
                <div style="flex:1">
                  <textarea class="note-area" id="note-${t.id}">${t.notes || ""}</textarea>
                  <div class="note-actions">
                    <button class="save-note" data-save-id="${t.id}">Save note</button>
                  </div>
                </div>
              </div>
              ${t.deps ? `<div class="det-row"><span class="det-label">Dependencies</span><span class="det-val dep-text">${t.deps}</span></div>` : ""}
              <div class="det-row">
                <span class="det-label">Status</span>
                <div class="status-btns">
                  <button class="sb${t.status === "critical" ? " active-critical" : ""}" data-set-status="${t.id}|critical">Critical</button>
                  <button class="sb${t.status === "inprogress" ? " active-inprogress" : ""}" data-set-status="${t.id}|inprogress">In progress</button>
                  <button class="sb${t.status === "monitoring" ? " active-monitoring" : ""}" data-set-status="${t.id}|monitoring">Monitoring</button>
                  <button class="sb${t.status === "done" ? " active-done" : ""}" data-set-status="${t.id}|done">Done</button>
                </div>
              </div>
              <div class="det-row">
                <span class="det-label"></span>
                <button class="del-btn" data-delete-id="${t.id}">Delete task</button>
              </div>
            </div>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  });

  list.innerHTML = html;
  bindListEvents();
}

// ─── Event delegation ─────────────────────────────────────────
function bindListEvents() {
  const list = document.getElementById("task-list");

  // Section header collapse
  list.querySelectorAll(".section-hd").forEach((el) => {
    el.addEventListener("click", () => {
      const cat = el.dataset.cat;
      const key = "cat-" + encodeURIComponent(cat).replace(/%/g, "_");
      const body = document.getElementById("body-" + key);
      if (collapsedCats.has(cat)) {
        collapsedCats.delete(cat);
        el.classList.remove("collapsed");
        body.classList.remove("hidden");
      } else {
        collapsedCats.add(cat);
        el.classList.add("collapsed");
        body.classList.add("hidden");
      }
      localStorage.setItem("bb_collapsed_cats", JSON.stringify([...collapsedCats]));
    });
  });

  // Task card expand/collapse
  list.querySelectorAll(".task-top").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.taskId;
      expandedIds[id] = !expandedIds[id];
      const card = document.getElementById("tc-" + id);
      if (card) card.classList.toggle("expanded", expandedIds[id]);
    });
  });

  // Save note
  list.querySelectorAll("[data-save-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.saveId;
      const val = document.getElementById("note-" + id).value;
      patchTask(id, { notes: val })
        .then(() => showToast("Note saved"))
        .catch(() => showToast("Error saving note"));
    });
  });

  // Set status
  list.querySelectorAll("[data-set-status]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [id, status] = btn.dataset.setStatus.split("|");
      patchTask(id, { status })
        .then(() => showToast("Status updated"))
        .catch(() => showToast("Error updating status"));
    });
  });

  // Delete
  list.querySelectorAll("[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!confirm("Delete this task?")) return;
      const id = btn.dataset.deleteId;
      removeTask(id)
        .then(() => showToast("Task deleted"))
        .catch(() => showToast("Error deleting task"));
    });
  });
}

// ─── Add task modal ───────────────────────────────────────────
export function openModal() {
  document.getElementById("modal").classList.add("open");
  document.getElementById("m-title").focus();
}

export function closeModal() {
  document.getElementById("modal").classList.remove("open");
}

export async function addTask() {
  const title = document.getElementById("m-title").value.trim();
  if (!title) { alert("Please enter a task title."); return; }

  const task = {
    id: String(nextId++),
    title,
    status: document.getElementById("m-status").value,
    site: document.getElementById("m-site").value,
    category: document.getElementById("m-cat").value,
    priority: document.getElementById("m-priority").value,
    notes: document.getElementById("m-notes").value,
    deps: document.getElementById("m-deps").value,
  };

  try {
    await persistTask(task);
    closeModal();
    document.getElementById("m-title").value = "";
    document.getElementById("m-notes").value = "";
    document.getElementById("m-deps").value = "";
    showToast("Task added");
  } catch {
    showToast("Error adding task");
  }
}

// ─── Export ───────────────────────────────────────────────────
export function exportData() {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "bb_ops_tasks_" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
}

// ─── Filter change ────────────────────────────────────────────
export function onFilterChange() { render(); }

// ─── Init ─────────────────────────────────────────────────────
export async function init() {
  await seedIfEmpty();
  subscribeToTasks();

  // Modal overlay click to close
  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal")) closeModal();
  });

  // Enter in title field
  document.getElementById("m-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });

  // Filter listeners
  ["f-status", "f-site", "f-cat"].forEach((id) => {
    document.getElementById(id).addEventListener("change", render);
  });
  document.getElementById("f-search").addEventListener("input", render);
}
