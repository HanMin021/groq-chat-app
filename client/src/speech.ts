// Language codes for speaking differ slightly from the ones for listening.
const SPEAK_LANG: Record<string, string> = {
  'en-US': 'en-US',
  'ms-MY': 'ms-MY',
  'zh-CN': 'zh-CN',
  'yue-Hant-HK': 'zh-HK',
};

export const speechOutputSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

// Removes Markdown symbols and emoji so the voice reads clean sentences.
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^\s*\|?[-:| ]+\|?\s*$/gm, '')
    .replace(/\|/g, ', ')
    .replace(/(\*\*|__|\*)/g, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .trim();
}

export function speak(text: string, lang: string) {
  if (!speechOutputSupported) return;

  const speakLang = SPEAK_LANG[lang] ?? lang;
  const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
  utterance.lang = speakLang;

  // Prefer an installed voice that matches the language exactly.
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((v) => v.lang.toLowerCase() === speakLang.toLowerCase()) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(speakLang.slice(0, 2)));
  if (voice) utterance.voice = voice;

  window.speechSynthesis.cancel(); // stop anything already being spoken
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (speechOutputSupported) window.speechSynthesis.cancel();
}