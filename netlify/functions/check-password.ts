import type { Handler } from "@netlify/functions";

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

  const { password } = JSON.parse(event.body || "{}");
  const correct = process.env.REQUEST_PORTAL_PASSWORD;

  if (!correct) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server misconfiguration" }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ok: password === correct }),
  };
};
