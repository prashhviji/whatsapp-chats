/**
 * WhatsApp "Export Chat" .txt parser.
 *
 * WhatsApp exports a chat as plain text whose exact shape varies by phone
 * locale and OS. This parser is deliberately tolerant of those variants:
 *
 *   Android (dash separator):
 *     15/06/2026, 10:35 - Raj: Stripe is better for Brunei
 *     6/15/26, 10:35 AM - Raj: message
 *     2026-06-15, 22:35 - Raj: message
 *
 *   iOS (square brackets, often with seconds):
 *     [15/06/2026, 10:35:42] Raj: message
 *     [6/15/26, 10:35:42 AM] Raj: message
 *
 * System lines (no sender) look like:
 *     15/06/2026, 10:30 - Messages and calls are end-to-end encrypted.
 *     [15/06/2026, 10:30:00] Raj created group "Project X"
 *
 * A single message can span multiple lines (the user pressed Enter mid-message).
 * Continuation lines do NOT start with a timestamp and are appended to the
 * previous message.
 */

export interface ParsedMessage {
  /** 0-based position in the file (stable, used to build citation ids). */
  index: number;
  /** Stable citation id, e.g. "m0". Lets the model reference exact messages. */
  id: string;
  /** Raw datetime string exactly as exported (locale-specific, not normalized). */
  timestamp: string;
  /** Sender display name, or null for system/notification lines. */
  sender: string | null;
  /** Message body (may contain newlines for multi-line messages). */
  text: string;
  /** True for WhatsApp system notices (encryption notice, "X added Y", etc.). */
  isSystem: boolean;
}

// --- Datetime header sub-patterns ---------------------------------------------

// 15/06/2026 | 6/15/26 | 2026-06-15 | 15.06.2026
const DATE = String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{2,4}`;
// 10:35 | 10:35:42
const TIME = String.raw`\d{1,2}:\d{2}(?::\d{2})?`;
// optional " AM" / " p.m." etc.
const AMPM = String.raw`(?:\s?[APap]\.?[Mm]\.?)?`;
// full datetime: date, optional comma, whitespace, time, optional am/pm
const DATETIME = `${DATE},?\\s+${TIME}${AMPM}`;

// iOS: "[<datetime>] <rest>"
const BRACKET_HEADER = new RegExp(`^\\[\\s*(${DATETIME})\\s*\\]\\s?(.*)$`);
// Android: "<datetime> - <rest>"
const DASH_HEADER = new RegExp(`^(${DATETIME})\\s-\\s(.*)$`);

// Invisible bidi / formatting marks WhatsApp injects (LRM, RLM, isolates, ...).
const BIDI_MARKS = /[‎‏‪-‮⁦-⁩]/g;
// Non-standard spaces: no-break space and narrow no-break space (before AM/PM).
const ODD_SPACES = /[  ]/g;

/**
 * Strip WhatsApp's invisible formatting marks and normalize odd spaces so the
 * header regexes match reliably. These characters are a notorious source of
 * silent parse failures (especially U+202F before AM/PM and the U+200E LRM that
 * iOS prepends to attachment lines).
 */
export function normalizeRaw(raw: string): string {
  return raw
    .replace(/^﻿/, "") // byte-order mark
    .replace(/\r\n?/g, "\n") // CRLF / CR -> LF
    .replace(BIDI_MARKS, "")
    .replace(ODD_SPACES, " ");
}

interface HeaderMatch {
  timestamp: string;
  rest: string;
}

function matchHeader(line: string): HeaderMatch | null {
  const bracket = BRACKET_HEADER.exec(line);
  if (bracket) return { timestamp: bracket[1].trim(), rest: bracket[2] };
  const dash = DASH_HEADER.exec(line);
  if (dash) return { timestamp: dash[1].trim(), rest: dash[2] };
  return null;
}

/**
 * Split "Raj: hello" into sender + body. System lines (no "Name: " prefix)
 * return sender=null. The sender length is capped so that a full sentence which
 * happens to contain a colon (e.g. a "changed the subject to ..." notice) is
 * treated as a system line rather than a bogus sender.
 */
function splitSender(rest: string): { sender: string | null; text: string } {
  const m = /^(.{1,50}?): ([\s\S]*)$/.exec(rest);
  if (m) return { sender: m[1].trim(), text: m[2] };
  return { sender: null, text: rest };
}

/**
 * Parse a full WhatsApp export into an ordered list of messages.
 * Faithful extraction only — noise removal happens later in the cleaning stage.
 */
export function parseWhatsAppExport(raw: string): ParsedMessage[] {
  const text = normalizeRaw(raw);
  const lines = text.split("\n");
  const messages: ParsedMessage[] = [];

  for (const line of lines) {
    const header = matchHeader(line);
    if (header) {
      const { sender, text: body } = splitSender(header.rest);
      const index = messages.length;
      messages.push({
        index,
        id: `m${index}`,
        timestamp: header.timestamp,
        sender,
        text: body,
        isSystem: sender === null,
      });
    } else if (messages.length > 0) {
      // Continuation of the previous multi-line message.
      messages[messages.length - 1].text += "\n" + line;
    }
    // A non-header line before any message (rare preamble) is ignored.
  }

  return messages;
}
