/**
 * WhatsApp Web DOM scraper.
 *
 * BEST-EFFORT: WhatsApp Web ships obfuscated, frequently-changing class names.
 * This scraper leans on the most stable anchors available:
 *   - `[data-pre-plain-text]` — an attribute WhatsApp puts on each message's
 *     copyable element, formatted like "[10:35, 15/06/2026] Raj: ". It gives us
 *     sender + timestamp without depending on class names.
 *   - `.selectable-text`     — the message body text.
 *   - `[data-id]`            — a stable-ish per-message id, used for dedup.
 *
 * If WhatsApp changes these, update the selectors below — that's the one place
 * this file is fragile. Verify against a live web.whatsapp.com session.
 */
import type { ScrapedMessage } from "./types";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// "[10:35, 15/06/2026] Raj: "  ->  { timestamp: "15/06/2026, 10:35", sender: "Raj" }
function parsePrePlain(attr: string): { timestamp: string; sender: string } | null {
  const m = /^\[(.+?)\]\s*([\s\S]*?):\s*$/.exec(attr);
  if (!m) return null;
  const inside = m[1].trim(); // "10:35, 15/06/2026"
  const sender = m[2].trim();
  const parts = inside.split(",").map((s) => s.trim());
  // WhatsApp lists time first, date second — reorder to "date, time" to match
  // the format our backend parser/cleaner expects.
  const timestamp = parts.length === 2 ? `${parts[1]}, ${parts[0]}` : inside;
  return { timestamp, sender };
}

function messageText(el: HTMLElement): string {
  const span = el.querySelector(".selectable-text");
  return (span?.textContent ?? el.textContent ?? "").trim();
}

function findScrollContainer(): HTMLElement | null {
  const anchor = document.querySelector("#main [data-pre-plain-text]") as HTMLElement | null;
  let el: HTMLElement | null = anchor?.parentElement ?? null;
  while (el) {
    const style = getComputedStyle(el);
    const scrollable = style.overflowY === "auto" || style.overflowY === "scroll";
    if (scrollable && el.scrollHeight > el.clientHeight + 50) return el;
    el = el.parentElement;
  }
  return null;
}

/**
 * Scroll the open chat upward, collecting messages until `target` is reached or
 * no new messages appear. Returns messages in chronological order (oldest first).
 */
export async function scrapeMessages(
  target: number,
  onProgress?: (count: number) => void,
): Promise<ScrapedMessage[]> {
  const seen = new Set<string>();
  let ordered: ScrapedMessage[] = [];

  const collectPass = () => {
    const nodes = document.querySelectorAll("#main [data-pre-plain-text]");
    const fresh: ScrapedMessage[] = [];
    nodes.forEach((node) => {
      const el = node as HTMLElement;
      const parsed = parsePrePlain(el.getAttribute("data-pre-plain-text") || "");
      if (!parsed) return;
      const text = messageText(el);
      if (!text) return;
      const idEl = el.closest("[data-id]") as HTMLElement | null;
      const key = idEl?.getAttribute("data-id") ?? `${parsed.timestamp}|${parsed.sender}|${text}`;
      if (seen.has(key)) return;
      seen.add(key);
      fresh.push({ sender: parsed.sender, timestamp: parsed.timestamp, text });
    });
    // Messages revealed by scrolling up are older, so they belong *before* what
    // we already have. Within a pass they're already in chronological DOM order.
    ordered = fresh.concat(ordered);
  };

  collectPass();
  onProgress?.(ordered.length);

  const container = findScrollContainer();
  let stagnantRounds = 0;
  for (let i = 0; i < 80 && ordered.length < target && stagnantRounds < 5; i++) {
    if (!container) break;
    const before = ordered.length;
    container.scrollTop = Math.max(0, container.scrollTop - Math.round(container.clientHeight * 0.85));
    await delay(450); // let the virtual list hydrate the newly-visible rows
    collectPass();
    onProgress?.(ordered.length);
    stagnantRounds = ordered.length > before ? 0 : stagnantRounds + 1;
  }

  // Keep the most recent `target` messages (tail is newest in chronological order).
  return ordered.slice(-target);
}
