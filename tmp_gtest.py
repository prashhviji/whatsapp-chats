import json, urllib.request, urllib.error, re, pathlib

env = pathlib.Path(r"C:\Users\prasa\Documents\GitHub\whatsapp chats\.env.local").read_text()
key = re.search(r"GEMINI_API_KEY=(.*)", env).group(1).strip().strip('"').strip()

# The exact responseSchema the extension will ship (REST format: uppercase types).
def obj(props, required):
    return {"type": "OBJECT", "properties": props, "required": required,
            "propertyOrdering": required}

cited = lambda extra, order: obj({**extra, "sourceIds": {"type": "ARRAY", "items": {"type": "STRING"}}}, order)

schema = obj({
    "overview": {"type": "STRING"},
    "debates": {"type": "ARRAY", "items": cited(
        {"topic": {"type": "STRING"}, "positions": {"type": "STRING"}},
        ["topic", "positions", "sourceIds"])},
    "decisions": {"type": "ARRAY", "items": cited(
        {"decision": {"type": "STRING"}}, ["decision", "sourceIds"])},
    "actionItems": {"type": "ARRAY", "items": cited(
        {"assignee": {"type": "STRING"}, "task": {"type": "STRING"}},
        ["assignee", "task", "sourceIds"])},
    "needsYou": {"type": "ARRAY", "items": cited(
        {"item": {"type": "STRING"},
         "type": {"type": "STRING", "enum": ["mention", "question", "task"]}},
        ["item", "type", "sourceIds"])},
}, ["overview", "debates", "decisions", "actionItems", "needsYou"])

prompt = """FOCUS USER: Priya

CONVERSATION SPAN: 15/06/2026, 10:35 to 15/06/2026, 10:40 (3 messages after cleaning)

PARTICIPANT MESSAGE COUNTS (authoritative):
Raj: 2
Priya: 1

TRANSCRIPT:
[m0] 10:35 Raj: Should we use Stripe or Razorpay for Brunei payments?
[m1] 10:36 Priya: Stripe doesn't support Brunei. Razorpay it is.
[m2] 10:40 Raj: Approved. Priya can you set up the Razorpay account by Friday?"""

body = {
    "systemInstruction": {"parts": [{"text": "You turn a noisy WhatsApp chat into a grounded briefing. Cite message ids in sourceIds. Never invent ids."}]},
    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
    "generationConfig": {
        "responseMimeType": "application/json",
        "responseSchema": schema,
        "temperature": 0.2,
    },
}

url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}"
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req, timeout=90)
    data = json.loads(r.read().decode())
    print("HTTP", r.status)
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    print("--- model text (parsed) ---")
    print(json.dumps(json.loads(text), indent=2))
except urllib.error.HTTPError as e:
    print("HTTP ERROR", e.code)
    print(e.read().decode()[:3000])
