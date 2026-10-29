#!/usr/bin/env bash
# Rooktest voor het Docker-image en deploy/nas/compose.yaml. Draait op de ontwikkelmachine met
# Docker Desktop (of Docker op Linux/macOS), tegen de lokale Mailpit uit infra/docker-compose.yml.
#
#   bash deploy/nas/rooktest.sh
#
# Wat hij doet:
#   1. bouwt het image en start compose met .env.rooktest en een override die alleen `web` op
#      127.0.0.1:3399 publiceert (eigen projectnaam, eigen netwerknaam, eigen tijdelijke map);
#   2. controleert de migraties, de aanmeldpagina, registreren + inloggen + SSR met sessie,
#      een project met een PDF-export via Gotenberg, de back-up (backup.sh --nu) en de pdf.js-bronnen;
#   3. start een kopie van het image met een opzettelijk kapotte migratie (moet stoppen met exitcode
#      != 0 en nooit gezond worden) en een container met een ontbrekende variabele (de log noemt de
#      naam, nooit de waarde);
#   4. ruimt alles op: containers, netwerk, volume, test-images en de tijdelijke map.
#
# Raakt nooit de lokale infra (postgres 5432, gotenberg 3001): alleen Mailpit wordt gelezen (8025) en
# gebruikt als SMTP-host (1025). Zet ROOKTEST_BEHOUD=1 om na afloop niets op te ruimen.
set -Eeuo pipefail

# Git Bash op Windows zet argumenten als /backups om in C:/Program Files/Git/backups; voor docker
# moet dat uit. Alleen voor docker, want curl heeft de omzetting nodig voor /dev/null.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }

POORT=3399
MAILPIT=http://127.0.0.1:8025
BASIS="http://127.0.0.1:${POORT}"
PG_IMAGE=postgres:16.14-alpine

# Padden die native programma's (docker, curl) begrijpen: C:/... in plaats van /c/... op Windows.
pad() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

ROOT="$(pad "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
ID="$(date +%s)$RANDOM"
PROJECT="elentrik-rooktest-${ID}"
IMAGE="elentrik-web:rooktest-${ID}"
IMAGE_KAPOT="elentrik-web:rooktest-kapot-${ID}"
TMP="$(pad "$(mktemp -d)")"
DATA="${TMP}/data"
mkdir -p "${DATA}/postgres" "${DATA}/bestanden" "${DATA}/backups"

export ELENTRIK_DATA="$DATA"
export ELENTRIK_IMAGE="$IMAGE"
export ROOK_NAAM="$PROJECT"

AANTAL=0
stap() { printf '\n== %s\n' "$*"; }
goed() { AANTAL=$((AANTAL + 1)); printf '   OK  %s\n' "$*"; }
faal() { printf '   FOUT  %s\n' "$*" >&2; exit 1; }

compose() {
  docker compose -p "$PROJECT" --env-file "${ROOT}/deploy/nas/.env.rooktest" \
    -f "${ROOT}/deploy/nas/compose.yaml" -f "${TMP}/override.yaml" "$@"
}

# Wacht (hoogstens $2 seconden) tot container $1 gestopt is en geeft de exitcode, of "timeout".
wacht_op_stop() {
  local i
  for ((i = 0; i < $2; i++)); do
    if [ "$(docker inspect "$1" --format '{{.State.Running}}')" = false ]; then
      docker inspect "$1" --format '{{.State.ExitCode}}'
      return 0
    fi
    sleep 1
  done
  echo timeout
}

# Leest een veld (a.b.c) uit JSON op stdin.
jget() {
  node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{let v=JSON.parse(s);for(const k of process.argv[1].split("."))v=v?.[k];console.log(v??"")})' "$1"
}

