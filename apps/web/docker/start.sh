#!/bin/sh
# Entrypoint van het image: eerst de database migreren, dan de server starten. Faalt een migratie,
# dan stopt de container met exitcode 1 en start de app niet (een halve update is erger dan geen).
set -eu
cd /app

if ! node migreer.mjs; then
  echo "Opstarten afgebroken: de migraties zijn mislukt." >&2
  exit 1
fi

exec node .output/server/index.mjs
