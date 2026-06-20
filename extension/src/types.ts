/** Shared types between the content script and the side panel. */

export interface ScrapedMessage {
  sender: string | null;
  timestamp: string;
  text: string;
}

export interface ChatSummary {
  overview: string;
  debates: { topic: string; positions: string; sourceIds: string[] }[];
  decisions: { decision: string; sourceIds: string[] }[];
  actionItems: { assignee: string; task: string; sourceIds: string[] }[];
  needsYou: { item: string; type: string; sourceIds: string[] }[];
}

export interface TranscriptMessage {
  id: string;
  timestamp: string;
  sender: string | null;
  text: string;
}

export interface SummarizeResponse {
  summary: ChatSummary;
  participants: { name: string; count: number }[];
  stats: { totalMessages: number; firstTimestamp: string | null; lastTimestamp: string | null };
  messages: TranscriptMessage[];
  truncated: boolean;
}

// Messaging contracts
export interface ScrapeRequest {
  type: "SCRAPE";
  target: number;
}

export interface ScrapeResponse {
  ok: boolean;
  messages?: ScrapedMessage[];
  count?: number;
  error?: string;
}

export interface ScrapeProgress {
  type: "SCRAPE_PROGRESS";
  count: number;
}
