/**
 * Orchestrates the full client-side summary: scraped messages in, grounded
 * briefing out. This replaces the old POST to the Next.js backend — everything
 * now runs in the side panel.
 */
import type { ScrapedMessage, SummarizeResponse } from "./types";
import {
  indexMessages,
  cleanMessages,
  computeStats,
  buildTranscript,
} from "./clean";
import { summarizeWithGemini, SummarizeError } from "./gemini";

export { SummarizeError };

// Cap messages sent to the model (keeps the most recent). Mirrors the blueprint's
// MVP guidance and keeps token cost predictable.
const MAX_MESSAGES = 1500;

export async function runSummary(args: {
  apiKey: string;
  messages: ScrapedMessage[];
  focusUser?: string;
}): Promise<SummarizeResponse> {
  if (!args.apiKey.trim()) {
    throw new SummarizeError("Add your Gemini API key in Settings first.");
  }

  let cleaned = cleanMessages(indexMessages(args.messages));
  if (cleaned.length === 0) {
    throw new SummarizeError(
      "No readable messages found. Open a chat with visible messages and try again.",
    );
  }

  let truncated = false;
  if (cleaned.length > MAX_MESSAGES) {
    cleaned = cleaned.slice(-MAX_MESSAGES);
    truncated = true;
  }

  const stats = computeStats(cleaned);
  const transcript = buildTranscript(cleaned);

  const summary = await summarizeWithGemini({
    apiKey: args.apiKey.trim(),
    transcript,
    stats,
    focusUser: args.focusUser,
  });

  return {
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
  };
}
