import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillSnapshot,
  AdapterSkillEntry,
} from "@paperclipai/adapter-utils";
import {
  readPaperclipRuntimeSkillEntries,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";
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

export async function loadSkills(params: LoadSkillsParams): Promise<LoadedSkill[]> {
  const { agentConfig, onLog } = params;

  // Resolve runtime skills and desired skills from paperclip config
  const customRoot = resolveSkillsRoot(agentConfig);
  const availableEntries = await readPaperclipRuntimeSkillEntries(agentConfig, __dirname, [customRoot]);

  if (availableEntries.length > 0) {
    const desiredSkills = resolvePaperclipDesiredSkillNames(agentConfig, availableEntries);
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

  // Fallback: scan custom/default root
  const root = resolveSkillsRoot(agentConfig);
  if (!(await pathExists(root))) {
    return [];
  }

  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await writeRawStderr(onLog, `[openrouter] could not read skills root ${root}: ${reason}`);
    return [];
  }

  const loaded: LoadedSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const skillName = entry.name;
    const skillMdPath = path.join(root, skillName, "SKILL.md");
    if (!(await pathExists(skillMdPath))) continue;
    try {
      const content = await fs.readFile(skillMdPath, "utf8");
      loaded.push({ name: skillName, path: skillMdPath, content });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await writeRawStderr(onLog, `[openrouter] failed to read skill "${skillName}": ${reason}`);
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
  const customRoot = resolveSkillsRoot(ctx.config);
  const availableEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __dirname, [customRoot]);
  const desiredSkills = resolvePaperclipDesiredSkillNames(ctx.config, availableEntries);
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
