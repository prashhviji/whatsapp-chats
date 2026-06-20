import {
  parseWhatsAppExport,
  indexRawMessages,
  type ParsedMessage,
  type RawMessage,
} from "@/lib/parser";
import { cleanMessages, computeStats, buildTranscript } from "@/lib/clean";
import { summarizeChat, SummarizeError } from "@/lib/summary";
import { checkRateLimit } from "@/lib/ratelimit";

// The Gemini SDK needs the Node runtime (not Edge).
export const runtime = "nodejs";
// Summaries can take a while for large chats; allow up to 60s.
export const maxDuration = 60;

// Cost / safety guards.
const MAX_INPUT_CHARS = 1_000_000; // reject absurdly large uploads outright
const MAX_RAW_MESSAGES = 5000; // reject absurd scrape payloads before processing
const MAX_MESSAGES = 1500; // cap messages sent to the model (keeps the most recent)

// Allow the browser extension (chrome-extension:// origin) to call this.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(data, { status, headers: { ...CORS_HEADERS, ...extraHeaders } });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json(
      { error: "Server is not configured: GEMINI_API_KEY is missing. Add it to .env.local." },
      500,
    );
  }

  // Best-effort per-client rate limit (we pay per request).
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return json({ error: `Too many requests. Try again in ${rl.retryAfterSec}s.` }, 429, {
      "Retry-After": String(rl.retryAfterSec),
    });
  }

  let body: { text?: unknown; messages?: unknown; focusUser?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  // Two ingestion paths: structured scraped messages (extension) or export text (upload).
  let parsed: ParsedMessage[];
  if (Array.isArray(body.messages)) {
    if (body.messages.length === 0) {
      return json({ error: "No messages were captured. Scroll the chat and try again." }, 422);
    }
    if (body.messages.length > MAX_RAW_MESSAGES) {
      return json({ error: "Too many messages captured at once. Narrow the range." }, 413);
    }
    const raw: RawMessage[] = body.messages.map((m) => {
      const item = (m ?? {}) as Record<string, unknown>;
      return {
        sender: typeof item.sender === "string" ? item.sender : null,
        timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
        text: typeof item.text === "string" ? item.text : "",
      };
    });
    parsed = indexRawMessages(raw);
  } else if (typeof body.text === "string" && body.text.trim().length > 0) {
    if (body.text.length > MAX_INPUT_CHARS) {
      return json({ error: "That export is too large to process. Try a shorter date range." }, 413);
    }
    parsed = parseWhatsAppExport(body.text);
  } else {
    return json(
      { error: "Provide either exported chat 'text' or a 'messages' array." },
      400,
    );
  }

  let cleaned = cleanMessages(parsed);
  if (cleaned.length === 0) {
    return json(
      { error: "No readable messages found. Make sure this is a real WhatsApp conversation." },
      422,
    );
  }

  let truncated = false;
  if (cleaned.length > MAX_MESSAGES) {
    cleaned = cleaned.slice(-MAX_MESSAGES); // keep the most recent messages
    truncated = true;
  }

  const stats = computeStats(cleaned);
  const transcript = buildTranscript(cleaned);

  try {
    const summary = await summarizeChat({
      transcript,
      stats,
      focusUser: typeof body.focusUser === "string" ? body.focusUser : undefined,
      apiKey,
    });

    return json({
      summary,
      participants: stats.participants,
      stats: {
        totalMessages: stats.totalMessages,
        firstTimestamp: stats.firstTimestamp,
        lastTimestamp: stats.lastTimestamp,
      },
      messages: cleaned.map((m) => ({
        id: m.id,
        timestamp: m.timestamp,
        sender: m.sender,
        text: m.text,
      })),
      truncated,
    });
  } catch (err) {
    const message =
      err instanceof SummarizeError ? err.message : "Failed to generate the summary.";
    return json({ error: message }, 502);
  }
}
