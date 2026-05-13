import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { tasks } from "../../db/schema";

function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const sql = neon(process.env.DATABASE_URL);
  return drizzle(sql, { schema: { tasks } });
}

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const { name, email, site, reqType, title, desc, urgency } = JSON.parse(event.body || "{}");

    if (!name || !email || !title || !desc) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing required fields: name, email, title, desc" }),
      };
    }

    const id = "req_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
    const notes = `Submitted by: ${name} <${email}>\nUrgency: ${urgency || "Routine"}\n\n${desc}`;

    const db = getDb();
    const [task] = await db
      .insert(tasks)
      .values({
        id,
        title,
        status: "new",
        site: site || "all",
        category: reqType || "Other",
        priority: "",
        notes,
        deps: "",
        dueDate: "",
        updatedAt: new Date(),
      })
      .returning();

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({ success: true, id: task.id }),
    };
  } catch (err: any) {
    console.error("submit-request error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
