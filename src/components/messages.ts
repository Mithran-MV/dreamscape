// Turns what the server or a provider said into one plain sentence a dreamer can act on.
// The server's own messages are already written for people, so short ones pass through unchanged.

const RULES: [RegExp, string][] = [
  [/model_not_found|model not found/i, "The painter we use isn’t available right now."],
  [/insufficient|balance|out of credit|\b402\b/i, "There isn’t enough 0G credit left to finish it."],
  [/\b429\b|rate.?limit|too many requests/i, "The painter is busy with other dreams."],
  [/time(d)?\s?out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|fetch failed|socket|network|\b50[234]\b/i, "The painter didn’t answer in time."],
  [/transcription came back empty/i, "We couldn’t hear any words in the voice note."],
  [/voice note missing/i, "The voice note didn’t reach us."],
  [/safety|moderation|content policy|refus/i, "The painter turned this scene down."],
  [/user rejected|user denied|rejected the request/i, "You cancelled it in your wallet."],
];

export function plainError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  for (const [pattern, sentence] of RULES) if (pattern.test(raw)) return sentence;
  const first = raw.split("\n")[0].trim();
  // Anything that looks like a stack, a JSON body or a hash is for the logs, not the page.
  if (first.length > 140 || /[{}[\]]|0x[0-9a-f]{8}|\bat\s+\S+\s+\(/i.test(first)) return "Something went wrong on our side.";
  return /[.!?]$/.test(first) ? first : `${first}.`;
}
