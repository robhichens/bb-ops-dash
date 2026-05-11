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
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ─── Constants ───────────────────────────────────────────────
const TASKS_COLLECTION = "tasks";
const SITES = { cr: "Crozet", mc: "Mill Creek", fl: "Forest Lakes", all: "All sites" };
const CAT_ORDER = [
  "Website & Digital", "Marketing & Enrollment", "Legal / Incident",
  "Training and Professional Development", "Hiring & Onboarding", "Enrollment / Move-ups",
  "Operations / Tech", "Legal / HR", "HR / Benefits", "Playground Projects",
  "Classroom Projects", "Events and Community",
];
const DONE_KEY = "__done__";

// ─── State ───────────────────────────────────────────────────
let tasks = [];
let nextId = 100;
let expandedIds = {};
let collapsedCats = new Set(JSON.parse(localStorage.getItem("bb_collapsed_cats") || "[]"));
let categoryOrder = JSON.parse(localStorage.getItem("bb_cat_order") || "null");
let doneCollapsed = true; // session-only — resets on every app open
let dragData = null;
let unsubscribe = null;

// ─── Firestore helpers ───────────────────────────────────────
const tasksCol = () => collection(db, TASKS_COLLECTION);
const taskDoc = (id) => doc(db, TASKS_COLLECTION, String(id));

async function seedIfEmpty() {
  const snap = await getDocs(tasksCol());
  if (!snap.empty) return;
  const batch = writeBatch(db);
  const counters = {};
  DEFAULT_TASKS.forEach((t) => {
    const idx = counters[t.category] || 0;
    counters[t.category] = idx + 1;
    batch.set(doc(db, TASKS_COLLECTION, String(t.id)), {
      ...t, dueDate: "", order: idx, updatedAt: Timestamp.now(),
    });
  });
  await batch.commit();
}

function subscribeToTasks() {
  if (unsubscribe) unsubscribe();
  unsubscribe = onSnapshot(tasksCol(), (snap) => {
    tasks = snap.docs.map((d) => ({ ...d.data(), id: String(d.id) }));
    const numericIds = tasks.map((t) => parseInt(t.id, 10)).filter((n) => !isNaN(n));
    if (numericIds.length) nextId = Math.max(...numericIds) + 1;
    render();
    updateSaveLabel();
  });
}

async function persistTask(task) {
  await setDoc(taskDoc(task.id), { ...task, updatedAt: Timestamp.now() });
}

async function patchTask(id, fields) {
  await updateDoc(taskDoc(id), { ...fields, updatedAt: Timestamp.now() });
}

async function removeTask(id) {
  await deleteDoc(taskDoc(id));
}

// ─── Date helpers ────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const diff = Math.floor((new Date() - d) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dueDateBadge(iso) {
  if (!iso) return "";
  const due = new Date(iso + "T00:00:00");
  const days = Math.ceil((due - new Date()) / 86400000);
  if (days < 0) return `<span class="due-badge due-overdue">Overdue · ${formatDate(iso)}</span>`;
  if (days === 0) return `<span class="due-badge due-today">Due today</span>`;
  if (days <= 3) return `<span class="due-badge due-soon">Due ${formatDate(iso)}</span>`;
  return `<span class="due-badge due-upcoming">Due ${formatDate(iso)}</span>`;
}

// ─── UI helpers ──────────────────────────────────────────────
function siteLabel(s) { return SITES[s] || s; }
function siteBadge(s) { return `<span class="badge b-${s}">${siteLabel(s)}</span>`; }