OPGERUIMD=0
COMPOSE_GESTART=0
opruimen() {
  local code=$?
  trap - EXIT
  [ "$OPGERUIMD" = 1 ] && exit "$code"
  OPGERUIMD=1
  set +e
  if [ "$code" -ne 0 ] && [ "$COMPOSE_GESTART" = 1 ]; then
    printf '\n--- logs van web (laatste 60 regels) ---\n' >&2
    compose logs --no-color --tail 60 web >&2
  fi
  if [ "${ROOKTEST_BEHOUD:-}" = 1 ]; then
    printf '\nROOKTEST_BEHOUD=1: project %s, map %s en image %s blijven staan.\n' "$PROJECT" "$TMP" "$IMAGE" >&2
    exit "$code"
  fi
  printf '\n== Opruimen\n'
  docker rm -f "${PROJECT}-kapot" "${PROJECT}-zonder" >/dev/null 2>&1
  [ "$COMPOSE_GESTART" = 1 ] && compose down -v --remove-orphans --timeout 5 >/dev/null 2>&1
  # Bestanden die de containers aanmaakten, kunnen van een andere gebruiker zijn.
  docker run --rm -v "${TMP}:/d" --entrypoint sh "$PG_IMAGE" -c 'rm -rf /d/data' >/dev/null 2>&1
  docker rmi -f "$IMAGE" "$IMAGE_KAPOT" >/dev/null 2>&1
  rm -rf "$TMP"
  if [ "$code" -eq 0 ]; then printf 'Rooktest geslaagd: %s controles OK.\n' "$AANTAL"; fi
  exit "$code"
}
trap opruimen EXIT
trap 'exit 130' INT TERM

# ---------------------------------------------------------------- voorwaarden
stap "Voorwaarden"
command -v docker >/dev/null || faal "docker ontbreekt"
command -v node >/dev/null || faal "node ontbreekt"
docker info >/dev/null 2>&1 || faal "Docker draait niet"
curl -s --max-time 3 -o /dev/null "${MAILPIT}/api/v1/info" || faal "Mailpit is niet bereikbaar op ${MAILPIT} (start met: pnpm db:up)"
if curl -s --max-time 2 -o /dev/null "${BASIS}/"; then faal "poort ${POORT} is al in gebruik"; fi
goed "Docker, Mailpit en poort ${POORT} zijn in orde"

# De NAS-compose zelf, met het voorbeeldbestand: geldig, geen enkele gepubliceerde poort, het vaste
# netwerk, en elke variabele die compose gebruikt staat in .env.voorbeeld.
[ -f "${ROOT}/deploy/nas/compose.yaml" ] || faal "deploy/nas/compose.yaml ontbreekt"
NAS_CONFIG="$(docker compose --env-file "${ROOT}/deploy/nas/.env.voorbeeld" -f "${ROOT}/deploy/nas/compose.yaml" config --format json)" \
  || faal "compose.yaml is ongeldig met .env.voorbeeld"
printf '%s' "$NAS_CONFIG" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const c = JSON.parse(s);
    const fouten = [];
    for (const [naam, d] of Object.entries(c.services)) {
      if (d.ports && d.ports.length) fouten.push(naam + " publiceert een poort");
    }
    for (const naam of ["web", "postgres", "gotenberg", "backup"]) {
      if (!c.services[naam]) fouten.push("dienst " + naam + " ontbreekt");
    }
    const n = c.networks && c.networks.elentrik;
    if (!n || n.name !== "elentrik" || n.ipam.config[0].subnet !== "172.30.70.0/24") fouten.push("netwerk elentrik of subnet klopt niet");
    if (c.services.web.environment.ELENTRIK_VERTROUWD_PROXYNET !== "172.30.70.0/24") fouten.push("ELENTRIK_VERTROUWD_PROXYNET klopt niet");
    if (fouten.length) {
      console.error(fouten.join("\n"));
      process.exit(1);
    }
  });' || faal "compose.yaml voldoet niet aan de eisen"
for NAAM in $(grep -oE '\$\{[A-Z_]+' "${ROOT}/deploy/nas/compose.yaml" | tr -d '${' | sort -u); do
  grep -qE "^#? ?${NAAM}=" "${ROOT}/deploy/nas/.env.voorbeeld" || faal "${NAAM} staat niet in .env.voorbeeld"
done
goed "compose.yaml is geldig, publiceert geen poorten, heeft netwerk elentrik (172.30.70.0/24) en alle variabelen staan in .env.voorbeeld"

# ---------------------------------------------------------------- bouwen
stap "Image bouwen"
docker build -f "${ROOT}/apps/web/Dockerfile" -t "$IMAGE" "$ROOT" >"${TMP}/build.log" 2>&1 \
  || { tail -60 "${TMP}/build.log" >&2; faal "docker build mislukt"; }
GROOTTE="$(docker image inspect "$IMAGE" --format '{{.Size}}')"
goed "image gebouwd: $((GROOTTE / 1024 / 1024)) MB"
GEBRUIKER="$(docker image inspect "$IMAGE" --format '{{.Config.User}}')"
[ -n "$GEBRUIKER" ] && [ "$GEBRUIKER" != "root" ] && [ "$GEBRUIKER" != "0" ] || faal "het image draait als root"
goed "het image draait als gebruiker '${GEBRUIKER}'"

