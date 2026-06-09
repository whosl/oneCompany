import { redact } from "@oc/shared";

const INLINE_PREVIEW_CHARS = 500;

export type LogBridgeDeps = {
  formatOutput?: (toolCallId: string, raw: string) => string;
};

export function formatCommandOutput(
  toolCallId: string,
  raw: string,
  deps: LogBridgeDeps = {},
): string {
  if (deps.formatOutput) {
    return deps.formatOutput(toolCallId, raw);
  }
  const { text } = redact(raw);
  return text.length > INLINE_PREVIEW_CHARS
    ? `${text.slice(0, INLINE_PREVIEW_CHARS)}…`
    : text;
}
