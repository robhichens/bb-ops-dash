// ============================================================
// app.js — Main application logic
// Reads/writes all task data via REST API backed by Netlify Database
// ============================================================

import { DEFAULT_TASKS } from "./data.js";

// ─── Constants ───────────────────────────────────────────────
const SITES = { cr: "Crozet", mc: "Mill Creek", fl: "Forest Lakes", all: "All sites" };
const CAT_ORDER = [
  "Website & Digital", "Marketing & Enrollment",
  "Training and Professional Development", "Hiring & Onboarding", "Enrollment / Move-ups",
  "Operations / Tech", "HR / Legal", "Playground Projects",
  "Classroom Projects", "Classroom Environment", "Facilities Maintenance",
  "Events and Community", "Other",
];
// Legacy category names — tasks in these will be auto-migrated to "HR / Legal" on load
const LEGACY_CATS = new Set(["Legal / Incident", "Legal / HR", "HR / Benefits"]);
const DONE_KEY = "__done__";
const POLL_INTERVAL = 10000;

// ─── State ───────────────────────────────────────────────────
let tasks = [];
let nextId = 100;
let expandedIds = {};
let collapsedCats = new Set(JSON.parse(localStorage.getItem("bb_collapsed_cats") || "[]"));
let categoryOrder = JSON.parse(localStorage.getItem("bb_cat_order") || "null");
let doneCollapsed = true;
let dragData = null;
let pollTimer = null;

// ─── API helpers ─────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  return res.json();
}

async function loadTasks() {
  const data = await apiFetch("/api/tasks/");
  tasks = data;
  const numericIds = tasks.map((t) => parseInt(t.id, 10)).filter((n) => !isNaN(n));
  if (numericIds.length) nextId = Math.max(...numericIds) + 1;
  render();
  updateSaveLabel();
}

async function seedIfEmpty() {
  const seedTasks = DEFAULT_TASKS.map((t, i) => ({
    ...t, dueDate: "", order: i, updatedAt: new Date().toISOString(),
  }));
  await apiFetch("/api/tasks/seed", {
    method: "POST",
    body: JSON.stringify({ seedTasks }),
  });
}

async function persistTask(task) {
  await apiFetch("/api/tasks/", {
    method: "POST",
    body: JSON.stringify(task),
  });
  await loadTasks();
}

async function patchTask(id, fields) {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
  await loadTasks();
}

