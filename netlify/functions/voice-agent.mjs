import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

const SYSTEM_PROMPT = `You are an operations intake assistant for Bright Beginnings Preschool, a 3-site early childhood education organization in Charlottesville, Virginia. The sites are Crozet, Forest Lakes, and Mill Creek. Your job is to help Rob Hichens (Director of Operations) quickly capture tasks and reminders by voice. Rob speaks with a South African accent, so voice transcriptions may contain errors. Apply these corrections when interpreting transcripts:
- "lekker" = good/great, "now now" = soon, "just now" = shortly, "braai" = barbecue event
- "hey" or "yah" are filler words (ignore them)
- Words may be phonetically mangled: "Crozet" might appear as "croissant" or "crozay", "Mill Creek" as "milk reek", "Forest Lakes" as "forest legs"
- Common South African English patterns: "is it?" = really?, "robot" = traffic light, "shame" = expression of sympathy
- If a word seems wrong in context, infer the most likely intended word before asking for clarification
When given a voice transcript, extract as much structured task information as possible and ask concise follow-up questions for anything missing. Always respond in 2-3 sentences maximum. Available categories: Website & Digital, Marketing & Enrollment, Legal / Incident, Training and Professional Development, Hiring & Onboarding, Enrollment / Move-ups, Operations / Tech, Legal / HR, HR / Benefits, Playground Projects, Classroom Projects, Events and Community. Statuses: new, critical, inprogress, monitoring, done. Sites: cr (Crozet), mc (Mill Creek), fl (Forest Lakes), all (All sites). When you have enough info, respond with a JSON block inside <task> tags containing: title, category, site, status, priority (1, 2, or empty), notes, dueDate (YYYY-MM-DD or empty). Keep your conversational responses warm and brief.`;

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { messages, taskContext } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "Messages array is required" }, { status: 400 });
    }

    let systemPrompt = SYSTEM_PROMPT;
    if (taskContext) {
      systemPrompt += `\n\nCurrent tasks in the system for context:\n${taskContext}`;
    }

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages,
    });

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");

    return Response.json({ response: text });
  } catch (err) {
    console.error("Voice agent error:", err);
    return Response.json(
      { error: "Failed to process request" },
      { status: 500 }
    );
  }
};

export const config = {
  path: "/api/voice-agent",
};
