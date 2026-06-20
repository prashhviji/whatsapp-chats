import Summarizer from "./Summarizer";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          WhatsApp Chat Summarizer
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Drop in an exported group chat and get a grounded briefing — decisions, action items,
          debates, and what needs you. Every claim links back to the exact message it came from.
        </p>
      </header>

      <Summarizer />

      <footer className="mt-12 text-center text-xs text-zinc-400">
        Your chat is processed once to generate the summary and is not stored. Uses Google Gemini.
      </footer>
    </main>
  );
}
