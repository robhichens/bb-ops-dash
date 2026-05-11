export default async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { password } = await req.json();
    const valid = password === process.env.REQUEST_PORTAL_PASSWORD;
    return Response.json({ valid });
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
};

export const config = {
  path: "/api/verify-password",
};
