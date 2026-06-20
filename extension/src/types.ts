/** Shared types between the content script and the side panel. */

export interface ScrapedMessage {
  sender: string | null;
  timestamp: string;
  text: string;
}

/** Emotions the model may tag a story beat with (drives emoji + voice tone). */
export type StoryEmotion =
  | "neutral"
  | "happy"
  | "excited"
  | "celebratory"
  | "tense"
  | "frustrated"
  | "sad"
  | "anxious"
  | "decisive"
  | "funny"
  | "surprised"
  | "grateful";

/** One scene in the "drag to play" story timeline. */
export interface StoryBeat {
  narration: string;
  emotion: StoryEmotion;
  participants: string[];
  sourceIds: string[];
}

export interface ChatSummary {
  overview: string;
  story: StoryBeat[];
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
