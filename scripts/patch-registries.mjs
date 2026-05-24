#!/usr/bin/env node
/**
 * patch-registries.mjs
 *
 * Aplica o adapter OpenRouter nos três registries do Paperclip e
 * adiciona a dependência workspace:* nos package.json de server, ui e cli.
 *
 * Uso dentro do Dockerfile (após o git clone do Paperclip):
 *   COPY scripts/patch-registries.mjs /tmp/patch-registries.mjs
 *   RUN node /tmp/patch-registries.mjs
 */

import fs from "fs";
import path from "path";

const PAPERCLIP_ROOT = process.env.PAPERCLIP_ROOT ?? "/paperclip";

// ─── helpers ────────────────────────────────────────────────────────────────

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

/**
 * Insere `toInsert` logo depois da primeira linha que contém `afterLine`.
 * Lança erro se `afterLine` não for encontrado ou se `toInsert` já existir.
 */
function insertAfter(content, afterLine, toInsert) {
    if (content.includes(toInsert.trim())) {
        console.log("  ⚠ trecho já presente, pulando inserção.");
        return content;
    }
    const idx = content.indexOf(afterLine);
    if (idx === -1) {
        throw new Error(
            `Âncora não encontrada no arquivo:\n  "${afterLine}"\n\nVerifique se o upstream mudou a estrutura do arquivo.`
        );
    }
    const insertAt = idx + afterLine.length;
    return content.slice(0, insertAt) + "\n" + toInsert + content.slice(insertAt);
}

/**
 * Insere `toInsert` logo ANTES da primeira ocorrência de `beforeLine`.
 */
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
    const filePath = path.join(PAPERCLIP_ROOT, "packages/server/src/adapters/registry.ts");
    let src = readFile(filePath);

    // Importações – inserir após a última linha de import já existente.
    // Usamos a primeira linha "import " como âncora para garantir que ficam no topo.
    const serverImports = `import { execute as openrouterExecute, test as openrouterTest } from "@paperclipai/adapter-openrouter/server";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";`;

    // Entrada no mapa de adapters
    const serverEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    execute: openrouterExecute,
    test: openrouterTest,
  },`;

    // Coloca os imports antes da primeira linha "export"
    src = insertBefore(src, "\nexport ", serverImports + "\n");

    // Coloca a entrada antes do fechamento do objeto adapters  (linha "};")
    src = insertBefore(src, "\n};", "\n" + serverEntry);

    writeFile(filePath, src);
}

// ─── 2. UI Registry ──────────────────────────────────────────────────────────

console.log("\n[2/4] Patchando ui/src/adapters/registry.ts ...");
{
    const filePath = path.join(PAPERCLIP_ROOT, "packages/ui/src/adapters/registry.ts");
    let src = readFile(filePath);

    const uiImports = `import { parseStdout as openrouterParseStdout, buildConfig as openrouterBuildConfig, configFields as openrouterConfigFields } from "@paperclipai/adapter-openrouter/ui";
import { type as openrouterType, label as openrouterLabel, models as openrouterModels } from "@paperclipai/adapter-openrouter";`;

    const uiEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    models: openrouterModels,
    parseStdout: openrouterParseStdout,
    buildConfig: openrouterBuildConfig,
    configFields: openrouterConfigFields,
  },`;

    src = insertBefore(src, "\nexport ", uiImports + "\n");
    src = insertBefore(src, "\n};", "\n" + uiEntry);

    writeFile(filePath, src);
}

// ─── 3. CLI Registry ─────────────────────────────────────────────────────────

console.log("\n[3/4] Patchando cli/src/adapters/registry.ts ...");
{
    const filePath = path.join(PAPERCLIP_ROOT, "packages/cli/src/adapters/registry.ts");
    let src = readFile(filePath);

    const cliImports = `import { formatEvent as openrouterFormatEvent } from "@paperclipai/adapter-openrouter/cli";
import { type as openrouterType, label as openrouterLabel } from "@paperclipai/adapter-openrouter";`;

    const cliEntry = `  [openrouterType]: {
    type: openrouterType,
    label: openrouterLabel,
    formatEvent: openrouterFormatEvent,
  },`;

    src = insertBefore(src, "\nexport ", cliImports + "\n");
    src = insertBefore(src, "\n};", "\n" + cliEntry);

    writeFile(filePath, src);
}

// ─── 4. Dependência workspace:* nos package.json ─────────────────────────────

console.log("\n[4/4] Adicionando dependência workspace:* nos package.json ...");
for (const pkg of ["server", "ui", "cli"]) {
    const filePath = path.join(PAPERCLIP_ROOT, `packages/${pkg}/package.json`);
    const json = JSON.parse(readFile(filePath));

    json.dependencies = json.dependencies ?? {};
    if (json.dependencies["@paperclipai/adapter-openrouter"]) {
        console.log(`  ⚠ packages/${pkg}/package.json já tem a dependência, pulando.`);
        continue;
    }
    json.dependencies["@paperclipai/adapter-openrouter"] = "workspace:*";
    writeFile(filePath, JSON.stringify(json, null, 2) + "\n");
}

console.log("\n✅ Todos os patches aplicados com sucesso!\n");
