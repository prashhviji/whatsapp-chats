import { parseWhatsAppExport } from "@/lib/parser";
import { cleanMessages, computeStats, buildTranscript } from "@/lib/clean";
import { summarizeChat, SummarizeError } from "@/lib/summary";
import { checkRateLimit } from "@/lib/ratelimit";

// The Gemini SDK needs the Node runtime (not Edge).
export const runtime = "nodejs";
// Summaries can take a while for large chats; allow up to 60s.
export const maxDuration = 60;

// Cost / safety guards.
const MAX_INPUT_CHARS = 1_000_000; // reject absurdly large uploads outright
const MAX_MESSAGES = 1500; // cap messages sent to the model (keeps the most recent)

export async function POST(req: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "Server is not configured: GEMINI_API_KEY is missing. Add it to .env.local." },
      { status: 500 },
    );
  }

  // Best-effort per-client rate limit (we pay per request).
  const ip = (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      { error: `Too many requests. Try again in ${rl.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  let body: { text?: unknown; focusUser?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const { text, focusUser } = body;
  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json(
      { error: "Paste or upload the exported chat text in the 'text' field." },
      { status: 400 },
    );
  }
  if (text.length > MAX_INPUT_CHARS) {
    return Response.json(
      { error: "That export is too large to process. Try a shorter date range." },
      { status: 413 },
    );
  }

  const parsed = parseWhatsAppExport(text);
  let cleaned = cleanMessages(parsed);
  if (cleaned.length === 0) {
    return Response.json(
      { error: "No readable messages found. Make sure this is a WhatsApp 'Export chat' .txt file." },
      { status: 422 },
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
      focusUser: typeof focusUser === "string" ? focusUser : undefined,
      apiKey,
    });

    return Response.json({
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
    return Response.json({ error: message }, { status: 502 });
  }
}
