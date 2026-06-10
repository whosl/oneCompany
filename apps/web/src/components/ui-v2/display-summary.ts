const SENTENCE_END = /[.!?。！？]/;

export function compactDisplaySummary(value: string, maxLength = 36): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const sentenceEnd = normalized.search(SENTENCE_END);
  if (sentenceEnd >= 24 && sentenceEnd < maxLength) {
    return normalized.slice(0, sentenceEnd + 1);
  }

  const candidate = normalized.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const cutoff = lastSpace >= Math.floor(maxLength * 0.6) ? lastSpace : maxLength;
  return `${normalized.slice(0, cutoff).trimEnd()}...`;
}
