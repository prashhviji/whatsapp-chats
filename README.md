# WhatsApp Chat Summarizer

Turn an exported WhatsApp group chat into a **grounded briefing**: overview, key
participants, decisions, action items, debates, and "what needs you" — where
**every claim links back to the exact source message**.

This is the **export-first** MVP: users upload WhatsApp's official _Export chat_
`.txt` file (no scraping, no ToS risk). The summarization engine here is the part
that carries over to a future browser extension.

## How it works

```
Upload/paste .txt
  → parse (locale + multi-line aware)        lib/parser.ts
  → clean (drop noise, keep "Yes/Approved")  lib/clean.ts
  → index + stats (citation ids, counts)     lib/clean.ts
  → Gemini 2.5 Flash, structured JSON        lib/summary.ts   (server-only key)
  → briefing UI with clickable citations     app/Summarizer.tsx
```

The Gemini key lives only on the server (`/api/summarize`, Node runtime). The
model is required to cite the `[mN]` id of every supporting message, so the UI
can scroll you to the source — the anti-hallucination spine of the product.

## Setup

```bash
npm install
cp .env.example .env.local   # then paste a PAID Gemini key into GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

Click **Try a sample chat** to see a full briefing without exporting anything.

To get a real chat: WhatsApp → open a group → ⋮ / group name → **Export chat** →
**Without media** → save the `.txt` → upload it here.

## Scripts

| Command         | Purpose                          |
| --------------- | -------------------------------- |
| `npm run dev`   | Dev server                       |
| `npm run build` | Production build                 |
| `npm test`      | Parser + cleaning unit tests     |
| `npm run lint`  | ESLint                           |

## Scope & deliberate limits (MVP)

- **Cost control:** the server holds a paid key, so requests are rate-limited
  (`lib/ratelimit.ts`, in-memory — swap for Redis at scale) and capped at
  `MAX_MESSAGES` (most recent kept) and `MAX_INPUT_CHARS` in
  `app/api/summarize/route.ts`.
- **No storage:** the chat is processed once and not persisted. Accounts,
  history, and billing are intentionally out of scope for the MVP.
- **Single-pass:** Gemini 2.5 Flash's large context handles a full export in one
  call, so map-reduce chunking isn't needed yet (it's a later step for very large
  histories).
- **Greeting filtering** is implemented but **off by default** — with a
  large-context model the token saving isn't worth dropping a participant's only
  message.

## Privacy note

You are sending other group members' messages to Google. Use a **paid** Gemini
key (the paid tier excludes your data from training) and tell your users plainly.
This matters more, not less, as you scale.

## Roadmap

1. Accounts + billing (Next.js) and saved summaries.
2. "Catch me up since I last read" (incremental, needs real timestamp parsing).
3. WXT browser extension reusing this exact engine for live in-page summaries.
