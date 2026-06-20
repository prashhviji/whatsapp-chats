import { describe, it, expect } from "vitest";
import type { ParsedMessage } from "./parser";
import { cleanMessages, buildTranscript, computeStats } from "./clean";

const mk = (
  i: number,
  sender: string | null,
  text: string,
  timestamp = "10:00",
): ParsedMessage => ({
  index: i,
  id: `m${i}`,
  timestamp,
  sender,
  text,
  isSystem: sender === null,
});

describe("cleanMessages", () => {
  it("drops noise but keeps functional one-word replies", () => {
    const cleaned = cleanMessages([
      mk(0, "Raj", "👍"),
      mk(1, "Priya", "Yes"),
      mk(2, "Raj", "<Media omitted>"),
      mk(3, "Asha", "Approved"),
      mk(4, null, "Raj added Priya"),
      mk(5, "Bo", "image omitted"),
      mk(6, "Cy", "This message was deleted"),
      mk(7, "Dee", "No"),
    ]);
    expect(cleaned.map((m) => m.text)).toEqual(["Yes", "Approved", "No"]);
  });

  it("preserves the original id/index for citations", () => {
    const cleaned = cleanMessages([mk(0, "Raj", "👍"), mk(1, "Priya", "Ship it")]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0].id).toBe("m1");
    expect(cleaned[0].index).toBe(1);
  });

  it("drops emoji-only messages including multi-emoji and hearts", () => {
    const cleaned = cleanMessages([
      mk(0, "Raj", "😂😂😂"),
      mk(1, "Priya", "❤️"),
      mk(2, "Asha", "👍 thanks"),
    ]);
    expect(cleaned.map((m) => m.text)).toEqual(["👍 thanks"]);
  });

  it("strips the <This message was edited> marker", () => {
    const cleaned = cleanMessages([
      mk(0, "Raj", "Final price is 500 <This message was edited>"),
    ]);
    expect(cleaned[0].text).toBe("Final price is 500");
  });

  it("does not drop greetings by default but does when opted in", () => {
    const input = [mk(0, "Raj", "Good morning"), mk(1, "Priya", "Decision: go with Stripe")];
    expect(cleanMessages(input)).toHaveLength(2);
    expect(cleanMessages(input, { dropGreetings: true }).map((m) => m.text)).toEqual([
      "Decision: go with Stripe",
    ]);
  });

  it("does not treat plain numbers as emoji", () => {
    const cleaned = cleanMessages([mk(0, "Raj", "123")]);
    expect(cleaned).toHaveLength(1);
  });
});

describe("computeStats", () => {
  it("counts messages per participant, sorted descending", () => {
    const stats = computeStats([
      mk(0, "Raj", "a", "10:00"),
      mk(1, "Priya", "b", "10:05"),
      mk(2, "Raj", "c", "10:10"),
    ]);
    expect(stats.totalMessages).toBe(3);
    expect(stats.participants).toEqual([
      { name: "Raj", count: 2 },
      { name: "Priya", count: 1 },
    ]);
    expect(stats.firstTimestamp).toBe("10:00");
    expect(stats.lastTimestamp).toBe("10:10");
  });
});

describe("buildTranscript", () => {
  it("prefixes each message with its citation id and flattens newlines", () => {
    const transcript = buildTranscript([mk(0, "Raj", "line one\nline two")]);
    expect(transcript).toBe("[m0] 10:00 Raj: line one line two");
  });
});
