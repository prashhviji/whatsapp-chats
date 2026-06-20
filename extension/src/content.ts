/**
 * Content script: injected into web.whatsapp.com on demand. Listens for a
 * SCRAPE request from the side panel, scrapes the open chat, and returns the
 * messages. Guarded so repeated injection doesn't register duplicate listeners.
 */
import { scrapeMessages } from "./scraper";
import type { ScrapeProgress, ScrapeResponse } from "./types";

interface InjectedWindow extends Window {
  __waSummarizerInjected?: boolean;
}
const w = window as InjectedWindow;

if (!w.__waSummarizerInjected) {
  w.__waSummarizerInjected = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "SCRAPE") return undefined;

    const target = typeof message.target === "number" ? message.target : 500;
    scrapeMessages(target, (count) => {
      const progress: ScrapeProgress = { type: "SCRAPE_PROGRESS", count };
      chrome.runtime.sendMessage(progress).catch(() => {});
    })
      .then((messages) => {
        const res: ScrapeResponse = { ok: true, messages, count: messages.length };
        sendResponse(res);
      })
      .catch((err: unknown) => {
        const res: ScrapeResponse = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
        sendResponse(res);
      });

    return true; // keep the message channel open for the async response
  });
}
