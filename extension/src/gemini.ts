/**
 * Direct-to-Gemini summarization — no backend.
 *
 * The extension calls the Gemini REST API straight from the side panel using the
 * user's own API key (stored in chrome.storage.local). Chats and the key never
 * touch any server of ours — this is the "direct-to-destination pipeline" from
 * the project blueprint, and the privacy story for the product.
 *
 * Output is a GROUNDED briefing: every debate / decision / action / "needs you"
 * item cites the message ids it came from, so each claim links back to the exact
 * source message. The request shape below was validated against the live API.
 */
import type { ChatSummary } from "./types";
import type { ChatStats } from "./clean";

const MODEL = "gemini-2.5-flash";
const ENDPOINT = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(key)}`;

/** Thrown with a user-safe, actionable message on any failure. */
export class SummarizeError extends Error {}

// --- Structured-output schema (Gemini REST format: uppercase types) -----------

const cited = (props: Record<string, unknown>, order: string[]) => ({
  type: "OBJECT",
  properties: { ...props, sourceIds: { type: "ARRAY", items: { type: "STRING" } } },
  required: order,
  propertyOrdering: order,
});

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    overview: { type: "STRING" },
    debates: {
      type: "ARRAY",
      items: cited({ topic: { type: "STRING" }, positions: { type: "STRING" } }, [
        "topic",
        "positions",
        "sourceIds",
      ]),
    },
    decisions: {
      type: "ARRAY",
      items: cited({ decision: { type: "STRING" } }, ["decision", "sourceIds"]),
    },
    actionItems: {
      type: "ARRAY",
      items: cited({ assignee: { type: "STRING" }, task: { type: "STRING" } }, [
        "assignee",
        "task",
        "sourceIds",
      ]),
    },
    needsYou: {
      type: "ARRAY",
      items: cited(
        {
          item: { type: "STRING" },
          type: { type: "STRING", enum: ["mention", "question", "task"] },
        },
        ["item", "type", "sourceIds"],
      ),
    },
  },
  required: ["overview", "debates", "decisions", "actionItems", "needsYou"],
  propertyOrdering: ["overview", "debates", "decisions", "actionItems", "needsYou"],
};

const SYSTEM_INSTRUCTION = `You are an analyst who turns a noisy WhatsApp group conversation into a concise, accurate briefing for a busy stakeholder.

You receive a transcript where every message is prefixed with a citation id like [m12]. Follow these rules strictly:

1. GROUND EVERYTHING. For every debate, decision, action item and "needs you" entry, populate sourceIds with the ids (as bare strings like "m12") of the specific messages that support it. Never invent an id that is not present in the transcript.
2. DO NOT FABRICATE. Only report decisions, tasks and positions that actually appear. If something is unresolved or ambiguous, either say so plainly or omit it. Omitting is better than guessing.
3. DECISIONS are things the group actually agreed on or finalized. ACTION ITEMS are concrete tasks owned by a specific person ("assignee"). DEBATES are topics with genuine disagreement or trade-off discussion — summarize the opposing positions and the reasoning.
4. Be businesslike and concise. Use participants' real names. Keep the overview to a few sentences.
5. NEEDS YOU: if a focus user is given, list messages that mention them, ask them a question, or assign them a task, tagged by type. If no focus user is given, return an empty array.`;

function buildPrompt(transcript: string, stats: ChatStats, focusUser?: string): string {
  const counts = stats.participants.map((p) => `${p.name}: ${p.count}`).join("\n");
  return [
    `FOCUS USER: ${focusUser?.trim() ? focusUser.trim() : "(none)"}`,
    "",
    `CONVERSATION SPAN: ${stats.firstTimestamp ?? "?"} to ${stats.lastTimestamp ?? "?"} (${stats.totalMessages} messages after cleaning)`,
    "",
    "PARTICIPANT MESSAGE COUNTS (authoritative):",
    counts || "(none)",
    "",
    "TRANSCRIPT:",
    transcript,
  ].join("\n");
}

// --- Lightweight runtime validation (no zod dependency) -----------------------

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function ids(v: unknown): string[] {
  return asArray(v).filter((x): x is string => typeof x === "string");
}

function coerceSummary(parsed: unknown): ChatSummary {
  const o = (parsed ?? {}) as Record<string, unknown>;
  return {
    overview: str(o.overview),
    debates: asArray(o.debates).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { topic: str(x.topic), positions: str(x.positions), sourceIds: ids(x.sourceIds) };
    }),
    decisions: asArray(o.decisions).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { decision: str(x.decision), sourceIds: ids(x.sourceIds) };
    }),
    actionItems: asArray(o.actionItems).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      return { assignee: str(x.assignee), task: str(x.task), sourceIds: ids(x.sourceIds) };
    }),
    needsYou: asArray(o.needsYou).map((d) => {
      const x = (d ?? {}) as Record<string, unknown>;
      const t = str(x.type);
      return {
        item: str(x.item),
        type: t === "mention" || t === "question" || t === "task" ? t : "mention",
        sourceIds: ids(x.sourceIds),
      };
    }),
  };
}

/** Map an HTTP failure from the Gemini API to a user-safe, actionable message. */
function explainHttp(status: number, raw: string): SummarizeError {
  let apiMsg = "";
  try {
    apiMsg = String(JSON.parse(raw)?.error?.message ?? "");
  } catch {
    /* non-JSON body */
  }
  if (status === 400 && /api[\s_-]?key/i.test(apiMsg)) {
    return new SummarizeError("That Gemini API key looks invalid. Double-check it in Settings.");
  }
  if (status === 400) {
    return new SummarizeError(`Gemini rejected the request: ${apiMsg || "bad request"}.`);
  }
  if (status === 401 || status === 403) {
    return new SummarizeError(
      "Your Gemini API key was rejected (invalid or lacks access). Check it in Settings.",
    );
  }
  if (status === 429) {
    return new SummarizeError("Gemini rate limit hit. Wait a minute and try again.");
  }
  if (status >= 500) {
    return new SummarizeError("Gemini is having trouble right now. Try again shortly.");
  }
  return new SummarizeError(`Gemini request failed (HTTP ${status}).`);
}

/**
 * Summarize a cleaned transcript with Gemini 2.5 Flash, calling the API directly
 * with the user's key. Throws SummarizeError with a friendly message on failure.
 */
export async function summarizeWithGemini(args: {
  apiKey: string;
  transcript: string;
  stats: ChatStats;
  focusUser?: string;
}): Promise<ChatSummary> {
  const body = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [{ role: "user", parts: [{ text: buildPrompt(args.transcript, args.stats, args.focusUser) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  };

  let res: Response;
  try {
    res = await fetch(ENDPOINT(args.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Network-level failure (offline, DNS, blocked). Not an API error.
    throw new SummarizeError("Couldn't reach Gemini. Check your internet connection and try again.");
  }

  if (!res.ok) {
    throw explainHttp(res.status, await res.text().catch(() => ""));
  }

  const data = (await res.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  } | null;

  if (data?.promptFeedback?.blockReason) {
    throw new SummarizeError("This conversation was blocked by Gemini's safety filters.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
  if (!text.trim()) {
    throw new SummarizeError("Gemini returned an empty response. Try again or narrow the message range.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SummarizeError("Gemini returned malformed output. Please try again.");
  }
  return coerceSummary(parsed);
}
