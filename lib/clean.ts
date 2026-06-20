/**
 * Cleaning + indexing stage.
 *
 * The parser is faithful; this stage removes conversational/structural noise so
 * the model spends its context on signal. Crucially it KEEPS short functional
 * replies ("Yes", "No", "Approved", "Rejected", "Done") because those carry
 * consensus/decision weight — only true noise is dropped.
 *
 * Every kept message retains its original `index`/`id`, so the model's citations
 * still point back to exact positions in the full transcript.
 */

import type { ParsedMessage } from "./parser";

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

// A message whose entire content is emoji / reactions (👍, 😂, ❤️, 🙏, ...).
// Note: deliberately excludes \p{Emoji_Component} because that set contains the
// ASCII digits, which would wrongly drop a message like "123".
const EMOJI_ONLY =
  /^[\s‍️\u{1F3FB}-\u{1F3FF}\u{1F1E6}-\u{1F1FF}\p{Extended_Pictographic}]+$/u;

// Pure greetings — opt-in only (see cleanMessages docs for why it's off by default).
const GREETING_ONLY =
  /^(good\s+(morning|afternoon|evening|night)|morning|evening|gm|gn|hi+|hey+|hello+|namaste)[\s!.,]*$/i;

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

export interface CleanOptions {
  /**
   * Drop messages that are nothing but a greeting. Off by default: with a
   * large-context model the token saving is tiny, and dropping a participant's
   * only message would understate their activity. Turn on only if you need to
   * aggressively trim very large exports.
   */
  dropGreetings?: boolean;
}

/**
 * Filter parsed messages down to summarization-worthy content. System notices,
 * media placeholders, deletions/missed calls and emoji-only reactions are
 * removed; everything else (including one-word confirmations) is kept with its
 * id intact.
 */
export function cleanMessages(
  messages: ParsedMessage[],
  opts: CleanOptions = {},
): ParsedMessage[] {
  const result: ParsedMessage[] = [];
  for (const msg of messages) {
    if (msg.isSystem) continue;
    const text = cleanText(msg.text);
    if (text.length === 0) continue;
    if (isNoise(text)) continue;
    if (opts.dropGreetings && GREETING_ONLY.test(text)) continue;
    result.push({ ...msg, text });
  }
  return result;
}

/**
 * Render cleaned messages into a compact transcript for the model. Each line is
 * prefixed with the citation id so the model can reference exact messages, e.g.
 *   [m12] 10:35 Raj: Stripe is better for Brunei
 * Internal newlines are flattened so one message stays on one line.
 */
export function buildTranscript(messages: ParsedMessage[]): string {
  return messages
    .map((m) => {
      const body = m.text.replace(/\n+/g, " ").trim();
      const who = m.sender ?? "system";
      return `[${m.id}] ${m.timestamp} ${who}: ${body}`;
    })
    .join("\n");
}

export interface ChatStats {
  totalMessages: number;
  participants: { name: string; count: number }[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

/**
 * Reliable, code-computed stats. Passing these to the model as ground truth
 * keeps participant counts accurate instead of letting the model guess them.
 */
export function computeStats(messages: ParsedMessage[]): ChatStats {
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
