# WhatsApp Group Chat Summarizer

Turn the **current WhatsApp Web chat** into a **grounded briefing**: overview, key
participants, decisions, action items, debates, and "what needs you" — where
**every claim links back to the exact source message**.

This is a **browser-extension-only** product. It runs entirely in your browser
with **no server**: the extension scrapes the open chat and calls the **Gemini
API directly** using **your own API key**, stored locally in your browser. Chats
and key never leave your machine for anyone else's.

## 👉 Get started — load the extension

Everything lives in [`extension/`](extension/). See
**[extension/README.md](extension/README.md)** for the full build + load guide.

Quick version:

```bash
cd extension
npm install
npm run build          # builds the unpacked extension into extension/dist
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load
unpacked** → select **`extension/dist`**. Open `web.whatsapp.com`, click the
extension, paste a free [Gemini API key](https://aistudio.google.com/apikey) in
Settings, and hit **Summarize current chat**.

## How it works

```
Side panel "Summarize"
  → content script scrapes the open chat (auto-scroll)   extension/src/scraper.ts
  → clean + index + stats (citation ids, counts)         extension/src/clean.ts
  → Gemini 2.5 Flash, structured JSON, your key          extension/src/gemini.ts
  → briefing UI with clickable [mN] citations            extension/src/sidepanel/App.tsx
```

The model is required to cite the `[mN]` id of every supporting message, so the
UI can scroll you to the source — the anti-hallucination spine of the product.

## Repo layout

| Path                | What                                                      |
| ------------------- | -------------------------------------------------------- |
| `extension/`        | **The product** — the standalone Chrome (MV3) extension. |
| `app/`, `lib/`      | _Legacy_ Next.js web-upload prototype (no longer needed for the extension). Kept for reference; safe to delete if you want a pure-extension repo. |

## Privacy note

You are sending other group members' messages to Google. Tell your users plainly,
and consider a paid Gemini tier (it excludes your data from training). Because the
key is the end user's own and stays in their browser, there is no shared server
holding anyone's chats.
