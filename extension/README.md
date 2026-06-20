# WhatsApp Group Chat Summarizer — Chrome Extension

Summarize the **current WhatsApp Web chat** into a grounded, cited briefing —
overview, key participants, decisions, action items, debates, and "what needs
you" — where **every claim links back to the exact source message**.

It runs **entirely in your browser**. There is **no server**: the extension
scrapes the open chat, cleans it, and calls the **Gemini API directly** with
**your own API key**, which is stored only in this browser
(`chrome.storage.local`). Your chats and key never touch anyone else's machine.

```
Side panel "Summarize"
  → content script scrapes the open chat (auto-scroll)   src/scraper.ts
  → clean + index + stats (citation ids, counts)         src/clean.ts
  → Gemini 2.5 Flash, structured JSON, your key          src/gemini.ts
  → briefing UI with clickable [mN] citations            src/sidepanel/App.tsx
```

---

## 1. Build it

You only need this once (and again after any code change).

```bash
cd extension
npm install
npm run build      # outputs the unpacked extension to extension/dist
```

(For active development, `npm run dev` rebuilds on every save — then click the
extension's reload icon in `chrome://extensions`.)

## 2. Load it in Chrome

1. Open **`chrome://extensions`** (or Brave/Edge equivalent).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the **`extension/dist`** folder (the one with `manifest.json` inside —
   _not_ the `extension` folder itself).
5. The **WhatsApp Group Chat Summarizer** card appears. Pin it for easy access.

> After rebuilding, click the **↻ reload** icon on the extension's card to pick
> up the new build.

## 3. Get a free Gemini API key

1. Go to **https://aistudio.google.com/apikey**.
2. **Create API key** (free tier is fine for testing).
3. Copy it — you'll paste it into the extension's Settings once.

## 4. Use it

1. Open **https://web.whatsapp.com** and click into a chat.
2. Click the extension icon → the **side panel** opens.
3. Open **Settings**, paste your **Gemini API key** (saved for next time).
   Optionally set **your name** (powers the "What needs you" section) and **max
   messages to read**.
4. Click **Summarize current chat**. It scrolls the chat to load history, then
   produces the briefing. Click any `[mN]` citation to jump to the source
   message in the transcript.

---

## Permissions, and why

| Permission                                  | Why                                                |
| ------------------------------------------- | -------------------------------------------------- |
| `host_permissions: web.whatsapp.com`        | Inject the scraper into the open chat              |
| `host_permissions: generativelanguage…`     | Call the Gemini API directly from the side panel   |
| `scripting`                                 | Programmatically inject the content script         |
| `storage`                                   | Remember your API key + settings locally           |
| `sidePanel`                                 | Show the briefing next to WhatsApp Web             |

## Troubleshooting

- **"Add your free Gemini API key…"** — open Settings and paste your key.
- **"That Gemini API key looks invalid"** — re-copy it from AI Studio.
- **"Open web.whatsapp.com and select a chat"** — the active tab must be a chat
  on `web.whatsapp.com`.
- **"No messages captured"** — scroll into a chat with visible messages, then
  retry. WhatsApp Web's HTML changes occasionally; if scraping stops working,
  the selectors in `src/scraper.ts` are the one place to update.
- **Changes not showing** — rebuild (`npm run build`) and click ↻ on the
  extension card.

## Scope (MVP, per the project blueprint)

- Captures the most recent ~300–500 messages of the open chat (configurable up
  to 2000).
- Single pass to `gemini-2.5-flash` (no map-reduce chunking yet).
- Regex-based noise scrubbing (media/call/deleted notices, emoji-only),
  deliberately **keeping** short functional replies like "Yes"/"Approved".
- Phase 2 ideas: reply-thread grouping, influence/activity analytics, map-reduce
  for very long histories.
