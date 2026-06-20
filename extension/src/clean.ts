/**
 * Deterministic message pipeline — runs entirely in the browser.
 *
 * Takes the raw messages scraped from WhatsApp Web and turns them into the
 * clean, citation-indexed transcript the model summarizes. Ported from the old
 * Next.js backend (lib/parser.ts + lib/clean.ts) so the extension needs no
 * server. Every kept message keeps a stable id ("m0", "m1", …) so the model's
 * citations can point back to the exact source message in the UI.
 */
import type { ScrapedMessage, TranscriptMessage } from "./types";

/** A scraped message after indexing — gains a stable citation id. */
export interface IndexedMessage extends TranscriptMessage {
  index: number;
  isSystem: boolean;
}

export interface ChatStats {
  totalMessages: number;
  participants: { name: string; count: number }[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

// Media placeholders and call/deletion notices (text-only lines with no signal).
const NOISE_PATTERNS: RegExp[] = [
  /^<media omitted>$/i,
  /^<attached:[\s\S]*>$/i,
  /^(image|video|audio|sticker|gif|document|contact card) omitted$/i,
  /^this message was deleted$/i,
  /^you deleted this message$/i,
  /^missed (voice|video) call$/i,
  /^null$/i,
];

// A message whose entire content is emoji / reactions (👍, 😂, ❤️, 🙏, …).
// Deliberately excludes \p{Emoji_Component} because that set contains the ASCII
// digits, which would wrongly drop a message like "123".
const EMOJI_ONLY =
  /^[\s‍️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\p{Extended_Pictographic}]+$/u;

// WhatsApp appends this marker to the body of an edited message.
const EDITED_MARKER = /\s*<this message was edited>\s*$/i;

function cleanText(text: string): string {
  return text.replace(EDITED_MARKER, "").trim();
}

function isNoise(text: string): boolean {
  if (NOISE_PATTERNS.some((re) => re.test(text))) return true;
  if (EMOJI_ONLY.test(text)) return true;
  return false;
}

/** Assign stable citation ids ("m0", "m1", …) to scraped messages. */
export function indexMessages(raw: ScrapedMessage[]): IndexedMessage[] {
  return raw.map((m, index) => {
    const sender = typeof m.sender === "string" && m.sender.trim() ? m.sender : null;
    return {
      index,
      id: `m${index}`,
      timestamp: typeof m.timestamp === "string" ? m.timestamp : "",
      sender,
      text: typeof m.text === "string" ? m.text : "",
      isSystem: sender === null,
    };
  });
}

/**
 * Drop system notices, media placeholders, deletions/missed calls and
 * emoji-only reactions. KEEPS short functional replies ("Yes", "No", "Approved",
 * "Done") because those carry consensus/decision weight.
 */
export function cleanMessages(messages: IndexedMessage[]): IndexedMessage[] {
  const result: IndexedMessage[] = [];
  for (const msg of messages) {
    if (msg.isSystem) continue;
    const text = cleanText(msg.text);
    if (text.length === 0) continue;
    if (isNoise(text)) continue;
    result.push({ ...msg, text });
  }
  return result;
}

/** Reliable, code-computed stats handed to the model as ground truth. */
export function computeStats(messages: IndexedMessage[]): ChatStats {
  const counts = new Map<string, number>();
  for (const m of messages) {
    if (!m.sender) continue;
    counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1);
  }
  const participants = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalMessages: messages.length,
    participants,
    firstTimestamp: messages[0]?.timestamp ?? null,
    lastTimestamp: messages[messages.length - 1]?.timestamp ?? null,
  };
}

/**
 * Render cleaned messages into a compact transcript. Each line is prefixed with
 * the citation id, e.g.  [m12] 10:35 Raj: Stripe is better for Brunei
 */
export function buildTranscript(messages: IndexedMessage[]): string {
  return messages
    .map((m) => {
      const body = m.text.replace(/\n+/g, " ").trim();
      const who = m.sender ?? "system";
      return `[${m.id}] ${m.timestamp} ${who}: ${body}`;
    })
    .join("\n");
}
