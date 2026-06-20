import { describe, it, expect } from "vitest";
import { parseWhatsAppExport, normalizeRaw } from "./parser";

describe("parseWhatsAppExport — locale variants", () => {
  it("parses Android dash format (DD/MM/YYYY, 24h)", () => {
    const msgs = parseWhatsAppExport(
      "15/06/2026, 10:35 - Raj: Stripe is better for Brunei",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      index: 0,
      id: "m0",
      timestamp: "15/06/2026, 10:35",
      sender: "Raj",
      text: "Stripe is better for Brunei",
      isSystem: false,
    });
  });

  it("parses US format (M/D/YY, 12h AM/PM)", () => {
    const msgs = parseWhatsAppExport("6/15/26, 9:05 AM - Raj: Good morning team");
    expect(msgs[0].timestamp).toBe("6/15/26, 9:05 AM");
    expect(msgs[0].sender).toBe("Raj");
    expect(msgs[0].text).toBe("Good morning team");
  });

  it("parses iOS bracket format with seconds", () => {
    const msgs = parseWhatsAppExport("[2026-06-15, 22:35:10] Priya: night owl");
    expect(msgs[0].timestamp).toBe("2026-06-15, 22:35:10");
    expect(msgs[0].sender).toBe("Priya");
    expect(msgs[0].text).toBe("night owl");
  });

  it("normalizes the narrow no-break space iOS puts before AM/PM", () => {
    const msgs = parseWhatsAppExport("[15/06/2026, 10:35:42 PM] Priya: Razorpay handles UPI");
    expect(msgs[0].timestamp).toBe("15/06/2026, 10:35:42 PM");
    expect(msgs[0].sender).toBe("Priya");
  });
});

describe("parseWhatsAppExport — structure & edge cases", () => {
  it("treats sender-less lines as system messages", () => {
    const msgs = parseWhatsAppExport(
      "15/06/2026, 10:30 - Messages and calls are end-to-end encrypted. Tap to learn more.",
    );
    expect(msgs[0].sender).toBeNull();
    expect(msgs[0].isSystem).toBe(true);
  });

  it('treats "X added Y" notices as system messages', () => {
    const msgs = parseWhatsAppExport("15/06/2026, 10:31 - Raj added Priya");
    expect(msgs[0].isSystem).toBe(true);
    expect(msgs[0].sender).toBeNull();
  });

  it("keeps colons inside the message body (URLs)", () => {
    const msgs = parseWhatsAppExport("15/06/2026, 10:45 - Priya: check https://stripe.com now");
    expect(msgs[0].sender).toBe("Priya");
    expect(msgs[0].text).toBe("check https://stripe.com now");
  });

  it("handles phone-number senders", () => {
    const msgs = parseWhatsAppExport("15/06/2026, 10:50 - +91 98765 43210: Joining now");
    expect(msgs[0].sender).toBe("+91 98765 43210");
    expect(msgs[0].text).toBe("Joining now");
  });

  it("appends continuation lines to a multi-line message", () => {
    const raw = [
      "15/06/2026, 10:40 - Raj: Here is the plan:",
      "- step one",
      "- step two",
    ].join("\n");
    const msgs = parseWhatsAppExport(raw);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe("Here is the plan:\n- step one\n- step two");
  });

  it("strips the LRM iOS prepends to attachment lines", () => {
    const msgs = parseWhatsAppExport(
      "[15/06/2026, 11:00:00] ‎Raj: ‎<attached: IMG-001.jpg>",
    );
    expect(msgs[0].sender).toBe("Raj");
    expect(msgs[0].text).toBe("<attached: IMG-001.jpg>");
  });

  it('classifies "This message was deleted" as a normal message, not system', () => {
    const msgs = parseWhatsAppExport("15/06/2026, 11:10 - Raj: This message was deleted");
    expect(msgs[0].isSystem).toBe(false);
    expect(msgs[0].sender).toBe("Raj");
  });

  it("assigns sequential index/id across many messages", () => {
    const raw = [
      "15/06/2026, 10:00 - A: one",
      "15/06/2026, 10:01 - B: two",
      "15/06/2026, 10:02 - A: three",
    ].join("\n");
    const msgs = parseWhatsAppExport(raw);
    expect(msgs.map((m) => m.id)).toEqual(["m0", "m1", "m2"]);
    expect(msgs.map((m) => m.index)).toEqual([0, 1, 2]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseWhatsAppExport("")).toEqual([]);
    expect(parseWhatsAppExport("   \n  \n")).toEqual([]);
  });
});

describe("normalizeRaw", () => {
  it("converts CRLF to LF and removes the BOM", () => {
    expect(normalizeRaw("﻿a\r\nb")).toBe("a\nb");
  });
});
