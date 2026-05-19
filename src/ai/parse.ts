export interface ParsedSpeech {
  thinking: string;
  speech: string;
}

const THINKING_RE = /<thinking>([\s\S]*?)<\/thinking>/i;
const SPEECH_RE = /<speech>([\s\S]*?)<\/speech>/i;

export function parseSpeech(raw: string): ParsedSpeech {
  const thinkMatch = raw.match(THINKING_RE);
  const speechMatch = raw.match(SPEECH_RE);

  if (speechMatch) {
    return {
      thinking: thinkMatch?.[1]?.trim() ?? '',
      speech: speechMatch[1]?.trim() ?? '',
    };
  }

  const stripped = raw
    .replace(THINKING_RE, '')
    .replace(/<\/?speech>/gi, '')
    .trim();
  return {
    thinking: thinkMatch?.[1]?.trim() ?? '',
    speech: stripped,
  };
}

export function clipText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}