async function removeTask(id) {
  await apiFetch(`/api/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await loadTasks();
}

async function batchUpdate(operations) {
  await apiFetch("/api/tasks/batch", {
    method: "POST",
    body: JSON.stringify({ operations }),
  });
  await loadTasks();
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    if (document.activeElement?.classList.contains("note-area")) return;
    loadTasks().catch(() => {});
  }, POLL_INTERVAL);
}

// ─── One-time category migration ─────────────────────────────
// Moves tasks from retired categories to HR / Legal on first load.
// Safe to run every time — skips if nothing needs moving.
async function migrateLegacyCategories() {
  const toMigrate = tasks.filter(t => LEGACY_CATS.has(t.category));
  if (!toMigrate.length) return;
  console.log(`Migrating ${toMigrate.length} task(s) from legacy categories to HR / Legal…`);
  const operations = toMigrate.map(t => ({
    type: "update",
    id: t.id,
    fields: { category: "HR / Legal" },
  }));
  await batchUpdate(operations); // batchUpdate calls loadTasks() at the end
}

// ─── Date helpers ────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(ts) {
  if (!ts) return "";
  const d = new Date(ts);
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
            <span class="task-name" data-editable-title="${t.id}" title="Double-click to edit">${t.title}</span>
          </div>
          <div class="task-meta">
            ${statusBadge(t.status)}
            ${siteBadge(t.site)}
            ${t.dueDate ? dueDateBadge(t.dueDate) : ""}
            ${updatedStr ? `<span class="updated-at">updated ${updatedStr}</span>` : ""}
            ${t.hiddenFromReport ? `<span class="hidden-badge" title="This task is hidden from the boss report"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg> hidden</span>` : ""}
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
            <span class="det-label">Boss report</span>
            <label class="hide-toggle-label">
              <input type="checkbox" class="hide-report-toggle" data-report-id="${t.id}"${t.hiddenFromReport ? " checked" : ""}>
              Hide from boss report
            </label>
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

// ─── Inline title editing ────────────────────────────────────
// Double-click a task title to edit it in place.
// Enter or blur saves; Escape cancels.
function makeTitleEditable(span) {
  span.addEventListener("dblclick", async (e) => {
    e.stopPropagation();
    const id = span.dataset.editableTitle;
    const original = span.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.value = original;
    input.className = "title-edit-input";
    span.replaceWith(input);
    input.focus();
    input.select();

    let done = false;

    const restore = (text = original) => {
      if (done) return;
      done = true;
      const newSpan = document.createElement("span");
      newSpan.className = "task-name";
      newSpan.dataset.editableTitle = id;
      newSpan.title = "Double-click to edit";
      newSpan.textContent = text;
      makeTitleEditable(newSpan);
      input.replaceWith(newSpan);
    };

    const commit = async () => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (!val || val === original) { restore(original); return; }
      try {
        await patchTask(id, { title: val });
        showToast("Title updated");
        // patchTask → loadTasks → render() rebuilds the DOM automatically
      } catch {
        showToast("Error saving title");
        restore(original);
      }
    };

    input.addEventListener("keydown", (ke) => {
      if (ke.key === "Enter") { ke.preventDefault(); commit(); }
      if (ke.key === "Escape") { done = true; restore(original); }
    });
    input.addEventListener("blur", commit);
  });
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
    const operations = catTasks.map((t, i) => {
      const fields = { order: i };
      if (t.id === draggedId) {
        if (targetCat !== dragged.category) fields.category = targetCat;
        fields.updatedAt = new Date().toISOString();
      }
      return { type: "update", id: t.id, fields };
    });
    await batchUpdate(operations);
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

  list.querySelectorAll(".task-top").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      const card = el.closest(".task-card");
      const id = card.dataset.taskId;
      expandedIds[id] = !expandedIds[id];
      card.classList.toggle("expanded", expandedIds[id]);
    });
  });

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
      const draggedTask = tasks.find((t) => t.id === draggedId);
      if (draggedTask && draggedTask.status === "done") {
        await reorderDoneTasks(draggedId, targetId, before);
      } else {
        await handleTaskDrop(draggedId, targetId, targetCat, before);
      }
    });
  });

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
      if (draggedTask && draggedTask.status === "done") return;
      await handleTaskDrop(dragData.id, null, cat, false);
    });
  });

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

  // Hide-from-report toggle
  list.querySelectorAll(".hide-report-toggle").forEach((checkbox) => {
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      const id = checkbox.dataset.reportId;
      patchTask(id, { hiddenFromReport: checkbox.checked })
        .then(() => showToast(checkbox.checked ? "Hidden from boss report" : "Visible in boss report"))
        .catch(() => showToast("Error updating report visibility"));
    });
  });

  // Inline title editing — double-click to edit
  list.querySelectorAll("[data-editable-title]").forEach(makeTitleEditable);
}

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
    const operations = doneTasks.map((t, i) => {
      const fields = { order: i };
      if (t.id === draggedId) fields.updatedAt = new Date().toISOString();
      return { type: "update", id: t.id, fields };
    });
    await batchUpdate(operations);
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
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
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

// ─── Boss report ─────────────────────────────────────────────
function statusLabel(s) {
  return { critical: "Critical", inprogress: "In Progress", monitoring: "Monitoring", done: "Done", new: "New" }[s] || s;
}

export function openBossReport() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);

  // Exclude tasks flagged as hidden
  const visible  = tasks.filter(t => !t.hiddenFromReport);
  const active   = visible.filter(t => t.status !== "done");
  const done     = visible.filter(t => t.status === "done");
  const critical = active.filter(t => t.status === "critical");
  const overdue  = active.filter(t => t.dueDate && new Date(t.dueDate + "T00:00:00") < now);
  const dueSoon  = active
    .filter(t => t.dueDate && new Date(t.dueDate + "T00:00:00") >= now && new Date(t.dueDate + "T00:00:00") <= weekFromNow)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const byStatus = {
    critical:   active.filter(t => t.status === "critical").length,
    inprogress: active.filter(t => t.status === "inprogress").length,
    monitoring: active.filter(t => t.status === "monitoring").length,
    new:        active.filter(t => t.status === "new").length,
  };

  // Category grouping — same order as the main dashboard
  const catSet = new Set(active.map(t => t.category));
  const cats   = getCategoryOrder(catSet);
  const groups = {};
  active.forEach(t => { if (!groups[t.category]) groups[t.category] = []; groups[t.category].push(t); });

  // ── Narrative paragraph ──────────────────────────────────────
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  let narrative = `As of ${dateStr}, the operations team is managing <strong>${active.length} active task${active.length !== 1 ? "s" : ""}</strong> across ${cats.length} area${cats.length !== 1 ? "s" : ""}.`;
  if (critical.length) narrative += ` <strong>${critical.length} item${critical.length !== 1 ? "s are" : " is"} critical</strong> and require immediate attention.`;
  if (overdue.length)  narrative += ` <strong>${overdue.length} task${overdue.length !== 1 ? "s are" : " is"} overdue.</strong>`;
  if (done.length)     narrative += ` ${done.length} task${done.length !== 1 ? "s have" : " has"} been completed.`;

  // ── Critical items table ──────────────────────────────────────
  const criticalSection = critical.length ? `
    <div class="r-section">
      <h2>Critical Items <span class="r-badge r-badge-crit">${critical.length}</span></h2>
      <table class="r-table">
        <thead><tr><th>Task</th><th>Area</th><th>Site</th><th>Notes</th></tr></thead>
        <tbody>
          ${critical.map(t => `
            <tr class="crit-row">
              <td class="t-title">${t.title}</td>
              <td>${t.category}</td>
              <td>${siteLabel(t.site)}</td>
              <td class="t-notes">${(t.notes || "").replace(/\n/g, "<br>")}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Time-sensitive table ──────────────────────────────────────
  const timeSensitiveSection = (overdue.length || dueSoon.length) ? `
    <div class="r-section">
      <h2>Time-Sensitive <span class="r-badge r-badge-amber">${overdue.length + dueSoon.length}</span></h2>
      <table class="r-table">
        <thead><tr><th>Flag</th><th>Task</th><th>Area</th><th>Due Date</th></tr></thead>
        <tbody>
          ${overdue.map(t => `<tr class="overdue-row"><td class="flag-cell">⚠ Overdue</td><td class="t-title">${t.title}</td><td>${t.category}</td><td>${formatDate(t.dueDate)}</td></tr>`).join("")}
          ${dueSoon.map(t => `<tr><td class="flag-cell due-cell">Due Soon</td><td class="t-title">${t.title}</td><td>${t.category}</td><td>${formatDate(t.dueDate)}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Full task list grouped by category ────────────────────────
  let fullList = cats.map(cat => {
    if (!groups[cat] || !groups[cat].length) return "";
    const rows = sortByOrder(groups[cat]).map(t => `
      <tr>
        <td class="t-title">${t.title}</td>
        <td><span class="s-pill s-${t.status}">${statusLabel(t.status)}</span></td>
        <td>${siteLabel(t.site)}</td>
        <td>${t.dueDate ? formatDate(t.dueDate) : ""}</td>
      </tr>`).join("");
    return `
      <h3 class="cat-hdg">${cat}</h3>
      <table class="r-table">
        <thead><tr><th>Task</th><th>Status</th><th>Site</th><th>Due</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join("");

  // ── Completed ─────────────────────────────────────────────────
  const doneSection = done.length ? `
    <div class="r-section">
      <h2>Completed <span class="r-badge r-badge-done">${done.length}</span></h2>
      <table class="r-table">
        <thead><tr><th>Task</th><th>Area</th><th>Site</th></tr></thead>
        <tbody>
          ${done.map(t => `
            <tr>
              <td class="t-title done-title">${t.title}</td>
              <td>${t.category}</td>
              <td>${siteLabel(t.site)}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>` : "";

  // ── Full HTML document ────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>BB Ops Report — ${now.toLocaleDateString()}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root { --accent:#2d5a3d; --red:#c0392b; --amber:#b7650a; --blue:#1a4f8a; --green:#2d5a3d; --sage:#5a7a4f; }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family:'DM Sans',sans-serif; background:#fff; color:#1a1816; font-size:13px; line-height:1.5; }

    /* ── Print toolbar (screen only) ── */
    .no-print { position:fixed; top:0; left:0; right:0; background:#f5f3ef; border-bottom:1px solid #e2ddd6; padding:12px 40px; display:flex; align-items:center; gap:14px; z-index:100; }
    .print-btn { background:var(--accent); color:#fff; border:none; padding:9px 22px; border-radius:6px; font-family:'DM Sans',sans-serif; font-size:13px; font-weight:500; cursor:pointer; }
    .print-btn:hover { background:#1f3f2b; }
    .print-tip { font-size:11px; color:#9b958f; }

    /* ── Report wrapper ── */
    .report { max-width:820px; margin:70px auto 80px; padding:0 40px; }

    /* ── Header ── */
    .r-header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid var(--accent); padding-bottom:14px; margin-bottom:32px; }
    .r-header-left .brand { font-family:'DM Mono',monospace; font-size:10px; letter-spacing:0.15em; color:#9b958f; text-transform:uppercase; margin-bottom:5px; }
    .r-header-left h1 { font-size:26px; font-weight:700; color:var(--accent); letter-spacing:-0.4px; }
    .r-header-right { text-align:right; font-size:12px; color:#6b6560; line-height:1.75; }
    .r-header-right .confidential { font-family:'DM Mono',monospace; font-size:10px; color:#9b958f; text-transform:uppercase; letter-spacing:0.1em; }

    /* ── Status grid ── */
    .r-section { margin-bottom:36px; }
    .r-section h2 { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.1em; color:#1a1816; border-bottom:1px solid #e2ddd6; padding-bottom:8px; margin-bottom:16px; display:flex; align-items:center; gap:8px; font-family:'DM Mono',monospace; }
    .r-badge { font-size:11px; font-weight:500; padding:2px 8px; border-radius:100px; text-transform:none; letter-spacing:0; font-family:'DM Sans',sans-serif; }
    .r-badge-crit { background:#fdf0ee; color:var(--red); }
    .r-badge-amber { background:#fdf5e8; color:var(--amber); }
    .r-badge-done  { background:#e8f0eb; color:var(--green); }

    .narrative { font-size:14px; line-height:1.75; color:#1a1816; margin-bottom:22px; }

    .stat-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:4px; }
    .stat-card { background:#f5f3ef; border-radius:8px; padding:14px 10px; text-align:center; }
    .stat-num { font-size:26px; font-weight:700; line-height:1; }
    .stat-lbl { font-size:10px; text-transform:uppercase; letter-spacing:0.05em; color:#6b6560; margin-top:3px; font-family:'DM Mono',monospace; }
    .sc-critical   .stat-num { color:var(--red); }
    .sc-inprogress .stat-num { color:var(--amber); }
    .sc-monitoring .stat-num { color:var(--blue); }
    .sc-new        .stat-num { color:var(--sage); }
    .sc-done       .stat-num { color:var(--green); }

    /* ── Tables ── */
    .r-table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:4px; }
    .r-table thead tr { background:#f5f3ef; }
    .r-table th { text-align:left; font-family:'DM Mono',monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.06em; color:#9b958f; padding:6px 10px; font-weight:500; }
    .r-table td { padding:8px 10px; border-bottom:1px solid #f0ede8; vertical-align:top; line-height:1.4; }
    .t-title { font-weight:500; width:42%; }
    .t-notes { color:#6b6560; font-size:11px; width:30%; line-height:1.45; }
    .crit-row td { background:#fff8f7; }
    .overdue-row td { background:#fff8f7; }
    .flag-cell { font-weight:600; font-size:11px; white-space:nowrap; }
    .due-cell { color:var(--amber); }
    .overdue-row .flag-cell { color:var(--red); }

    .s-pill { display:inline-block; font-size:11px; font-weight:500; padding:2px 7px; border-radius:100px; white-space:nowrap; }
    .s-critical   { background:#fdf0ee; color:var(--red); }
    .s-inprogress { background:#fdf5e8; color:var(--amber); }
    .s-monitoring { background:#edf3fb; color:var(--blue); }
    .s-done       { background:#e8f0eb; color:var(--green); }
    .s-new        { background:#d8e8c8; color:var(--sage); }

    .cat-hdg { font-family:'DM Mono',monospace; font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:#6b6560; margin:24px 0 8px; }
    .cat-hdg:first-child { margin-top:0; }

    .done-title { color:#9b958f; text-decoration:line-through; }

    .r-footer { text-align:center; font-family:'DM Mono',monospace; font-size:10px; color:#9b958f; margin-top:60px; padding-top:16px; border-top:1px solid #e2ddd6; letter-spacing:0.06em; }

    @media print {
      .no-print { display:none !important; }
      .report { margin-top:20px; }
      body { font-size:11px; }
      .r-header-left h1 { font-size:20px; }
      .narrative { font-size:12px; }
      .stat-num { font-size:20px; }
      .r-table td, .r-table th { padding:5px 8px; }
    }
  </style>
</head>
<body>

<div class="no-print">
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <span class="print-tip">In the print dialog → choose "Save as PDF" · enable "Background graphics" for best results.</span>
</div>

<div class="report">

  <div class="r-header">
    <div class="r-header-left">
      <div class="brand">Bright Beginnings Preschool</div>
      <h1>Operations Report</h1>
    </div>
    <div class="r-header-right">
      <div>${dateStr}</div>
      <div>Rob Hichens · Director of Operations</div>
      <div class="confidential">Confidential — Internal Use Only</div>
    </div>
  </div>

  <div class="r-section">
    <h2>Executive Summary</h2>
    <p class="narrative">${narrative}</p>
    <div class="stat-grid">
      <div class="stat-card sc-critical">  <div class="stat-num">${byStatus.critical}</div>  <div class="stat-lbl">Critical</div></div>
      <div class="stat-card sc-inprogress"><div class="stat-num">${byStatus.inprogress}</div><div class="stat-lbl">In Progress</div></div>
      <div class="stat-card sc-monitoring"><div class="stat-num">${byStatus.monitoring}</div><div class="stat-lbl">Monitoring</div></div>
      <div class="stat-card sc-new">       <div class="stat-num">${byStatus.new}</div>       <div class="stat-lbl">New / Incoming</div></div>
      <div class="stat-card sc-done">      <div class="stat-num">${done.length}</div>         <div class="stat-lbl">Completed</div></div>
    </div>
  </div>

  ${criticalSection}
  ${timeSensitiveSection}

  <div class="r-section">
    <h2>Full Task List by Area</h2>
    ${fullList || '<p style="color:#9b958f;font-size:12px">No active tasks.</p>'}
  </div>

  ${doneSection}

  <div class="r-footer">
    Generated ${now.toLocaleString()} &nbsp;·&nbsp; BB Ops Dashboard &nbsp;·&nbsp; Rob Hichens
  </div>

</div>
</body>
</html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Pop-up blocked. Please allow pop-ups for this site and try again."); return; }
  win.document.write(html);
  win.document.close();
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
  await loadTasks();
  await migrateLegacyCategories(); // one-time migration; no-op once all tasks are moved
  startPolling();

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

  document.addEventListener("mouseup", () => {
    document.querySelectorAll(".task-card[draggable='true'], .section-wrap[draggable='true']")
      .forEach((el) => { el.draggable = false; });
  });
}
