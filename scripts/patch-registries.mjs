#!/usr/bin/env node
/**
 * patch-registries.mjs
 *
 * Aplica o adapter OpenRouter nos três registries do Paperclip e
 * adiciona a dependência workspace:* nos package.json de server, ui e cli.
 */

import fs from "fs";
import path from "path";

const PAPERCLIP_ROOT = process.env.PAPERCLIP_ROOT ?? "/paperclip";

function readFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
    }
    return fs.readFileSync(filePath, "utf8");
}

function writeFile(filePath, content) {
    fs.writeFileSync(filePath, content, "utf8");
    console.log(`  ✔ escrito: ${filePath}`);
}

function insertBefore(content, beforeLine, toInsert) {
    if (content.includes(toInsert.trim())) {
        console.log("  ⚠ trecho já presente, pulando inserção.");
        return content;
    }
    const idx = content.indexOf(beforeLine);
    if (idx === -1) {
        throw new Error(
            `Âncora não encontrada no arquivo:\n  "${beforeLine}"\n\nVerifique se o upstream mudou a estrutura do arquivo.`
        );
    }
    return content.slice(0, idx) + toInsert + "\n" + content.slice(idx);
}

// ─── 1. Server Registry ──────────────────────────────────────────────────────
console.log("\n[1/4] Patchando server/src/adapters/registry.ts ...");
{
    const filePath = path.join(PAPERCLIP_ROOT, "server/src/adapters/registry.ts");
    let src = readFile(filePath);

    const serverImports = `import * as openrouterServer from "@paperclipai/adapter-openrouter/server";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";`;

    const serverEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    execute: openrouterServer.execute,
    testEnvironment: openrouterServer.testEnvironment,
    sessionCodec: openrouterServer.sessionCodec,
    detectModel: openrouterServer.detectModel,
    listSkills: openrouterServer.listSkills,
    syncSkills: openrouterServer.syncSkills,
  },`;

    src = insertBefore(src, "\nexport ", serverImports + "\n");
    src = insertBefore(src, "\n};", "\n" + serverEntry);
    writeFile(filePath, src);
}

// ─── 2. UI Registry ──────────────────────────────────────────────────────────
console.log("\n[2/4] Patchando ui/src/adapters/registry.ts ...");
{
    const filePath = path.join(PAPERCLIP_ROOT, "ui/src/adapters/registry.ts");
    let src = readFile(filePath);

    const uiImports = `import * as openrouterUi from "@paperclipai/adapter-openrouter/ui";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";`;

    const uiEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    parseStdout: openrouterUi.parseStdout,
    buildConfig: openrouterUi.buildConfig,
    configFields: openrouterUi.configFields,
  },`;

    src = insertBefore(src, "\nexport ", uiImports + "\n");
    src = insertBefore(src, "\n};", "\n" + uiEntry);
    writeFile(filePath, src);
}

// ─── 3. CLI Registry ─────────────────────────────────────────────────────────
console.log("\n[3/4] Patchando cli/src/adapters/registry.ts ...");
{
    const filePath = path.join(PAPERCLIP_ROOT, "cli/src/adapters/registry.ts");
    if (fs.existsSync(filePath)) {
        let src = readFile(filePath);

        const cliImports = `import * as openrouterCli from "@paperclipai/adapter-openrouter/cli";
import { type as openrouterType, label as openrouterLabel } from "@paperclipai/adapter-openrouter";`;

        const cliEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    formatEvent: openrouterCli.formatEvent,
  },`;

        src = insertBefore(src, "\nexport ", cliImports + "\n");
        src = insertBefore(src, "\n};", "\n" + cliEntry);
        writeFile(filePath, src);
    } else {
        console.log("  ⚠ cli/src/adapters/registry.ts não encontrado, pulando.");
    }
}

// ─── 4. Dependência workspace:* nos package.json ─────────────────────────────
console.log("\n[4/4] Adicionando dependência workspace:* nos package.json ...");
for (const pkg of ["server", "ui", "cli"]) {
    const filePath = path.join(PAPERCLIP_ROOT, `packages/${pkg}/package.json`);
    if (!fs.existsSync(filePath)) continue;
    const json = JSON.parse(readFile(filePath));

    json.dependencies = json.dependencies ?? {};
    if (json.dependencies["@paperclipai/adapter-openrouter"]) {
        console.log(`  ⚠ ${pkg}/package.json já tem a dependência, pulando.`);
        continue;
    }
    json.dependencies["@paperclipai/adapter-openrouter"] = "workspace:*";
    writeFile(filePath, JSON.stringify(json, null, 2) + "\n");
}

console.log("\n✅ Todos os patches aplicados com sucesso!\n");
