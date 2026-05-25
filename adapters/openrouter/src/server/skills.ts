import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillSnapshot,
  AdapterSkillEntry,
} from "@paperclipai/adapter-utils";
import type { OnLog } from "./transcript.js";
import { writeRawStderr } from "./transcript.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LoadedSkill {
  name: string;
  path: string;
  content: string;
}

export interface LoadSkillsParams {
  agentConfig: Record<string, unknown>;
  onLog: OnLog;
}

interface PaperclipSkillEntry {
  key: string;
  runtimeName: string;
  source: string;
  required: boolean;
  requiredReason: string | null;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function resolveSkillsRoot(agentConfig: Record<string, unknown>): string {
  const fromConfig = typeof agentConfig.skillsDir === "string" ? agentConfig.skillsDir.trim() : "";
  if (fromConfig) return fromConfig;
  const fromEnv = process.env.PAPERCLIP_SKILLS_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const home = process.env.HOME || process.env.USERPROFILE || ".";
  return path.join(home, ".openrouter-adapter", "skills");
}

function parseRuntimeSkills(value: unknown): PaperclipSkillEntry[] {
  if (!Array.isArray(value)) return [];
  const out: PaperclipSkillEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const key = typeof entry.key === "string" ? entry.key.trim() : "";
    const runtimeName = typeof entry.runtimeName === "string" ? entry.runtimeName.trim() : "";
    const source = typeof entry.source === "string" ? entry.source.trim() : "";
    if (!key || !runtimeName || !source) continue;
    out.push({
      key,
      runtimeName,
      source,
      required: Boolean(entry.required),
      requiredReason: typeof entry.requiredReason === "string" ? entry.requiredReason : null,
    });
  }
  return out;
}

function resolveDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: PaperclipSkillEntry[],
): string[] {
  const raw = config.paperclipSkillSync;
  let explicit = false;
  let desiredPref: string[] = [];
  
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    explicit = Object.prototype.hasOwnProperty.call(raw, "desiredSkills");
    const desiredValues = (raw as Record<string, unknown>).desiredSkills;
    if (Array.isArray(desiredValues)) {
      desiredPref = desiredValues
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean);
    }
  }

  const requiredSkills = availableEntries
    .filter((entry) => entry.required)
    .map((entry) => entry.key);

  if (!explicit) {
    return Array.from(new Set(requiredSkills));
  }

  const desiredSkills = desiredPref
    .map((ref) => {
      const normalized = ref.trim().toLowerCase();
      if (!normalized) return "";
      const exact = availableEntries.find((e) => e.key.trim().toLowerCase() === normalized);
      if (exact) return exact.key;
      const byName = availableEntries.find((e) => e.runtimeName && e.runtimeName.trim().toLowerCase() === normalized);
      if (byName) return byName.key;
      return normalized;
    })
    .filter(Boolean);

  return Array.from(new Set([...requiredSkills, ...desiredSkills]));
}

async function listSkillsFromDirectory(root: string): Promise<PaperclipSkillEntry[]> {
  if (!(await pathExists(root))) return [];
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const loaded: PaperclipSkillEntry[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      const skillName = entry.name;
      const skillDir = path.join(root, skillName);
      const skillMdPath = path.join(skillDir, "SKILL.md");
      if (!(await pathExists(skillMdPath))) continue;
      loaded.push({
        key: `paperclipai/paperclip/${skillName}`,
        runtimeName: skillName,
        source: skillDir,
        required: false,
        requiredReason: null,
      });
    }
    return loaded;
  } catch {
    return [];
  }
}

async function getAvailableEntries(config: Record<string, unknown>): Promise<PaperclipSkillEntry[]> {
  const configured = parseRuntimeSkills(config.paperclipRuntimeSkills);
  if (configured.length > 0) return configured;
  
  const customRoot = resolveSkillsRoot(config);
  return listSkillsFromDirectory(customRoot);
}

export async function loadSkills(params: LoadSkillsParams): Promise<LoadedSkill[]> {
  const { agentConfig, onLog } = params;

  const availableEntries = await getAvailableEntries(agentConfig);
  if (availableEntries.length === 0) return [];

  const desiredSkills = resolveDesiredSkillNames(agentConfig, availableEntries);
  const desiredSet = new Set(desiredSkills);

  const loaded: LoadedSkill[] = [];
  for (const entry of availableEntries) {
    if (!desiredSet.has(entry.key)) continue;
    const skillMdPath = path.join(entry.source, "SKILL.md");
    if (!(await pathExists(skillMdPath))) continue;
    try {
      const content = await fs.readFile(skillMdPath, "utf8");
      loaded.push({ name: entry.runtimeName, path: skillMdPath, content });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await writeRawStderr(onLog, `[openrouter] failed to read skill "${entry.runtimeName}": ${reason}`);
    }
  }
  return loaded;
}

export function renderSkillsForPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) return "";
  const blocks = skills.map((s) => `## Skill: ${s.name}\n\n${s.content.trim()}`);
  return [
    "# Available Skills",
    "",
    "The following skills are available to you. Read them carefully and apply them when relevant.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

export async function listSkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  const availableEntries = await getAvailableEntries(ctx.config);
  const desiredSkills = resolveDesiredSkillNames(ctx.config, availableEntries);
  const desiredSet = new Set(desiredSkills);

  const entries: AdapterSkillEntry[] = availableEntries.map((entry) => ({
    key: entry.key,
    runtimeName: entry.runtimeName,
    desired: desiredSet.has(entry.key),
    managed: true,
    state: desiredSet.has(entry.key) ? "configured" : "available",
    origin: entry.required ? "paperclip_required" : "company_managed",
    originLabel: entry.required ? "Required by Paperclip" : "Managed by Paperclip",
    readOnly: false,
    sourcePath: entry.source,
    targetPath: null,
    required: Boolean(entry.required),
    requiredReason: entry.requiredReason ?? null,
  }));

  const warnings: string[] = [];
  const availableByKey = new Map(availableEntries.map((entry) => [entry.key, entry]));
  for (const desiredSkill of desiredSkills) {
    if (availableByKey.has(desiredSkill)) continue;
    warnings.push(`Desired skill "${desiredSkill}" is not available.`);
    entries.push({
      key: desiredSkill,
      runtimeName: null,
      desired: true,
      managed: true,
      state: "missing",
      origin: "external_unknown",
      originLabel: "External or unavailable",
      readOnly: false,
      sourcePath: undefined,
      targetPath: undefined,
      required: false,
      requiredReason: null,
    });
  }

  return {
    adapterType: "openrouter",
    supported: true,
    mode: "ephemeral",
    desiredSkills,
    entries,
    warnings,
  };
}

export async function syncSkills(
  ctx: AdapterSkillContext,
  _desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  return listSkills(ctx);
}
