/**
 * Server barrel for the OpenRouter adapter.
 *
 * Exposes everything Paperclip's server-side registry expects from a
 * fully-featured adapter:
 *   - execute             — the agent run loop (tool-calling)
 *   - testEnvironment     — env diagnostics + model fetch
 *   - sessionCodec        — persist/restore lastGenerationId across heartbeats
 *   - detectModel         — read OPENROUTER_MODEL env if present
 *   - listSkills          — minimal stub (filesystem scan)
 *   - syncSkills          — no-op (skills are managed externally)
 *
 * Optional hooks not implemented (deferred to v3):
 *   - getQuotaWindows     — OpenRouter exposes /key endpoint, can be added
 *   - onHireApproved      — only used by cloud adapters
 *   - getConfigSchema     — UI form fields are still declared in src/ui/build-config.ts
 */

import type {
  AdapterSessionCodec,
} from "@paperclipai/adapter-utils";

export { execute } from "./execute.js";
export { testEnvironment, listOpenRouterModels } from "./test.js";
export { listSkills, syncSkills } from "./skills.js";

// ----- sessionCodec -----

/**
 * OpenRouter doesn't have first-class server-side sessions; we persist the
 * last generation id so the run viewer can show a stable display id and
 * future versions can chain conversations across heartbeats.
 */
export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const id = typeof obj.lastGenerationId === "string" ? obj.lastGenerationId : null;
    if (!id) return null;
    return { lastGenerationId: id };
  },
  serialize(params) {
    if (!params || typeof params !== "object") return null;
    const id = typeof params.lastGenerationId === "string" ? params.lastGenerationId : null;
    if (!id) return null;
    return { lastGenerationId: id };
  },
  getDisplayId(params) {
    if (!params || typeof params !== "object") return null;
    const id = (params as Record<string, unknown>).lastGenerationId;
    return typeof id === "string" ? id : null;
  },
};

// ----- detectModel -----

/**
 * Best-effort detection: read OPENROUTER_MODEL or fall back to "openrouter/auto".
 * Other adapters read from on-disk CLI configs; OpenRouter has none, so env
 * is the only meaningful source.
 */
export async function detectModel(): Promise<{
  model: string;
  provider: string;
  source: string;
} | null> {
  const fromEnv = process.env.OPENROUTER_MODEL;
  if (fromEnv && fromEnv.trim().length > 0) {
    return { model: fromEnv.trim(), provider: "openrouter", source: "env:OPENROUTER_MODEL" };
  }
  return { model: "openrouter/auto", provider: "openrouter", source: "default" };
}
