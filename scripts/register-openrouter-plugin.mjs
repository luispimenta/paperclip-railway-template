#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const PAPERCLIP_HOME = process.env.PAPERCLIP_HOME || process.env.HOME || "/paperclip";
const ADAPTER_LOCAL_PATH = "/app/packages/adapters/openrouter";
const storePath = path.join(PAPERCLIP_HOME, "adapter-plugins.json");
const type = "openrouter";
let records = [];
try { if (fs.existsSync(storePath)) { const p = JSON.parse(fs.readFileSync(storePath, "utf8")); if (Array.isArray(p)) records = p; } } catch { records = []; }
const already = records.find((r) => r && r.type === type);
if (already) { already.packageName = "@paperclipai/adapter-openrouter"; already.localPath = ADAPTER_LOCAL_PATH; }
else { records.push({ packageName: "@paperclipai/adapter-openrouter", localPath: ADAPTER_LOCAL_PATH, type, installedAt: new Date().toISOString() }); }
fs.mkdirSync(PAPERCLIP_HOME, { recursive: true });
fs.writeFileSync(storePath, JSON.stringify(records, null, 2));
console.log("registrado em " + storePath);
