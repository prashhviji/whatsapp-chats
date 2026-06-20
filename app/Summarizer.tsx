"use client";

import { useState } from "react";
import type { SummarizeResponse, TranscriptMessage } from "@/lib/types";

const SAMPLE_CHAT = `15/06/2026, 10:32 - Raj: Morning all. We need to lock the payment provider for the Brunei launch this week.
15/06/2026, 10:33 - Priya: I still think Razorpay is the safer bet, it handles local UPI-style flows better.
15/06/2026, 10:34 - Raj: Stripe is better for Brunei though — cleaner API and the FX handling is solid.
15/06/2026, 10:36 - Asha: Stripe doesn't have a local entity in Brunei, that could be a compliance headache.
15/06/2026, 10:38 - Priya: Exactly my worry. Razorpay's onboarding is also faster for us.
15/06/2026, 10:41 - Raj: Fair. But our payout volume is small at launch, FX cost matters more than onboarding speed.
15/06/2026, 10:45 - Asha: Can we get legal to confirm the entity question before we decide?
15/06/2026, 10:46 - Raj: @Asha yes please, ping legal today and get a written answer.
15/06/2026, 10:47 - Asha: On it.
15/06/2026, 11:02 - Priya: Separately, the checkout page copy still says "INR only". Someone needs to fix that.
15/06/2026, 11:03 - Raj: @Dev can you update the checkout copy before Friday?
15/06/2026, 11:05 - Dev: Yes, will do by Thursday.
15/06/2026, 14:20 - Asha: Legal replied — Stripe can operate via their Singapore entity, no local entity needed. Compliance is fine.
15/06/2026, 14:22 - Raj: Great, that settles it. Decision: we go with Stripe for the Brunei launch.
15/06/2026, 14:23 - Priya: Ok, agreed. Let's go with Stripe.
15/06/2026, 14:24 - Asha: 👍
15/06/2026, 14:25 - Raj: @Priya can you set up the Stripe account and share access by Monday?
15/06/2026, 14:26 - Priya: Will do.`;

export default function Summarizer() {
  const [text, setText] = useState("");
  const [focusUser, setFocusUser] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  async function summarize() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, focusUser: focusUser.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        return;
      }
      setResult(data as SummarizeResponse);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  function jumpTo(id: string) {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlight(id);
    window.setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Input */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300">
            Upload .txt export
            <input type="file" accept=".txt,text/plain" className="hidden" onChange={handleFile} />
          </label>
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE_CHAT);
              setFileName(null);
            }}
            className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Try a sample chat
          </button>
          {fileName && <span className="text-sm text-zinc-500">{fileName}</span>}
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste the exported chat here. In WhatsApp: open a group → ⋮ → More → Export chat → Without media."
          className="mt-4 h-44 w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-mono text-sm text-zinc-800 outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        />

        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Your name in the chat (optional)</span>
            <input
              value={focusUser}
              onChange={(e) => setFocusUser(e.target.value)}
              placeholder="e.g. Asha — powers “What needs me”"
              className="w-72 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950"
            />
          </label>
          <button
            type="button"
            onClick={summarize}
            disabled={loading || text.trim().length === 0}
            className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Summarizing…" : "Summarize"}
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-300">
            {error}
          </p>
        )}
      </section>

      {result && <Briefing result={result} highlight={highlight} onJump={jumpTo} />}
    </div>
  );
}

function Briefing({
  result,
  highlight,
  onJump,
}: {
  result: SummarizeResponse;
  highlight: string | null;
  onJump: (id: string) => void;
}) {
  const { summary, participants, stats, messages, truncated } = result;

  return (
    <section className="flex flex-col gap-6">
      {truncated && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          This chat was large — only the most recent messages were summarized.
        </p>
      )}

      {/* Overview */}
      <Card title="Overview">
        <p className="text-zinc-700 dark:text-zinc-300">{summary.overview}</p>
        <p className="mt-3 text-xs text-zinc-500">
          {stats.totalMessages} messages · {stats.firstTimestamp ?? "?"} → {stats.lastTimestamp ?? "?"}
        </p>
      </Card>

      {/* Participants */}
      {participants.length > 0 && (
        <Card title="Key participants">
          <div className="flex flex-wrap gap-2">
            {participants.map((p) => (
              <span
                key={p.name}
                className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {p.name} <span className="text-zinc-400">· {p.count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Needs you */}
      {summary.needsYou.length > 0 && (
        <Card title="What needs you" accent>
          <ul className="flex flex-col gap-2">
            {summary.needsYou.map((n, i) => (
              <li key={i} className="text-zinc-700 dark:text-zinc-300">
                <span className="mr-2 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  {n.type}
                </span>
                {n.item}
                <Citations ids={n.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Decisions */}
      {summary.decisions.length > 0 && (
        <Card title="Decisions finalized">
          <ul className="flex flex-col gap-2">
            {summary.decisions.map((d, i) => (
              <li key={i} className="text-zinc-700 dark:text-zinc-300">
                ✅ {d.decision}
                <Citations ids={d.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Action items */}
      {summary.actionItems.length > 0 && (
        <Card title="Pending action items">
          <ul className="flex flex-col gap-2">
            {summary.actionItems.map((a, i) => (
              <li key={i} className="text-zinc-700 dark:text-zinc-300">
                <span className="font-semibold">@{a.assignee}</span> → {a.task}
                <Citations ids={a.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Debates */}
      {summary.debates.length > 0 && (
        <Card title="Main debates">
          <ul className="flex flex-col gap-4">
            {summary.debates.map((d, i) => (
              <li key={i}>
                <p className="font-medium text-zinc-800 dark:text-zinc-200">
                  {d.topic}
                  <Citations ids={d.sourceIds} onJump={onJump} />
                </p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{d.positions}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Transcript (citation targets) */}
      <details className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <summary className="cursor-pointer text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Cleaned transcript ({messages.length})
        </summary>
        <div className="mt-3 flex flex-col gap-1">
          {messages.map((m) => (
            <TranscriptRow key={m.id} m={m} highlighted={highlight === m.id} />
          ))}
        </div>
      </details>
    </section>
  );
}

function TranscriptRow({ m, highlighted }: { m: TranscriptMessage; highlighted: boolean }) {
  return (
    <div
      id={`msg-${m.id}`}
      className={`scroll-mt-20 rounded px-2 py-1 text-sm transition-colors ${
        highlighted ? "bg-emerald-100 ring-1 ring-emerald-400 dark:bg-emerald-900/40" : ""
      }`}
    >
      <span className="font-mono text-xs text-zinc-400">{m.id}</span>{" "}
      <span className="text-zinc-400">{m.timestamp}</span>{" "}
      <span className="font-medium text-zinc-700 dark:text-zinc-300">{m.sender}:</span>{" "}
      <span className="text-zinc-600 dark:text-zinc-400">{m.text}</span>
    </div>
  );
}

function Citations({ ids, onJump }: { ids: string[]; onJump: (id: string) => void }) {
  if (!ids?.length) return null;
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onJump(id)}
          title="Jump to source message"
          className="rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-xs text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300"
        >
          {id}
        </button>
      ))}
    </span>
  );
}

function Card({
  title,
  children,
  accent,
}: {
  title: string;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-sm dark:bg-zinc-900 ${
        accent
          ? "border-emerald-300 dark:border-emerald-800"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {children}
    </div>
  );
}