# ---------------------------------------------------------------- compose starten
stap "Compose starten"
cat >"${TMP}/override.yaml" <<EOF
# Alleen voor de rooktest: de enige gepubliceerde poort, een eigen netwerknaam en container, de host
# voor Mailpit, en een named volume voor Postgres (een bind mount van Windows kan de rechten niet houden).
services:
  web:
    container_name: ${ROOK_NAAM}-web
    ports:
      - "127.0.0.1:${POORT}:3000"
    extra_hosts:
      - "host.docker.internal:host-gateway"
  postgres:
    volumes:
      - rooktest-postgres:/var/lib/postgresql/data
networks:
  elentrik:
    name: ${ROOK_NAAM}
volumes:
  rooktest-postgres: {}
EOF
compose config -q || faal "compose config is ongeldig"
COMPOSE_GESTART=1
compose up -d >/dev/null || faal "compose up mislukt"

printf '   wachten op %s/api/gezondheid ...\n' "$BASIS"
GEZOND=0
for _ in $(seq 1 90); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "${BASIS}/api/gezondheid" || true)" = 200 ]; then GEZOND=1; break; fi
  sleep 2
done
[ "$GEZOND" = 1 ] || faal "/api/gezondheid werd niet 200 binnen 3 minuten"
goed "/api/gezondheid geeft 200"
[ "$(curl -s "${BASIS}/api/gezondheid" | jget ok)" = true ] || faal "/api/gezondheid geeft niet { ok: true }"

# Docker's eigen HEALTHCHECK (node + /api/gezondheid in het image) moet ook slagen.
GEZONDHEID_WEB=""
for _ in $(seq 1 30); do
  GEZONDHEID_WEB="$(docker inspect "${PROJECT}-web" --format '{{.State.Health.Status}}')"
  [ "$GEZONDHEID_WEB" = healthy ] && break
  sleep 2
done
[ "$GEZONDHEID_WEB" = healthy ] || faal "de HEALTHCHECK van web werd niet healthy (status: ${GEZONDHEID_WEB})"
goed "de HEALTHCHECK van het image meldt healthy"

UID_WEB="$(docker exec "${PROJECT}-web" id -u)"
[ "$UID_WEB" != 0 ] || faal "web draait als root"
goed "web draait niet als root (uid ${UID_WEB})"

# ---------------------------------------------------------------- 1. migraties
stap "1. Migraties"
VERWACHT="$(node -p "JSON.parse(require('node:fs').readFileSync('${ROOT}/apps/web/server/db/migraties/meta/_journal.json','utf8')).entries.length")"
psql_db() { compose exec -T postgres psql -U elentrik -d elentrik -tA -c "$1"; }
TELLING="$(psql_db 'select count(*) from drizzle.__drizzle_migrations' | tr -d '[:space:]')"
[ "$TELLING" = "$VERWACHT" ] || faal "__drizzle_migrations telt ${TELLING}, verwacht ${VERWACHT}"
goed "__drizzle_migrations telt alle ${VERWACHT} migraties"

# ---------------------------------------------------------------- 2. aanmeldpagina
stap "2. Aanmeldpagina"
CODE="$(curl -s -o "${TMP}/inloggen.html" -w '%{http_code} %{content_type}' "${BASIS}/inloggen")"
case "$CODE" in "200 text/html"*) ;; *) faal "/inloggen gaf '${CODE}'" ;; esac
grep -qi '<html' "${TMP}/inloggen.html" || faal "/inloggen is geen HTML"
goed "/inloggen geeft 200 en HTML"

# pdf.js haalt zijn bronnen van de eigen server (nitro.publicAssets): ze moeten in het image zitten.
PDFJS_BESTAND="$(docker run --rm --entrypoint sh "$IMAGE" -c 'cd /app/.output/public && find pdfjs -type f | head -1')"
[ -n "$PDFJS_BESTAND" ] || faal "geen pdfjs-bronnen in .output/public"
[ "$(curl -s -o /dev/null -w '%{http_code}' "${BASIS}/${PDFJS_BESTAND}")" = 200 ] || faal "/${PDFJS_BESTAND} wordt niet geserveerd"
goed "pdf.js-bronnen worden geserveerd (/${PDFJS_BESTAND})"

