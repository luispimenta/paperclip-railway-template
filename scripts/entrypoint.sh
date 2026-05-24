#!/bin/sh
set -e
mkdir -p /paperclip/instances/default/logs
chown -R node:node /paperclip
node /wrapper/scripts/register-openrouter-plugin.mjs || echo "[entrypoint] aviso: registro falhou"
chown -R node:node /paperclip
unset SUDO_USER SUDO_UID SUDO_GID SUDO_COMMAND 2>/dev/null || true
exec setpriv --reuid=node --regid=node --init-groups --inh-caps=-all "$@"
