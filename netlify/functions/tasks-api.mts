import { db } from "../../db/index.js";
import { tasks } from "../../db/schema.js";
import { eq } from "drizzle-orm";

export default async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.replace("/api/tasks", "").split("/").filter(Boolean);
  const method = req.method;

  if (method === "GET" && pathParts.length === 0) {
    const allTasks = await db.select().from(tasks);
    const mapped = allTasks.map(rowToTask);
    return Response.json(mapped);
  }

  if (method === "POST" && pathParts.length === 0) {
    const body = await req.json();
    const row = taskToRow(body);
    await db.insert(tasks).values(row);
    return Response.json(rowToTask(row), { status: 201 });
  }

  if (method === "POST" && pathParts[0] === "batch") {
    const { operations } = await req.json();
    for (const op of operations) {
      if (op.type === "update") {
        const fields = {};
        if (op.fields.taskOrder !== undefined) fields.taskOrder = op.fields.taskOrder;
        if (op.fields.category !== undefined) fields.category = op.fields.category;
        if (op.fields.updatedAt !== undefined) fields.updatedAt = new Date(op.fields.updatedAt);
        if (op.fields.status !== undefined) fields.status = op.fields.status;
        if (op.fields.order !== undefined) fields.taskOrder = op.fields.order;
        if (op.fields.priority !== undefined) fields.priority = op.fields.priority;
        if (op.fields.hiddenFromReport !== undefined) fields.hiddenFromReport = op.fields.hiddenFromReport;
        await db.update(tasks).set(fields).where(eq(tasks.id, op.id));
      } else if (op.type === "set") {
        const row = taskToRow(op.data);
        await db.insert(tasks).values(row).onConflictDoUpdate({
          target: tasks.id,
          set: row,
        });
      }
    }
    return Response.json({ ok: true });
  }

  if (method === "POST" && pathParts[0] === "seed") {
    const existing = await db.select({ id: tasks.id }).from(tasks).limit(1);
    if (existing.length > 0) {
      return Response.json({ seeded: false, message: "Tasks already exist" });
    }
    const { seedTasks } = await req.json();
    for (const t of seedTasks) {
      await db.insert(tasks).values(taskToRow(t));
    }
    return Response.json({ seeded: true });
  }

  if (pathParts.length === 1) {
    const id = decodeURIComponent(pathParts[0]);

    if (method === "PUT" || method === "PATCH") {
      const body = await req.json();
      const fields = {};
      if (body.title !== undefined) fields.title = body.title;
      if (body.status !== undefined) fields.status = body.status;
      if (body.site !== undefined) fields.site = body.site;
      if (body.category !== undefined) fields.category = body.category;
      if (body.priority !== undefined) fields.priority = body.priority;
      if (body.notes !== undefined) fields.notes = body.notes;
      if (body.deps !== undefined) fields.deps = body.deps;
      if (body.dueDate !== undefined) fields.dueDate = body.dueDate;
      if (body.order !== undefined) fields.taskOrder = body.order;
      if (body.hiddenFromReport !== undefined) fields.hiddenFromReport = body.hiddenFromReport;
      fields.updatedAt = new Date();
      await db.update(tasks).set(fields).where(eq(tasks.id, id));
      return Response.json({ ok: true });
    }

    if (method === "DELETE") {
      await db.delete(tasks).where(eq(tasks.id, id));
      return Response.json({ ok: true });
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
};

function rowToTask(row) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    site: row.site,
    category: row.category,
    priority: row.priority,
    notes: row.notes,
    deps: row.deps,
    dueDate: row.dueDate,
    order: row.taskOrder,
    hiddenFromReport: row.hiddenFromReport ?? false,
    updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
  };
}

function taskToRow(t) {
  return {
    id: String(t.id),
    title: t.title || "",
    status: t.status || "backlog",
    site: t.site || "all",
    category: t.category || "Other",
    priority: t.priority || "",
    notes: t.notes || "",
    deps: t.deps || "",
    dueDate: t.dueDate || "",
    taskOrder: typeof t.order === "number" ? t.order : 0,
    hiddenFromReport: t.hiddenFromReport ?? false,
    updatedAt: new Date(),
  };
}

export const config = {
  path: "/api/tasks*",
};