# ---------------------------------------------------------------- 3. registreren, bevestigen, inloggen, SSR
stap "3. Registreren, bevestigen, inloggen en SSR met sessie"
EMAIL="rooktest-${ID}@rooktest.elentrik.test"
WACHTWOORD="Rooktest-wachtwoord-${ID}"
NAAM="Rooktest Gebruiker"
JAR="${TMP}/cookies.txt"

CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "origin: ${BASIS}" \
  --data "{\"name\":\"${NAAM}\",\"email\":\"${EMAIL}\",\"password\":\"${WACHTWOORD}\",\"wachtendeBedrijfsnaam\":\"Rooktest Elektro\"}" \
  "${BASIS}/api/auth/sign-up/email")"
[ "$CODE" = 200 ] || faal "registreren gaf ${CODE}"
goed "registreren geeft 200"

MAIL_ID=""
for _ in $(seq 1 40); do
  MAIL_ID="$(curl -s -G --data-urlencode "query=to:${EMAIL}" "${MAILPIT}/api/v1/search" | jget messages.0.ID || true)"
  [ -n "$MAIL_ID" ] && break
  sleep 0.5
done
[ -n "$MAIL_ID" ] || faal "geen bevestigingsmail in Mailpit"
TEKST="$(curl -s "${MAILPIT}/api/v1/message/${MAIL_ID}" | jget Text)"
LINK="$(printf '%s' "$TEKST" | grep -oE "${BASIS}/[^[:space:]<>\"]+" | head -1 || true)"
[ -n "$LINK" ] || faal "geen link naar ${BASIS} in de bevestigingsmail"
# Alleen onze eigen mail uit de gedeelde Mailpit-inbox verwijderen.
curl -s -X DELETE -H 'content-type: application/json' --data "{\"IDs\":[\"${MAIL_ID}\"]}" "${MAILPIT}/api/v1/messages" >/dev/null || true
goed "bevestigingsmail ontvangen via Mailpit (SMTP vanuit de container)"

CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" "$LINK")"
case "$CODE" in 2*|3*) ;; *) faal "bevestigen gaf ${CODE}" ;; esac
grep -q 'session_token' "$JAR" || faal "geen sessiecookie na bevestigen"
goed "bevestigen (${CODE}) logt meteen in"

# Uitloggen en opnieuw inloggen met het wachtwoord.
rm -f "$JAR"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR" -X POST -H 'content-type: application/json' -H "origin: ${BASIS}" \
  --data "{\"email\":\"${EMAIL}\",\"password\":\"${WACHTWOORD}\"}" "${BASIS}/api/auth/sign-in/email")"
[ "$CODE" = 200 ] || faal "inloggen gaf ${CODE}"
grep -q 'session_token' "$JAR" || faal "geen sessiecookie na inloggen"
goed "inloggen met e-mail en wachtwoord geeft 200 en een sessiecookie"

[ "$(curl -s -b "$JAR" "${BASIS}/api/mij" | jget gebruiker.email)" = "$EMAIL" ] || faal "/api/mij toont de gebruiker niet"
goed "/api/mij met de cookie toont de aangemelde gebruiker"

# SSR: zonder cookie stuurt de server door naar /inloggen, met de cookie rendert hij de aangemelde pagina.
ZONDER="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "${BASIS}/")"
case "$ZONDER" in "30"*"/inloggen"*) ;; *) faal "GET / zonder cookie gaf '${ZONDER}', verwacht een doorverwijzing naar /inloggen" ;; esac
CODE="$(curl -s -o "${TMP}/home.html" -w '%{http_code}' -b "$JAR" "${BASIS}/")"
[ "$CODE" = 200 ] || faal "GET / met cookie gaf ${CODE}"
grep -q 'data-testid="gebruiker-menu"' "${TMP}/home.html" || faal "GET / met cookie toont de aangemelde pagina niet (geen gebruikersmenu)"
grep -q "$NAAM" "${TMP}/home.html" || faal "GET / met cookie toont de naam van de gebruiker niet (SSR-auth)"
goed "GET / zonder cookie verwijst naar /inloggen; met cookie toont hij de aangemelde pagina (SSR-auth)"

