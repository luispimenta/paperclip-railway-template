# Build upstream Paperclip from a pinned ref.
FROM node:22-bookworm AS paperclip-build
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

ARG PAPERCLIP_REPO=https://github.com/paperclipai/paperclip.git
ARG PAPERCLIP_REF=v2026.517.0

WORKDIR /paperclip
RUN git clone --depth 1 --branch "${PAPERCLIP_REF}" "${PAPERCLIP_REPO}" .

# Copia o adapter para DENTRO do monorepo (para ter acesso aos workspace deps
# @paperclipai/adapter-utils e @paperclipai/shared).
COPY adapters/openrouter /paperclip/packages/adapters/openrouter

# Prepara o adapter como plugin externo:
#   - renomeia o pacote para @paperclipai/adapter-openrouter
#   - gera src/plugin.ts com createServerAdapter()
#   - aponta exports/main para ./dist
#   - escreve tsconfig que emite para ./dist
COPY scripts/setup-openrouter-adapter.mjs /tmp/setup-openrouter-adapter.mjs
RUN node /tmp/setup-openrouter-adapter.mjs

COPY scripts/patch-registries.mjs /tmp/patch-registries.mjs
RUN node /tmp/patch-registries.mjs
# Instala tudo (linka o workspace) e compila o monorepo + o adapter.
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @paperclipai/ui build
RUN pnpm --filter @paperclipai/plugin-sdk build
RUN pnpm --filter @paperclipai/server build
RUN pnpm --filter @paperclipai/adapter-openrouter build
RUN test -f server/dist/index.js
RUN test -f packages/adapters/openrouter/dist/plugin.js
RUN node --input-type=module --eval "\
  const m = await import('/paperclip/packages/adapters/openrouter/dist/plugin.js');\
  if (typeof m.createServerAdapter !== 'function') throw new Error('createServerAdapter not exported; got: ' + JSON.stringify(Object.keys(m)));\
  const a = m.createServerAdapter();\
  if (!a || !a.type) throw new Error('type missing from createServerAdapter()');\
  console.log('[plugin-test] OK type=' + a.type);"

# Runtime image (direct Paperclip server, no wrapper).
FROM node:22-bookworm
ENV NODE_ENV=production
ENV CLAUDE_CODE_BUBBLEWRAP=1
ENV HOME=/paperclip \
    PAPERCLIP_HOME=/paperclip/.paperclip \
    PAPERCLIP_INSTANCE_ID=default \
    PAPERCLIP_CONFIG=/paperclip/instances/default/config.json \
    OPENCODE_ALLOW_ALL_MODELS=true

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    ripgrep \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

WORKDIR /app
COPY --from=paperclip-build /paperclip /app

WORKDIR /wrapper
COPY package.json /wrapper/package.json
RUN npm install --omit=dev && npm cache clean --force
COPY src /wrapper/src
COPY scripts/entrypoint.sh /wrapper/entrypoint.sh
COPY scripts/register-openrouter-plugin.mjs /wrapper/scripts/register-openrouter-plugin.mjs
COPY scripts/bootstrap-ceo.mjs /wrapper/template/bootstrap-ceo.mjs
RUN chmod +x /wrapper/entrypoint.sh

RUN npm install --global --omit=dev @anthropic-ai/claude-code@latest @openai/codex@latest @google/gemini-cli@latest opencode-ai
RUN npm install --global --omit=dev tsx
RUN mkdir -p /paperclip \
    && chown -R node:node /app /paperclip /wrapper
RUN node /wrapper/scripts/register-openrouter-plugin.mjs \
    && chown node:node /paperclip/.paperclip/adapter-plugins.json

EXPOSE 3100
ENTRYPOINT ["/wrapper/entrypoint.sh"]
CMD ["node", "/wrapper/src/server.js"]
