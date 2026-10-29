#!/usr/bin/env bash
# Werkt een van de twee web-diensten bij naar het nieuwste image, zonder de andere aan te raken.
#
#   bash bijwerken.sh staging     haalt :staging op en herstart alleen web-staging
#   bash bijwerken.sh productie   maakt eerst een verse back-up, haalt daarna het image van web op
#                                 (:latest, of ELENTRIK_IMAGE) en herstart alleen web
#
# Draai het in de map met compose.yaml en .env (op de NAS met sudo, zoals docker compose zelf). Daarna
# wacht het tot de dienst healthy is en toont het de revisie (commit) van het draaiende image.
set -Eeuo pipefail

GEBRUIK="Gebruik: bijwerken.sh <staging|productie>"
WACHT_SECONDEN=240

case "${1:-}" in
  staging) DIENST=web-staging ;;
  productie) DIENST=web ;;
  *) echo "$GEBRUIK" >&2; exit 2 ;;
esac
[ "$#" -eq 1 ] || { echo "$GEBRUIK" >&2; exit 2; }

cd "$(dirname "$0")"

echo "== ${1}: nieuwste image ophalen (${DIENST})"
docker compose pull "$DIENST"

if [ "$1" = productie ]; then
  echo "== productie: eerst een verse back-up"
  docker compose run -T --rm --no-deps backup --nu
fi

echo "== ${1}: ${DIENST} herstarten (de rest blijft draaien)"
docker compose up -d --no-deps "$DIENST"

CONTAINER="$(docker compose ps -q "$DIENST")"
[ -n "$CONTAINER" ] || { echo "FOUT: de container van ${DIENST} is niet gevonden" >&2; exit 1; }

echo "== ${1}: wachten tot ${DIENST} healthy is (hoogstens ${WACHT_SECONDEN} s)"
STATUS=""
for ((i = 0; i < WACHT_SECONDEN; i += 2)); do
  STATUS="$(docker inspect "$CONTAINER" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}geen{{end}}' 2>/dev/null || echo weg)"
  [ "$STATUS" = healthy ] && break
  # Een gestopte container wordt nooit meer healthy (bijvoorbeeld een mislukte migratie): niet blijven wachten.
  [ "$(docker inspect "$CONTAINER" --format '{{.State.Running}}' 2>/dev/null || echo false)" = true ] || break
  sleep 2
done
if [ "$STATUS" != healthy ]; then
  echo "FOUT: ${DIENST} is niet healthy geworden (status: ${STATUS}). Laatste regels van de log:" >&2
  docker compose logs --no-color --tail 30 "$DIENST" >&2 || true
  exit 1
fi

REVISIE="$(docker inspect "$CONTAINER" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' 2>/dev/null || true)"
IMAGE_ID="$(docker inspect "$CONTAINER" --format '{{.Image}}' | cut -c8-19)"
echo "== ${1}: ${DIENST} is healthy"
echo "   image: ${IMAGE_ID}, revisie: ${REVISIE:-onbekend}"
