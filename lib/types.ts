/** Shared, client-safe types for the summarize API response. */
import type { ChatSummary } from "./summary";

export interface ParticipantCount {
  name: string;
  count: number;
}

export interface TranscriptMessage {
  id: string;
  timestamp: string;
  sender: string | null;
  text: string;
}

export interface SummarizeResponse {
  summary: ChatSummary;
  participants: ParticipantCount[];
  stats: {
    totalMessages: number;
    firstTimestamp: string | null;
    lastTimestamp: string | null;
  };
  messages: TranscriptMessage[];
  truncated: boolean;
}

export interface ErrorResponse {
  error: string;
}
