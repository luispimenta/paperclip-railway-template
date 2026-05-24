// ─────────────────────────────────────────────────────────────────
// @paperclipai/adapter-openrouter — UI Parse Stdout
// Converts raw stdout into transcript entries for the run viewer
// ─────────────────────────────────────────────────────────────────

import type { TranscriptEntry } from "@paperclipai/adapter-utils";

/**
 * Parse stdout lines from an OpenRouter adapter run into
 * transcript entries for Paperclip's run viewer UI.
 */
export function parseStdout(line: string, ts: string): TranscriptEntry[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // SSE stream data lines
  if (trimmed.startsWith("data: ")) {
    const data = trimmed.slice(6).trim();
    if (data === "[DONE]") return [];

    try {
      const parsed = JSON.parse(data);

      // Reasoning / thinking content
      const reasoning =
        parsed.choices?.[0]?.delta?.reasoning_content ||
        parsed.choices?.[0]?.delta?.reasoning;
      if (reasoning) {
        return [{ kind: "thinking", ts, text: reasoning, delta: true }];
      }

      // Regular content
      const content = parsed.choices?.[0]?.delta?.content;
      if (content) {
        return [{ kind: "assistant", ts, text: content, delta: true }];
      }

      // Tool calls
      const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
      if (toolCalls?.length) {
        const entries: TranscriptEntry[] = [];
        for (const tc of toolCalls) {
          if (tc.function) {
            let input: unknown = {};
            try {
              input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
            } catch {
              input = tc.function.arguments || {};
            }
            entries.push({
              kind: "tool_call",
              ts,
              name: tc.function.name || "tool",
              input,
              toolUseId: tc.id,
            });
          }
        }
        return entries;
      }
    } catch {
      // If it's not valid JSON but starts with data:, treat as raw text
      return [{ kind: "stdout", ts, text: data }];
    }
    return [];
  }

  // Error lines
  if (
    trimmed.includes("OpenRouter API error") ||
    trimmed.includes("Error:") ||
    trimmed.includes("error")
  ) {
    return [{ kind: "stderr", ts, text: line }];
  }

  // Info lines (model selection, cost)
  if (
    trimmed.includes("[openrouter]") ||
    trimmed.includes("model:") ||
    trimmed.includes("tokens:") ||
    trimmed.includes("cost:")
  ) {
    return [{ kind: "system", ts, text: line }];
  }

  // Regular raw output
  return [{ kind: "stdout", ts, text: line }];
}