function statusBadge(s) {
  const map = {
    new: ["b-new", "New"],
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
  const c = { new: 0, critical: 0, inprogress: 0, monitoring: 0, done: 0 };
  tasks.forEach((t) => (c[t.status] = (c[t.status] || 0) + 1));
  document.getElementById("s-new").textContent = c.new || 0;
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

// ─── Ordering helpers ────────────────────────────────────────
function taskOrderVal(t) {
  if (typeof t.order === "number") return t.order;
  const n = parseInt(t.id, 10);
  return isNaN(n) ? 1e9 : n;
}

function sortByOrder(arr) {
  return [...arr].sort((a, b) => {
    const ao = taskOrderVal(a);
    const bo = taskOrderVal(b);
    if (ao !== bo) return ao - bo;
    return parseInt(a.id, 10) - parseInt(b.id, 10);
  });
}

function getCategoryOrder(catSet) {
  let order = (categoryOrder && Array.isArray(categoryOrder)) ? [...categoryOrder] : [...CAT_ORDER];
  catSet.forEach((c) => { if (!order.includes(c)) order.push(c); });
  return order.filter((c) => catSet.has(c));
}

function saveCategoryOrder(order) {
  categoryOrder = order;
  localStorage.setItem("bb_cat_order", JSON.stringify(order));
}

// ─── Render ──────────────────────────────────────────────────
function renderTaskCard(t) {
  const updatedStr = t.updatedAt ? formatTimestamp(t.updatedAt) : "";
  return `
    <div class="task-card${expandedIds[t.id] ? " expanded" : ""}${t.status === "done" ? " is-done" : ""}${t.status === "new" ? " is-new" : ""}" id="tc-${t.id}" data-task-id="${t.id}" data-task-cat="${t.category}">
      <div class="task-top">
        <span class="drag-handle task-drag" title="Drag to reorder">⋮⋮</span>
        <div class="task-priority p-${t.status}"></div>
        <div class="task-main">
          <div class="task-title-row">
            ${t.priority ? priorityFlag(t.priority) : ""}
            <span class="task-name">${t.title}</span>
          </div>
          <div class="task-meta">
            ${statusBadge(t.status)}
            ${siteBadge(t.site)}
            ${t.dueDate ? dueDateBadge(t.dueDate) : ""}
            ${updatedStr ? `<span class="updated-at">updated ${updatedStr}</span>` : ""}
          </div>
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
          <div class="det-row">
            <span class="det-label">Due date</span>
            <div style="display:flex;align-items:center;gap:10px;flex:1">
              <input type="date" class="due-input" id="due-${t.id}" value="${t.dueDate || ""}" data-due-id="${t.id}">
              ${t.dueDate ? `<button class="clear-due" data-clear-due="${t.id}">Clear</button>` : ""}
            </div>
          </div>
          ${t.deps ? `<div class="det-row"><span class="det-label">Dependencies</span><span class="det-val dep-text">${t.deps}</span></div>` : ""}
          <div class="det-row">
            <span class="det-label">Status</span>
            <div class="status-btns">
              <button class="sb${t.status === "new" ? " active-new" : ""}" data-set-status="${t.id}|new">New</button>
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
}

function render() {
  updateStats();
  updateCatFilter();
  const list = document.getElementById("task-list");
  const ft = filtered();

  if (!ft.length) {
    list.innerHTML = '<div class="empty">No tasks match this filter.</div>';
    return;
  }

  const doneTasks = sortByOrder(ft.filter((t) => t.status === "done"));
  const activeTasks = ft.filter((t) => t.status !== "done");

  const groups = {};
  activeTasks.forEach((t) => {
    if (!groups[t.category]) groups[t.category] = [];
    groups[t.category].push(t);
  });

  const cats = getCategoryOrder(new Set(Object.keys(groups)));

  let html = "";
  cats.forEach((cat) => {
    const sorted = sortByOrder(groups[cat]);
    const key = "cat-" + encodeURIComponent(cat).replace(/%/g, "_");
    const isCollapsed = collapsedCats.has(cat);

    html += `
      <div class="section-wrap" data-cat-wrap="${cat}">
        <div class="section-hd${isCollapsed ? " collapsed" : ""}" id="hd-${key}" data-cat="${cat}">
          <div class="section-hd-left">
            <span class="drag-handle cat-drag" title="Drag to reorder category">⋮⋮</span>
            <span>${cat}</span>
            <span class="section-count">${sorted.length}</span>
          </div>
          <svg class="section-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M5 8l5 5 5-5"/>
          </svg>
        </div>
        <div class="section-body${isCollapsed ? " hidden" : ""}" id="body-${key}" data-cat-body="${cat}">`;

    sorted.forEach((t) => { html += renderTaskCard(t); });

    html += `</div></div>`;
  });

  if (doneTasks.length) {
    html += `
      <div class="section-wrap done-wrap">
        <div class="section-hd done-hd${doneCollapsed ? " collapsed" : ""}" data-cat="${DONE_KEY}">
          <div class="section-hd-left">
            <span>Done</span>
            <span class="section-count">${doneTasks.length}</span>
          </div>
          <svg class="section-chevron" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M5 8l5 5 5-5"/>
          </svg>
        </div>
        <div class="section-body${doneCollapsed ? " hidden" : ""}" id="body-done">`;
    doneTasks.forEach((t) => { html += renderTaskCard(t); });
    html += `</div></div>`;
  }

  list.innerHTML = html;
  bindListEvents();
}

// ─── Drag & drop helpers ─────────────────────────────────────
async function handleTaskDrop(draggedId, targetId, targetCat, before) {
  const dragged = tasks.find((t) => t.id === draggedId);
  if (!dragged) return;
  if (draggedId === targetId) return;

  let catTasks = sortByOrder(
    tasks.filter((t) => t.category === targetCat && t.status !== "done" && t.id !== draggedId)
  );

  let insertIndex = catTasks.length;
  if (targetId) {
    const idx = catTasks.findIndex((t) => t.id === targetId);
    if (idx >= 0) insertIndex = before ? idx : idx + 1;
  }
  catTasks.splice(insertIndex, 0, dragged);

  try {
    const batch = writeBatch(db);
    catTasks.forEach((t, i) => {
      const updates = { order: i };
      if (t.id === draggedId) {
        if (targetCat !== dragged.category) updates.category = targetCat;
        updates.updatedAt = Timestamp.now();
      }
      batch.update(taskDoc(t.id), updates);
    });
    await batch.commit();
  } catch {
    showToast("Error reordering");
  }
}

function handleCatDrop(draggedCat, targetCat, before) {
  if (draggedCat === targetCat) return;
  const allCats = new Set(tasks.map((t) => t.category));
  let order = (categoryOrder && Array.isArray(categoryOrder)) ? [...categoryOrder] : [...CAT_ORDER];
  allCats.forEach((c) => { if (!order.includes(c)) order.push(c); });
  order = order.filter((c) => c !== draggedCat);
  const idx = order.indexOf(targetCat);
  if (idx < 0) order.push(draggedCat);
  else order.splice(before ? idx : idx + 1, 0, draggedCat);
  saveCategoryOrder(order);
  render();
}

function clearDropIndicators() {
  document.querySelectorAll(".drop-before, .drop-after, .cat-drop-before, .cat-drop-after")
    .forEach((el) => el.classList.remove("drop-before", "drop-after", "cat-drop-before", "cat-drop-after"));
}

// ─── Event delegation ─────────────────────────────────────────
function bindListEvents() {
  const list = document.getElementById("task-list");

  // Section header click → toggle collapse (skip clicks on drag handle)
  list.querySelectorAll(".section-hd").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      const cat = el.dataset.cat;
      if (cat === DONE_KEY) {
        doneCollapsed = !doneCollapsed;
        const body = document.getElementById("body-done");
        el.classList.toggle("collapsed", doneCollapsed);
        if (body) body.classList.toggle("hidden", doneCollapsed);
        return;
      }
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

  // Task expand/collapse on click of task-top (skip clicks on drag handle)
  list.querySelectorAll(".task-top").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      const card = el.closest(".task-card");
      const id = card.dataset.taskId;
      expandedIds[id] = !expandedIds[id];
      card.classList.toggle("expanded", expandedIds[id]);
    });
  });

  // ── Drag handles arm parent for native HTML5 drag ──
  list.querySelectorAll(".task-drag").forEach((handle) => {
    const card = handle.closest(".task-card");
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      card.draggable = true;
    });
    handle.addEventListener("click", (e) => e.stopPropagation());
  });

  list.querySelectorAll(".cat-drag").forEach((handle) => {
    const wrap = handle.closest(".section-wrap");
    handle.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      wrap.draggable = true;
    });
    handle.addEventListener("click", (e) => e.stopPropagation());
  });

  // ── Task drag/drop ──
  list.querySelectorAll(".task-card").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      if (!card.draggable) { e.preventDefault(); return; }
      dragData = { type: "task", id: card.dataset.taskId, fromCat: card.dataset.taskCat };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.taskId);
      card.classList.add("dragging");
      e.stopPropagation();
    });
    card.addEventListener("dragend", () => {
      card.draggable = false;
      card.classList.remove("dragging");
      clearDropIndicators();
      dragData = null;
    });
    card.addEventListener("dragover", (e) => {
      if (!dragData || dragData.type !== "task") return;
      if (card.dataset.taskId === dragData.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = card.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      card.classList.toggle("drop-before", before);
      card.classList.toggle("drop-after", !before);
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drop-before", "drop-after");
    });
    card.addEventListener("drop", async (e) => {
      if (!dragData || dragData.type !== "task") return;
      e.preventDefault();
      e.stopPropagation();
      const rect = card.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      const targetCat = card.dataset.taskCat;
      const targetId = card.dataset.taskId;
      const draggedId = dragData.id;
      clearDropIndicators();
      // Don't allow dropping a non-done task into the Done section via card-drop;
      // dropping onto a done card just reorders within done — but we treat done as
      // special: tasks in done section share status "done", so reordering only
      // shuffles within the active category. Skip cross-status drops here.
      const draggedTask = tasks.find((t) => t.id === draggedId);
      if (draggedTask && draggedTask.status === "done") {
        // Reorder among done tasks only — share order field
        await reorderDoneTasks(draggedId, targetId, before);
      } else {
        await handleTaskDrop(draggedId, targetId, targetCat, before);
      }
    });
  });

  // Drop on empty section body (catch-all when not over a card)
  list.querySelectorAll(".section-body[data-cat-body]").forEach((body) => {
    body.addEventListener("dragover", (e) => {
      if (!dragData || dragData.type !== "task") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    body.addEventListener("drop", async (e) => {
      if (!dragData || dragData.type !== "task") return;
      e.preventDefault();
      const cat = body.dataset.catBody;
      const draggedTask = tasks.find((t) => t.id === dragData.id);
      if (draggedTask && draggedTask.status === "done") return; // ignore
      await handleTaskDrop(dragData.id, null, cat, false);
    });
  });

  // ── Category drag/drop on section-wrap ──
  list.querySelectorAll(".section-wrap[data-cat-wrap]").forEach((wrap) => {
    wrap.addEventListener("dragstart", (e) => {
      if (!wrap.draggable) { e.preventDefault(); return; }
      dragData = { type: "cat", cat: wrap.dataset.catWrap };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "cat:" + wrap.dataset.catWrap);
      wrap.classList.add("dragging");
      e.stopPropagation();
    });
    wrap.addEventListener("dragend", () => {
      wrap.draggable = false;
      wrap.classList.remove("dragging");
      clearDropIndicators();
      dragData = null;
    });
    wrap.addEventListener("dragover", (e) => {
      if (!dragData || dragData.type !== "cat") return;
      if (wrap.dataset.catWrap === dragData.cat) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = wrap.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      wrap.classList.toggle("cat-drop-before", before);
      wrap.classList.toggle("cat-drop-after", !before);
    });
    wrap.addEventListener("dragleave", () => {
      wrap.classList.remove("cat-drop-before", "cat-drop-after");
    });
    wrap.addEventListener("drop", (e) => {
      if (!dragData || dragData.type !== "cat") return;
      e.preventDefault();
      e.stopPropagation();
      const rect = wrap.getBoundingClientRect();
      const before = (e.clientY - rect.top) < rect.height / 2;
      clearDropIndicators();
      handleCatDrop(dragData.cat, wrap.dataset.catWrap, before);
    });
  });

  // Form interactions
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

  list.querySelectorAll("[data-due-id]").forEach((input) => {
    input.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = input.dataset.dueId;
      patchTask(id, { dueDate: input.value })
        .then(() => showToast("Due date saved"))
        .catch(() => showToast("Error saving due date"));
    });
  });

  list.querySelectorAll("[data-clear-due]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.clearDue;
      patchTask(id, { dueDate: "" })
        .then(() => showToast("Due date cleared"))
        .catch(() => showToast("Error clearing due date"));
    });
  });

  list.querySelectorAll("[data-set-status]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const [id, status] = btn.dataset.setStatus.split("|");
      handleStatusChange(id, status);
    });
  });

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

// When a task's status changes, also drop it to the bottom of done if newly done,
// or to the bottom of its category if reactivated.
async function handleStatusChange(id, newStatus) {
  const t = tasks.find((x) => x.id === id);
  if (!t) return;
  try {
    if (newStatus === "done" && t.status !== "done") {
      const doneTasks = tasks.filter((x) => x.status === "done");
      const maxOrder = doneTasks.reduce((m, x) => Math.max(m, taskOrderVal(x)), -1);
      await patchTask(id, { status: newStatus, order: maxOrder + 1 });
    } else if (newStatus === "new" && t.status !== "new") {
      const catTasks = tasks.filter(
        (x) => x.category === t.category && x.status !== "done" && x.id !== id
      );
      const minOrder = catTasks.reduce((m, x) => Math.min(m, taskOrderVal(x)), Infinity);
      const order = minOrder === Infinity ? 0 : minOrder - 1;
      await patchTask(id, { status: newStatus, order });
    } else if (newStatus !== "done" && t.status === "done") {
      const catTasks = tasks.filter(
        (x) => x.category === t.category && x.status !== "done" && x.id !== id
      );
      const maxOrder = catTasks.reduce((m, x) => Math.max(m, taskOrderVal(x)), -1);
      await patchTask(id, { status: newStatus, order: maxOrder + 1 });
    } else {
      await patchTask(id, { status: newStatus });
    }
    showToast("Status updated");
  } catch {
    showToast("Error updating status");
  }
}

async function reorderDoneTasks(draggedId, targetId, before) {
  let doneTasks = sortByOrder(
    tasks.filter((t) => t.status === "done" && t.id !== draggedId)
  );
  const dragged = tasks.find((t) => t.id === draggedId);
  if (!dragged) return;
  let insertIndex = doneTasks.length;
  if (targetId) {
    const idx = doneTasks.findIndex((t) => t.id === targetId);
    if (idx >= 0) insertIndex = before ? idx : idx + 1;
  }
  doneTasks.splice(insertIndex, 0, dragged);
  try {
    const batch = writeBatch(db);
    doneTasks.forEach((t, i) => {
      const updates = { order: i };
      if (t.id === draggedId) updates.updatedAt = Timestamp.now();
      batch.update(taskDoc(t.id), updates);
    });
    await batch.commit();
  } catch {
    showToast("Error reordering");
  }
}

// ─── Weekly digest ────────────────────────────────────────────
export function showDigest() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);

  const critical = tasks.filter(t => t.status === "critical");
  const dueSoon = tasks
    .filter(t => t.dueDate && t.status !== "done" && new Date(t.dueDate + "T00:00:00") <= weekFromNow)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const recentlyUpdated = [...tasks]
    .filter(t => t.updatedAt && t.status !== "done")
    .sort((a, b) => {
      const ta = a.updatedAt.toDate ? a.updatedAt.toDate() : new Date(a.updatedAt);
      const tb = b.updatedAt.toDate ? b.updatedAt.toDate() : new Date(b.updatedAt);
      return tb - ta;
    })
    .slice(0, 5);
  const done = tasks.filter(t => t.status === "done");

  let html = `
    <div class="digest-header">
      <h2>Weekly digest</h2>
      <p>${now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
    </div>
    <div class="digest-stats">
      <div class="ds"><span class="ds-n" style="color:var(--red)">${critical.length}</span><span class="ds-l">Critical</span></div>
      <div class="ds"><span class="ds-n" style="color:var(--amber)">${tasks.filter(t=>t.status==="inprogress").length}</span><span class="ds-l">In progress</span></div>
      <div class="ds"><span class="ds-n" style="color:var(--blue)">${tasks.filter(t=>t.status==="monitoring").length}</span><span class="ds-l">Monitoring</span></div>
      <div class="ds"><span class="ds-n" style="color:var(--green)">${done.length}</span><span class="ds-l">Done</span></div>
    </div>`;

  if (dueSoon.length) {
    html += `<div class="digest-section"><div class="digest-section-title">Due this week</div>`;
    dueSoon.forEach(t => {
      html += `<div class="digest-item">${dueDateBadge(t.dueDate)} <span class="digest-item-title">${t.title}</span></div>`;
    });
    html += `</div>`;
  }

  if (critical.length) {
    html += `<div class="digest-section"><div class="digest-section-title">Critical items</div>`;
    critical.forEach(t => {
      html += `<div class="digest-item"><span class="badge b-cr">${siteLabel(t.site)}</span> <span class="digest-item-title">${t.title}</span></div>`;
    });
    html += `</div>`;
  }

  if (recentlyUpdated.length) {
    html += `<div class="digest-section"><div class="digest-section-title">Recently updated</div>`;
    recentlyUpdated.forEach(t => {
      html += `<div class="digest-item"><span class="updated-at">${t.updatedAt ? formatTimestamp(t.updatedAt) : ""}</span> <span class="digest-item-title">${t.title}</span></div>`;
    });
    html += `</div>`;
  }

  if (done.length) {
    html += `<div class="digest-section"><div class="digest-section-title">Completed (${done.length})</div>`;
    done.forEach(t => {
      html += `<div class="digest-item done-item"><span class="digest-item-title">${t.title}</span></div>`;
    });
    html += `</div>`;
  }

  document.getElementById("digest-body").innerHTML = html;
  document.getElementById("digest-modal").classList.add("open");
}

export function closeDigest() {
  document.getElementById("digest-modal").classList.remove("open");
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

  const status = document.getElementById("m-status").value;
  const category = document.getElementById("m-cat").value;

  let order;
  if (status === "done") {
    const peerTasks = tasks.filter((t) => t.status === "done");
    order = peerTasks.reduce((m, t) => Math.max(m, taskOrderVal(t)), -1) + 1;
  } else {
    const peerTasks = tasks.filter((t) => t.category === category && t.status !== "done");
    const minOrder = peerTasks.reduce((m, t) => Math.min(m, taskOrderVal(t)), Infinity);
    order = minOrder === Infinity ? 0 : minOrder - 1;
  }

  const task = {
    id: String(nextId++),
    title,
    status,
    site: document.getElementById("m-site").value,
    category,
    priority: document.getElementById("m-priority").value,
    notes: document.getElementById("m-notes").value,
    deps: document.getElementById("m-deps").value,
    dueDate: document.getElementById("m-due").value || "",
    order,
  };

  try {
    await persistTask(task);
    closeModal();
    ["m-title", "m-notes", "m-deps", "m-due"].forEach(id => document.getElementById(id).value = "");
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

// ─── Init ─────────────────────────────────────────────────────
export async function init() {
  await seedIfEmpty();
  subscribeToTasks();

  document.getElementById("modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("modal")) closeModal();
  });
  document.getElementById("digest-modal").addEventListener("click", (e) => {
    if (e.target === document.getElementById("digest-modal")) closeDigest();
  });
  document.getElementById("m-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTask();
  });
  ["f-status", "f-site", "f-cat"].forEach((id) => {
    document.getElementById(id).addEventListener("change", render);
  });
  document.getElementById("f-search").addEventListener("input", render);

  // Reset draggable flags if mousedown on a drag handle didn't end in a drag
  document.addEventListener("mouseup", () => {
    document.querySelectorAll(".task-card[draggable='true'], .section-wrap[draggable='true']")
      .forEach((el) => { el.draggable = false; });
  });
}
