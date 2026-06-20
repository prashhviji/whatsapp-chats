/**
 * Gemini summarization layer.
 *
 * Produces a grounded briefing: every debate / decision / action / "needs you"
 * item must cite the message ids ([mN]) it came from, so the UI can link each
 * claim back to the exact source message. This is the anti-hallucination spine
 * of the product — a summary you can verify in one click.
 */

import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { ChatStats } from "./clean";

const MODEL = "gemini-2.5-flash";

// --- Output contract ----------------------------------------------------------

const SummarySchema = z.object({
  overview: z.string(),
  debates: z.array(
    z.object({
      topic: z.string(),
      positions: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  decisions: z.array(
    z.object({
      decision: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  actionItems: z.array(
    z.object({
      assignee: z.string(),
      task: z.string(),
      sourceIds: z.array(z.string()),
    }),
  ),
  needsYou: z.array(
    z.object({
      item: z.string(),
      type: z.enum(["mention", "question", "task"]),
      sourceIds: z.array(z.string()),
    }),
  ),
});

export type ChatSummary = z.infer<typeof SummarySchema>;

// JSON Schema handed to Gemini so it returns valid structured JSON every time.
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    overview: { type: "string" },
    debates: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          positions: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["topic", "positions", "sourceIds"],
      },
    },
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          decision: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["decision", "sourceIds"],
      },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          assignee: { type: "string" },
          task: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["assignee", "task", "sourceIds"],
      },
    },
    needsYou: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item: { type: "string" },
          type: { type: "string", enum: ["mention", "question", "task"] },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["item", "type", "sourceIds"],
      },
    },
  },
  required: ["overview", "debates", "decisions", "actionItems", "needsYou"],
};

const SYSTEM_INSTRUCTION = `You are an analyst who turns a noisy WhatsApp group conversation into a concise, accurate briefing for a busy stakeholder.

You receive a transcript where every message is prefixed with a citation id like [m12]. Follow these rules strictly:

1. GROUND EVERYTHING. For every debate, decision, action item and "needs you" entry, populate sourceIds with the ids (as bare strings like "m12") of the specific messages that support it. Never invent an id that is not present in the transcript.
2. DO NOT FABRICATE. Only report decisions, tasks and positions that actually appear. If something is unresolved or ambiguous, either say so plainly or omit it. Omitting is better than guessing.
3. DECISIONS are things the group actually agreed on or finalized. ACTION ITEMS are concrete tasks owned by a specific person ("assignee"). DEBATES are topics with genuine disagreement or trade-off discussion — summarize the opposing positions and the reasoning.
4. Be businesslike and concise. Use participants' real names. Keep the overview to a few sentences.
5. NEEDS YOU: if a focus user is given, list messages that mention them, ask them a question, or assign them a task, tagged by type. If no focus user is given, return an empty array.`;

function buildPrompt(transcript: string, stats: ChatStats, focusUser?: string): string {
  const counts = stats.participants
    .map((p) => `${p.name}: ${p.count}`)
    .join("\n");

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

export class SummarizeError extends Error {}

/**
 * Summarize a cleaned transcript with Gemini 2.5 Flash. Throws SummarizeError
 * with a user-safe message on any failure (blocked content, invalid output…).
 */
export async function summarizeChat(args: {
  transcript: string;
  stats: ChatStats;
  focusUser?: string;
  apiKey: string;
}): Promise<ChatSummary> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });

  const response = await ai.models
    .generateContent({
      model: MODEL,
      contents: buildPrompt(args.transcript, args.stats, args.focusUser),
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseJsonSchema: RESPONSE_JSON_SCHEMA,
        temperature: 0.2,
      },
    })
    .catch((err: unknown) => {
      // Log the real upstream error server-side; never leak it to the client.
      console.error("Gemini request failed:", err);
      throw new SummarizeError(
        "The AI service could not process this chat right now. Please try again.",
      );
    });

  const text = response.text;
  if (!text) {
    throw new SummarizeError(
      "The model returned no content. The conversation may have triggered a safety block.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SummarizeError("The model returned malformed JSON.");
  }

  const validated = SummarySchema.safeParse(parsed);
  if (!validated.success) {
    throw new SummarizeError("The model's response did not match the expected format.");
  }
  return validated.data;
}
