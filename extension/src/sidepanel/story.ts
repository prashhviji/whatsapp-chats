/**
 * Story-mode helpers: emoji + voice for the "drag to play the story" timeline.
 *
 * Emojis and voice tone are decided here on the client (not by the model) so they
 * stay consistent: the model only labels each beat's emotion and lists who's
 * involved. Voice uses the browser's built-in speechSynthesis — free, offline,
 * no API key.
 */
import type { StoryEmotion } from "../types";

/** Emotion → the big emoji shown on the story stage. */
export const EMOTION_EMOJI: Record<StoryEmotion, string> = {
  neutral: "💬",
  happy: "😊",
  excited: "🤩",
  celebratory: "🎉",
  tense: "😬",
  frustrated: "😤",
  sad: "😢",
  anxious: "😟",
  decisive: "💪",
  funny: "😂",
  surprised: "😲",
  grateful: "🙏",
};

/** Emotion → speech tuning, so the narration *sounds* like the mood. */
const EMOTION_VOICE: Record<StoryEmotion, { rate: number; pitch: number }> = {
  neutral: { rate: 1.0, pitch: 1.0 },
  happy: { rate: 1.05, pitch: 1.2 },
  excited: { rate: 1.12, pitch: 1.35 },
  celebratory: { rate: 1.12, pitch: 1.4 },
  tense: { rate: 1.05, pitch: 0.9 },
  frustrated: { rate: 1.0, pitch: 0.8 },
  sad: { rate: 0.9, pitch: 0.8 },
  anxious: { rate: 1.06, pitch: 0.92 },
  decisive: { rate: 1.0, pitch: 1.0 },
  funny: { rate: 1.1, pitch: 1.28 },
  surprised: { rate: 1.1, pitch: 1.45 },
  grateful: { rate: 0.98, pitch: 1.1 },
};

// Friendly, visually distinct avatars assigned per participant. Deterministic:
// the same name/number always gets the same one.
const AVATARS = [
  "🦊", "🐼", "🐧", "🦁", "🐯", "🐨", "🐵", "🐶", "🐱", "🦉",
  "🐸", "🐲", "🦄", "🐝", "🐙", "🦖", "🐳", "🦋", "🐬", "🦜",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Stable emoji avatar for a participant name or phone number. */
export function avatarFor(name: string): string {
  return AVATARS[hash(name.trim().toLowerCase()) % AVATARS.length];
}

// --- Voice (Web Speech API) ---------------------------------------------------

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

let preferredVoice: SpeechSynthesisVoice | null = null;
function pickVoice(): SpeechSynthesisVoice | null {
  if (!voiceSupported()) return null;
  if (preferredVoice) return preferredVoice;
  const voices = window.speechSynthesis.getVoices();
  // Prefer an English voice; fall back to whatever the browser offers.
  preferredVoice =
    voices.find((v) => /^en[-_]/i.test(v.lang) && /female|natural|google/i.test(v.name)) ??
    voices.find((v) => /^en[-_]/i.test(v.lang)) ??
    voices[0] ??
    null;
  return preferredVoice;
}

/** Stop any narration immediately. */
export function stopSpeaking(): void {
  if (voiceSupported()) window.speechSynthesis.cancel();
}

/**
 * Speak one beat with emotion-tuned tone. `onEnd` fires when it finishes (used
 * to chain beats during auto-play); it is NOT called if speech is cancelled.
 */
export function speakBeat(text: string, emotion: StoryEmotion, onEnd?: () => void): void {
  if (!voiceSupported() || !text.trim()) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const tone = EMOTION_VOICE[emotion] ?? EMOTION_VOICE.neutral;
  u.rate = tone.rate;
  u.pitch = tone.pitch;
  const v = pickVoice();
  if (v) u.voice = v;
  if (onEnd) u.onend = () => onEnd();
  window.speechSynthesis.speak(u);
}
