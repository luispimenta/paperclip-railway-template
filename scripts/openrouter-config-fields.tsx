import type { AdapterConfigFieldsProps } from "./types";
import {
  Field,
  DraftInput,
  DraftTextarea,
  ToggleField,
  DraftNumberInput,
} from "../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function OpenRouterConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const read = (key: string, def: unknown) => {
    if (isCreate) {
      return values?.adapterSchemaValues?.[key] ?? def;
    }
    return eff("adapterConfig", key, config[key] ?? def);
  };

  const write = (key: string, val: unknown) => {
    if (isCreate) {
      set!({
        adapterSchemaValues: {
          ...(values?.adapterSchemaValues ?? {}),
          [key]: val,
        },
      });
    } else {
      mark("adapterConfig", key, val);
    }
  };

  return (
    <>
      <Field label="OpenRouter API Key" hint="Get your key at https://openrouter.ai/keys">
        <DraftInput
          value={String(read("apiKey", ""))}
          onCommit={(v) => write("apiKey", v || undefined)}
          immediate
          type="password"
          className={inputClass}
          placeholder="sk-or-v1-..."
        />
      </Field>

      <Field label="Routing Strategy">
        <select
          value={String(read("route", "fallback"))}
          onChange={(e) => write("route", e.target.value)}
          className="w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent text-sm text-foreground"
        >
          <option value="fallback">Fallback (auto-retry with other providers)</option>
          <option value="no-fallback">No Fallback (single provider only)</option>
        </select>
      </Field>

      <Field label="System Prompt" hint="Optional system prompt override">
        <DraftTextarea
          value={String(read("systemPrompt", ""))}
          onCommit={(v) => write("systemPrompt", v || undefined)}
          immediate
          placeholder="You are a helpful assistant..."
        />
      </Field>

      <Field label="Temperature" hint="Sampling temperature (0-2)">
        <DraftNumberInput
          value={Number(read("temperature", 0.7))}
          onCommit={(v) => write("temperature", v)}
          immediate
          className={inputClass}
        />
      </Field>

      <Field label="Max Tokens" hint="Maximum tokens to generate">
        <DraftNumberInput
          value={Number(read("maxTokens", 4096))}
          onCommit={(v) => write("maxTokens", v)}
          immediate
          className={inputClass}
        />
      </Field>

      <ToggleField
        label="Enable Streaming"
        checked={read("stream", true) === true}
        onChange={(v) => write("stream", v)}
      />

      <ToggleField
        label="Enable Reasoning (extended thinking)"
        hint="Only works with models that support reasoning (DeepSeek R1, QwQ, etc.)"
        checked={read("reasoning", false) === true}
        onChange={(v) => write("reasoning", v)}
      />
    </>
  );
}