# ---------------------------------------------------------------- 4. project en export
stap "4. Project en export via Gotenberg"
PROJ="$(curl -s -b "$JAR" -X POST -H 'content-type: application/json' -H "origin: ${BASIS}" \
  --data '{"naam":"Rooktest project","klantnaam":"","stroomtype":"2x230V"}' "${BASIS}/api/projecten")"
PROJECT_ID="$(printf '%s' "$PROJ" | jget id)"
PROJECT_VERSIE="$(printf '%s' "$PROJ" | jget versie)"
[ -n "$PROJECT_ID" ] || faal "project aanmaken mislukt: ${PROJ}"
goed "project aangemaakt (${PROJECT_ID})"

EXPORT="$(curl -s -b "$JAR" -X POST -H 'content-type: application/json' -H "origin: ${BASIS}" -H "if-match: ${PROJECT_VERSIE}" \
  --data '{"onderdelen":{"eendraadschema":true,"situatieschema":false,"kringenlijst":true,"bijlage":false},"papier":"A4","versieLabel":"V1"}' \
  "${BASIS}/api/projecten/${PROJECT_ID}/exports")"
BESTAND_ID="$(printf '%s' "$EXPORT" | jget bestandId)"
[ -n "$BESTAND_ID" ] || faal "export maken mislukt: ${EXPORT}"
curl -s -b "$JAR" -o "${TMP}/export.pdf" "${BASIS}/api/bestanden/${BESTAND_ID}"
[ "$(head -c 5 "${TMP}/export.pdf")" = "%PDF-" ] || faal "de export is geen PDF"
goed "export geeft een PDF ($(wc -c <"${TMP}/export.pdf" | tr -d ' ') bytes)"
[ -n "$(find "${DATA}/bestanden" -type f | head -1)" ] || faal "de export staat niet in de bestandenmap (schrijfrechten?)"
goed "het bestand staat in de bestandenmap voor de niet-root-gebruiker"

# ---------------------------------------------------------------- 5. back-up
stap "5. Back-up"
compose run -T --rm --no-deps backup --nu >/dev/null || faal "backup.sh --nu mislukte"
DUMP="$(find "${DATA}/backups" -name 'elentrik-*.dump' | head -1)"
[ -n "$DUMP" ] || faal "geen .dump in de backupmap"
[ -z "$(find "${DATA}/backups" -name '*.tmp' | head -1)" ] || faal "er blijft een .tmp-bestand achter"
basename "$DUMP" | grep -qE '^elentrik-[0-9]{8}-[0-9]{4}\.dump$' || faal "onverwachte bestandsnaam: $(basename "$DUMP")"
LIJST="$(compose run -T --rm --no-deps --entrypoint sh backup -c 'pg_restore --list /backups/elentrik-*.dump')"
printf '%s' "$LIJST" | grep -q 'TABLE DATA public projecten' || faal "pg_restore --list toont de tabel projecten niet"
goed "$(basename "$DUMP") is leesbaar met pg_restore --list"

# ---------------------------------------------------------------- 6. kapotte migratie
stap "6. Een kapotte migratie laat de app niet starten"
KAPOT_CONTEXT="${TMP}/kapot"
mkdir -p "$KAPOT_CONTEXT"
cat >"${KAPOT_CONTEXT}/Dockerfile" <<EOF
FROM ${IMAGE}
USER root
RUN node -e "const f=require('node:fs');const p='/app/migraties/meta/_journal.json';const j=JSON.parse(f.readFileSync(p,'utf8'));j.entries.push({idx:j.entries.length,version:'7',when:Date.now()+86400000,tag:'9999_kapot',breakpoints:true});f.writeFileSync(p,JSON.stringify(j))" \
 && echo 'DIT IS GEEN GELDIGE SQL;' > /app/migraties/9999_kapot.sql
USER ${GEBRUIKER}
EOF
docker build -t "$IMAGE_KAPOT" "$KAPOT_CONTEXT" >"${TMP}/build-kapot.log" 2>&1 || faal "het kapotte image bouwen mislukte"

