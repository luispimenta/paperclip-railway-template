#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const PAPERCLIP_ROOT = process.env.PAPERCLIP_ROOT ?? "/paperclip";
const ADAPTER_DIR = path.join(PAPERCLIP_ROOT, "packages/adapters/openrouter");
if (!fs.existsSync(ADAPTER_DIR)) throw new Error(`Adapter não encontrado em ${ADAPTER_DIR}`);
const pkgPath = path.join(ADAPTER_DIR, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.name = "@paperclipai/adapter-openrouter";
pkg.main = "./dist/plugin.js";
pkg.types = "./dist/plugin.d.ts";
pkg.exports = { ".": "./dist/plugin.js", "./server": "./dist/server/index.js", "./ui": "./dist/ui/index.js", "./cli": "./dist/cli/index.js" };
pkg.scripts = { ...(pkg.scripts ?? {}), build: "tsc" };
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
fs.writeFileSync(path.join(ADAPTER_DIR, "src", "plugin.ts"),
`import * as root from "./index.js";
import * as server from "./server/index.js";
export function createServerAdapter() {
  return { type: root.type, label: root.label, execute: server.execute, testEnvironment: server.testEnvironment, sessionCodec: server.sessionCodec, detectModel: server.detectModel, listSkills: server.listSkills, syncSkills: server.syncSkills, models: root.models, agentConfigurationDoc: root.agentConfigurationDoc, supportsLocalAgentJwt: false, supportsInstructionsBundle: false, requiresMaterializedRuntimeSkills: false };
}
`);
fs.writeFileSync(path.join(ADAPTER_DIR, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext", outDir: "./dist", rootDir: "./src", declaration: true, strict: false, skipLibCheck: true, esModuleInterop: true }, include: ["src/**/*"] }, null, 2) + "\n");
console.log("setup ok");
