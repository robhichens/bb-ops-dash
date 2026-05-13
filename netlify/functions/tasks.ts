import type { Handler } from "@netlify/functions";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
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
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const db = getDb();

    switch (event.httpMethod) {
      case "GET": {
        const allTasks = await db.select().from(tasks);
        return { statusCode: 200, headers, body: JSON.stringify(allTasks) };
      }

      case "POST": {
        const body = JSON.parse(event.body || "{}");
        const isArray = Array.isArray(body);
        const values = isArray ? body : [body];
        const inserted = await db
          .insert(tasks)
          .values(values.map((d: any) => ({ ...d, updatedAt: new Date() })))
          .returning();
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify(isArray ? inserted : inserted[0]),
        };
      }

      case "PATCH": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id parameter" }) };
        }
        const data = JSON.parse(event.body || "{}");
        const [updated] = await db
          .update(tasks)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(tasks.id, id))
          .returning();
        return { statusCode: 200, headers, body: JSON.stringify(updated) };
      }

      case "DELETE": {
        const id = event.queryStringParameters?.id;
        if (!id) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing id parameter" }) };
        }
        await db.delete(tasks).where(eq(tasks.id, id));
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      default:
        return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
    }
  } catch (err: any) {
    console.error("tasks function error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || "Internal server error" }),
    };
  }
};