WEB_ENV=(
  -e "DATABASE_URL=postgres://elentrik:rooktest-db-wachtwoord@postgres:5432/elentrik"
  -e "BETTER_AUTH_SECRET=rooktest-geheim-alleen-voor-de-rooktest-0123456789"
  -e "BETTER_AUTH_URL=${BASIS}"
  -e "ELENTRIK_BESTANDEN_DIR=/tmp/bestanden"
  -e "ELENTRIK_GOTENBERG_URL=http://gotenberg:3000"
  -e "ELENTRIK_GEPLANDE_TAKEN=uit"
)
docker run -d --name "${PROJECT}-kapot" --network "$PROJECT" "${WEB_ENV[@]}" "$IMAGE_KAPOT" >/dev/null
EXIT_KAPOT="$(wacht_op_stop "${PROJECT}-kapot" 120)"
[ "$EXIT_KAPOT" != timeout ] || faal "de container met de kapotte migratie stopte niet"
[ "$EXIT_KAPOT" != 0 ] || faal "de container met de kapotte migratie stopte met exitcode 0"
goed "de container met de kapotte migratie stopt met exitcode ${EXIT_KAPOT}"
GEZONDHEID="$(docker inspect "${PROJECT}-kapot" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}geen{{end}}')"
[ "$GEZONDHEID" != healthy ] || faal "de container met de kapotte migratie werd gezond"
docker logs "${PROJECT}-kapot" 2>&1 | grep -qi 'migr' || faal "de log van de kapotte migratie vermeldt de migratie niet"
goed "hij werd nooit gezond (status: ${GEZONDHEID}) en de log meldt de mislukte migratie"
docker logs --tail 3 "${PROJECT}-kapot" 2>&1 | sed 's/^/        | /'
TELLING="$(psql_db 'select count(*) from drizzle.__drizzle_migrations' | tr -d '[:space:]')"
[ "$TELLING" = "$VERWACHT" ] || faal "na de kapotte migratie telt __drizzle_migrations ${TELLING}, verwacht ${VERWACHT}"
goed "de database bleef ongewijzigd (${TELLING} migraties)"
[ "$(curl -s -o /dev/null -w '%{http_code}' "${BASIS}/api/gezondheid")" = 200 ] || faal "de gewone web-container werd ongezond"
docker rm -f "${PROJECT}-kapot" >/dev/null

# ---------------------------------------------------------------- 7. ontbrekende variabele
stap "7. Een ontbrekende variabele laat de app niet starten (NODE_ENV=production)"
GEHEIM_TESTWAARDE="geheime-testwaarde-die-nooit-in-de-log-mag-staan-98765"
# De variabele ELENTRIK_GOTENBERG_URL ontbreekt; de rest is geldig, zodat de migraties slagen en de
# opstartcontrole van de configuratie zelf aan bod komt. Het geheim moet nergens in de log verschijnen.
docker run -d --name "${PROJECT}-zonder" --network "$PROJECT" \
  -e "DATABASE_URL=postgres://elentrik:rooktest-db-wachtwoord@postgres:5432/elentrik" \
  -e "BETTER_AUTH_SECRET=${GEHEIM_TESTWAARDE}" \
  -e "BETTER_AUTH_URL=${BASIS}" \
  -e "ELENTRIK_BESTANDEN_DIR=/tmp/bestanden" \
  "$IMAGE" >/dev/null
EXIT_ZONDER="$(wacht_op_stop "${PROJECT}-zonder" 120)"
[ "$EXIT_ZONDER" != timeout ] || faal "de container zonder ELENTRIK_GOTENBERG_URL stopte niet"
[ "$EXIT_ZONDER" != 0 ] || faal "de container zonder ELENTRIK_GOTENBERG_URL stopte met exitcode 0"
goed "de container zonder ELENTRIK_GOTENBERG_URL stopt met exitcode ${EXIT_ZONDER}"
LOG_ZONDER="$(docker logs "${PROJECT}-zonder" 2>&1)"
printf '%s' "$LOG_ZONDER" | grep -q 'ELENTRIK_GOTENBERG_URL' || faal "de log noemt ELENTRIK_GOTENBERG_URL niet"
if printf '%s' "$LOG_ZONDER" | grep -q "$GEHEIM_TESTWAARDE"; then faal "de log bevat een geheime waarde"; fi
[ "$(docker inspect "${PROJECT}-zonder" --format '{{.State.Health.Status}}')" != healthy ] || faal "de container zonder variabele werd gezond"
goed "de log noemt ELENTRIK_GOTENBERG_URL en bevat geen waarde van een geheim; nooit gezond"
printf '%s\n' "$LOG_ZONDER" | grep -m3 'ELENTRIK_GOTENBERG_URL' | cut -c1-160 | sed 's/^/        | /'
docker rm -f "${PROJECT}-zonder" >/dev/null

stap "Klaar"
