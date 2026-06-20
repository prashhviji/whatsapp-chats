import { useEffect, useState } from "react";
import type { ScrapeResponse, SummarizeResponse, TranscriptMessage } from "../types";
import { runSummary, SummarizeError } from "../summarizer";

const STORAGE_KEY = "wa_summarizer_settings";
const API_KEY_URL = "https://aistudio.google.com/apikey";

interface Settings {
  apiKey: string;
  focusUser: string;
  target: number;
}
const DEFAULTS: Settings = { apiKey: "", focusUser: "", target: 500 };

type Status = "idle" | "scraping" | "summarizing";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummarizeResponse | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY).then((data) => {
      const saved = data?.[STORAGE_KEY] as Partial<Settings> | undefined;
      if (saved) setSettings({ ...DEFAULTS, ...saved });
      // First run (no key yet) → open Settings so the key field is visible.
      if (!saved?.apiKey) setSettingsOpen(true);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) chrome.storage.local.set({ [STORAGE_KEY]: settings });
  }, [settings, loaded]);

  useEffect(() => {
    const listener = (msg: unknown) => {
      const m = msg as { type?: string; count?: number };
      if (m?.type === "SCRAPE_PROGRESS" && typeof m.count === "number") setProgress(m.count);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const busy = status !== "idle";

  async function handleSummarize() {
    setError(null);
    setResult(null);
    setProgress(0);

    if (!settings.apiKey.trim()) {
      setError("Add your free Gemini API key in Settings below to get started.");
      setSettingsOpen(true);
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      setError("No active tab found.");
      return;
    }
    if (!/^https:\/\/web\.whatsapp\.com\//.test(tab.url ?? "")) {
      setError("Open web.whatsapp.com and select a chat, then try again.");
      return;
    }

    // Ensure the content script is present (programmatic injection, guarded).
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
    } catch {
      // ignore — it may already be injected
    }

    setStatus("scraping");
    let scrape: ScrapeResponse;
    try {
      scrape = (await chrome.tabs.sendMessage(tab.id, {
        type: "SCRAPE",
        target: settings.target,
      })) as ScrapeResponse;
    } catch {
      setStatus("idle");
      setError("Couldn't reach the page. Reload WhatsApp Web and try again.");
      return;
    }

    if (!scrape?.ok || !scrape.messages?.length) {
      setStatus("idle");
      setError(scrape?.error ?? "No messages captured. Open a chat with visible messages.");
      return;
    }

    setStatus("summarizing");
    try {
      const data = await runSummary({
        apiKey: settings.apiKey,
        messages: scrape.messages,
        focusUser: settings.focusUser.trim() || undefined,
      });
      setStatus("idle");
      setResult(data);
    } catch (err) {
      setStatus("idle");
      setError(
        err instanceof SummarizeError ? err.message : "Something went wrong generating the summary.",
      );
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
    <div className="wrap">
      <div>
        <h1>WhatsApp Chat Summarizer</h1>
        <p className="sub">Open a chat in WhatsApp Web, then summarize it into a cited briefing.</p>
      </div>

      <div className="card">
        <button className="btn btn-primary" disabled={busy} onClick={handleSummarize}>
          {status === "scraping"
            ? "Reading messages…"
            : status === "summarizing"
              ? "Summarizing…"
              : "Summarize current chat"}
        </button>
        {status === "scraping" && <p className="status">Read {progress} messages…</p>}
        {status === "summarizing" && <p className="status">Sending to AI…</p>}
      </div>

      <details
        className="card"
        open={settingsOpen}
        onToggle={(e) => setSettingsOpen((e.currentTarget as HTMLDetailsElement).open)}
      >
        <summary>Settings</summary>
        <div className="stack" style={{ marginTop: 10 }}>
          <div>
            <label>Gemini API key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder="Paste your Gemini API key"
              autoComplete="off"
              spellCheck={false}
            />
            <p className="muted" style={{ marginTop: 4 }}>
              Stored only in this browser ·{" "}
              <a href={API_KEY_URL} target="_blank" rel="noreferrer">
                Get a free key
              </a>
            </p>
          </div>
          <div>
            <label>Your name in the chat (optional) — powers “What needs you”</label>
            <input
              type="text"
              value={settings.focusUser}
              onChange={(e) => update({ focusUser: e.target.value })}
              placeholder="e.g. Asha"
            />
          </div>
          <div>
            <label>Max messages to read</label>
            <input
              type="number"
              min={50}
              max={2000}
              value={settings.target}
              onChange={(e) => update({ target: clamp(parseInt(e.target.value || "0", 10), 50, 2000) })}
            />
          </div>
        </div>
      </details>

      {error && <div className="error">{error}</div>}

      {result && <Briefing result={result} highlight={highlight} onJump={jumpTo} />}
    </div>
  );
}

function Citations({ ids, onJump }: { ids: string[]; onJump: (id: string) => void }) {
  if (!ids?.length) return null;
  return (
    <>
      {ids.map((id) => (
        <button key={id} className="cite" onClick={() => onJump(id)} title="Jump to source message">
          {id}
        </button>
      ))}
    </>
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
    <div className="stack">
      {truncated && <div className="note">Large chat — only the most recent messages were summarized.</div>}

      <div className="card">
        <p className="section-title">Overview</p>
        <p>{summary.overview}</p>
        <p className="muted" style={{ marginTop: 6 }}>
          {stats.totalMessages} messages · {stats.firstTimestamp ?? "?"} → {stats.lastTimestamp ?? "?"}
        </p>
      </div>

      {participants.length > 0 && (
        <div className="card">
          <p className="section-title">Key participants</p>
          <div>
            {participants.map((p) => (
              <span key={p.name} className="pill">
                {p.name} <span className="c">· {p.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {summary.needsYou.length > 0 && (
        <div className="card accent">
          <p className="section-title">What needs you</p>
          <ul>
            {summary.needsYou.map((n, i) => (
              <li key={i}>
                <span className="badge">{n.type}</span>
                {n.item}
                <Citations ids={n.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.decisions.length > 0 && (
        <div className="card">
          <p className="section-title">Decisions finalized</p>
          <ul>
            {summary.decisions.map((d, i) => (
              <li key={i}>
                ✅ {d.decision}
                <Citations ids={d.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.actionItems.length > 0 && (
        <div className="card">
          <p className="section-title">Pending action items</p>
          <ul>
            {summary.actionItems.map((a, i) => (
              <li key={i}>
                <strong>@{a.assignee}</strong> → {a.task}
                <Citations ids={a.sourceIds} onJump={onJump} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.debates.length > 0 && (
        <div className="card">
          <p className="section-title">Main debates</p>
          <ul>
            {summary.debates.map((d, i) => (
              <li key={i}>
                <strong>{d.topic}</strong>
                <Citations ids={d.sourceIds} onJump={onJump} />
                <div className="muted">{d.positions}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="card">
        <summary>Transcript ({messages.length})</summary>
        <div style={{ marginTop: 8 }}>
          {messages.map((m: TranscriptMessage) => (
            <div key={m.id} id={`msg-${m.id}`} className={`msg${highlight === m.id ? " hl" : ""}`}>
              <span className="id">{m.id}</span> <span className="muted">{m.timestamp}</span>{" "}
              <span className="who">{m.sender}:</span> {m.text}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
