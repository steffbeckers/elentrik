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
#   4. controleert staging naast productie (stap 9 tot en met 15): beide web-diensten tegen een
#      Postgres en een Gotenberg, gescheiden databases en rollen, de eigen Mailpit van de stack,
#      het watermerk in de PDF, noindex en de balk, de grendels en bijwerken.sh;
#   5. ruimt alles op: containers, netwerk, volume, test-images en de tijdelijke map.
#
# Raakt nooit de lokale infra (postgres 5432, gotenberg 3001): alleen Mailpit wordt gelezen (8025) en
# gebruikt als SMTP-host (1025). Staging gebruikt de eigen Mailpit van de stack (tijdelijk op
# 127.0.0.1:38025). Zet ROOKTEST_BEHOUD=1 om na afloop niets op te ruimen.
set -Eeuo pipefail

# Git Bash op Windows zet argumenten als /backups om in C:/Program Files/Git/backups; voor docker
# moet dat uit. Alleen voor docker, want curl heeft de omzetting nodig voor /dev/null.
docker() { MSYS_NO_PATHCONV=1 command docker "$@"; }

POORT=3399
POORT_STAGING=3398
POORT_MAILPIT_STAGING=38025
MAILPIT=http://127.0.0.1:8025
MAILPIT_STAGING="http://127.0.0.1:${POORT_MAILPIT_STAGING}"
BASIS="http://127.0.0.1:${POORT}"
BASIS_STAGING="http://127.0.0.1:${POORT_STAGING}"
PG_IMAGE=postgres:16.14-alpine

# Padden die native programma's (docker, curl) begrijpen: C:/... in plaats van /c/... op Windows.
pad() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

ROOT="$(pad "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)")"
ID="$(date +%s)$RANDOM"
PROJECT="elentrik-rooktest-${ID}"
IMAGE="elentrik-web:rooktest-${ID}"
IMAGE_KAPOT="elentrik-web:rooktest-kapot-${ID}"
IMAGE_STAGING="elentrik-web:rooktest-staging-${ID}"
TMP="$(pad "$(mktemp -d)")"
DATA="${TMP}/data"
mkdir -p "${DATA}/postgres" "${DATA}/bestanden" "${DATA}/backups" "${DATA}/staging/bestanden"

# Het databasewachtwoord van de rooktest (bevat bewust / # ? @), uit .env.rooktest.
DB_WACHTWOORD="$(grep '^POSTGRES_WACHTWOORD=' "${ROOT}/deploy/nas/.env.rooktest" | cut -d= -f2- | tr -d "'")"
[ -n "$DB_WACHTWOORD" ] || { echo "POSTGRES_WACHTWOORD ontbreekt in .env.rooktest" >&2; exit 1; }
# Het wachtwoord van de beheerder (superuser) van Postgres; geen enkele app of back-up mag hem gebruiken.
BEHEER_WACHTWOORD="$(grep '^POSTGRES_BEHEER_WACHTWOORD=' "${ROOT}/deploy/nas/.env.rooktest" | cut -d= -f2- | tr -d "'")"
[ -n "$BEHEER_WACHTWOORD" ] || { echo "POSTGRES_BEHEER_WACHTWOORD ontbreekt in .env.rooktest" >&2; exit 1; }
# Het wachtwoord van de staging-database (met een enkele aanhalingsteken erin: in .env.rooktest tussen dubbele).
STAGING_WACHTWOORD="$(grep '^STAGING_POSTGRES_WACHTWOORD=' "${ROOT}/deploy/nas/.env.rooktest" | cut -d= -f2- | sed 's/^"//; s/"$//')"
[ -n "$STAGING_WACHTWOORD" ] || { echo "STAGING_POSTGRES_WACHTWOORD ontbreekt in .env.rooktest" >&2; exit 1; }

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

# Faalt als (een stuk van) het databasewachtwoord in de tekst $1 staat; $2 zegt waar.
geen_lek() {
  local stuk
  for stuk in "$DB_WACHTWOORD" "rook/test" "test#pw" "pw?x" "x@y" "$STAGING_WACHTWOORD" "stg/rook" "ook#pw" "$BEHEER_WACHTWOORD" "beheer/rook"; do
    if printf '%s' "$1" | grep -qF -- "$stuk"; then faal "het wachtwoord (stuk '${stuk}') staat in $2"; fi
  done
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
    compose logs --no-color --tail 60 web web-staging >&2
  fi
  if [ "${ROOKTEST_BEHOUD:-}" = 1 ]; then
    printf '\nROOKTEST_BEHOUD=1: project %s, map %s en image %s blijven staan.\n' "$PROJECT" "$TMP" "$IMAGE" >&2
    exit "$code"
  fi
  printf '\n== Opruimen\n'
  docker rm -f "${PROJECT}-kapot" "${PROJECT}-zonder" "${PROJECT}-graph" "${PROJECT}-sk-live" "${PROJECT}-mailpit-prod" >/dev/null 2>&1
  [ "$COMPOSE_GESTART" = 1 ] && compose down -v --remove-orphans --timeout 5 >/dev/null 2>&1
  # Bestanden die de containers aanmaakten, kunnen van een andere gebruiker zijn.
  docker run --rm -v "${TMP}:/d" --entrypoint sh "$PG_IMAGE" -c 'rm -rf /d/data' >/dev/null 2>&1
  docker rmi -f "$IMAGE_STAGING" "$IMAGE" "$IMAGE_KAPOT" >/dev/null 2>&1
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
if curl -s --max-time 2 -o /dev/null "${BASIS_STAGING}/"; then faal "poort ${POORT_STAGING} is al in gebruik"; fi
if curl -s --max-time 2 -o /dev/null "${MAILPIT_STAGING}/"; then faal "poort ${POORT_MAILPIT_STAGING} is al in gebruik"; fi
goed "Docker, Mailpit en de poorten ${POORT}, ${POORT_STAGING} en ${POORT_MAILPIT_STAGING} zijn in orde"

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
    if (c.name !== "elentrik") fouten.push("compose.yaml heeft niet de vaste projectnaam elentrik");
    for (const [naam, d] of Object.entries(c.services)) {
      if (d.ports && d.ports.length) fouten.push(naam + " publiceert een poort");
    }
    for (const naam of ["web", "web-staging", "postgres", "gotenberg", "mailpit", "backup"]) {
      if (!c.services[naam]) fouten.push("dienst " + naam + " ontbreekt");
    }
    const n = c.networks && c.networks.elentrik;
    if (!n || n.name !== "elentrik" || n.ipam.config[0].subnet !== "172.30.70.0/24") fouten.push("netwerk elentrik of subnet klopt niet");
    if (c.services.web.environment.ELENTRIK_VERTROUWD_PROXYNET !== "172.30.70.0/24") fouten.push("ELENTRIK_VERTROUWD_PROXYNET klopt niet");
    const w = c.services.web, st = c.services["web-staging"], m = c.services.mailpit;
    if (!st || !m) {
      console.error("web-staging of mailpit ontbreekt");
      process.exit(1);
    }
    if (w.environment.ELENTRIK_OMGEVING !== "productie") fouten.push("web: ELENTRIK_OMGEVING is niet productie");
    if (st.environment.ELENTRIK_OMGEVING !== "staging") fouten.push("web-staging: ELENTRIK_OMGEVING is niet staging");
    if (st.container_name !== "elentrik-web-staging") fouten.push("web-staging: containernaam klopt niet");
    if (st.image !== "ghcr.io/steffbeckers/elentrik-web:staging") fouten.push("web-staging: image klopt niet");
    if (m.container_name !== "elentrik-mailpit" || m.image !== "axllent/mailpit:v1.31.4") fouten.push("mailpit: naam of image klopt niet");
    if (m.environment.MP_MAX_MESSAGES !== "500") fouten.push("mailpit: MP_MAX_MESSAGES is niet 500");
    const se = st.environment;
    if (se.DATABASE_URL !== "postgres://elentrik_staging@postgres:5432/elentrik_staging") fouten.push("web-staging: DATABASE_URL klopt niet");
    if (se.BETTER_AUTH_URL !== "https://staging.elentrik.app" || se.MAIL_VERZENDER !== "smtp" || se.SMTP_HOST !== "mailpit" || String(se.SMTP_PORT) !== "1025") fouten.push("web-staging: BETTER_AUTH_URL of de mailinstellingen kloppen niet");
    if (se.PGPASSWORD === w.environment.PGPASSWORD) fouten.push("web-staging deelt het databasewachtwoord met web");
    if (se.BETTER_AUTH_SECRET === w.environment.BETTER_AUTH_SECRET) fouten.push("web-staging deelt BETTER_AUTH_SECRET met web");
    const bestanden = (d) => (d.volumes || []).find((v) => v.target === "/data/bestanden");
    if (!bestanden(st) || !String(bestanden(st).source).endsWith("/staging/bestanden")) fouten.push("web-staging: de bestanden staan niet in <data>/staging/bestanden");
    if (bestanden(st) && bestanden(w) && bestanden(st).source === bestanden(w).source) fouten.push("web en web-staging delen de bestandenmap");
    // De superuser `elentrik_beheer` is alleen voor beheer: geen enkele andere dienst gebruikt hem of zijn wachtwoord.
    if (c.services.postgres.environment.POSTGRES_USER !== "elentrik_beheer") fouten.push("postgres: POSTGRES_USER is niet elentrik_beheer");
    for (const [naam, d] of Object.entries(c.services)) {
      if (naam !== "postgres" && JSON.stringify(d.environment || {}).includes("beheer")) fouten.push(naam + " gebruikt de beheerder van Postgres");
    }
    if (w.environment.DATABASE_URL !== "postgres://elentrik@postgres:5432/elentrik" || c.services.backup.environment.PGUSER !== "elentrik") fouten.push("web of backup gebruikt niet de gewone gebruiker elentrik");
    for (const dienst of ["postgres", "gotenberg", "mailpit"]) {
      if (!st.depends_on || !st.depends_on[dienst]) fouten.push("web-staging hangt niet af van " + dienst);
    }
    if (fouten.length) {
      console.error(fouten.join("\n"));
      process.exit(1);
    }
  });' || faal "compose.yaml voldoet niet aan de eisen"
for NAAM in $(grep -oE '\$\{[A-Z_]+' "${ROOT}/deploy/nas/compose.yaml" | tr -d '${' | sort -u); do
  grep -qE "^#? ?${NAAM}=" "${ROOT}/deploy/nas/.env.voorbeeld" || faal "${NAAM} staat niet in .env.voorbeeld"
done
goed "compose.yaml is geldig, publiceert geen poorten, heeft netwerk elentrik (172.30.70.0/24), web en web-staging zijn gescheiden en alle variabelen staan in .env.voorbeeld"

# ---------------------------------------------------------------- bouwen
stap "Image bouwen"
docker build -f "${ROOT}/apps/web/Dockerfile" -t "$IMAGE" "$ROOT" >"${TMP}/build.log" 2>&1 \
  || { tail -60 "${TMP}/build.log" >&2; faal "docker build mislukt"; }
GROOTTE="$(docker image inspect "$IMAGE" --format '{{.Size}}')"
goed "image gebouwd: $((GROOTTE / 1024 / 1024)) MB"
docker tag "$IMAGE" "$IMAGE_STAGING"
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
  # Staging: hetzelfde image onder een eigen tag (bijwerken.sh vervangt die later), op een eigen poort.
  web-staging:
    container_name: ${ROOK_NAAM}-web-staging
    image: ${IMAGE_STAGING}
    ports:
      - "127.0.0.1:${POORT_STAGING}:3000"
    environment:
      BETTER_AUTH_URL: ${BASIS_STAGING}
  # De Mailpit van de stack, alleen hier gepubliceerd zodat het script de mail kan lezen.
  mailpit:
    container_name: ${ROOK_NAAM}-mailpit
    ports:
      - "127.0.0.1:${POORT_MAILPIT_STAGING}:8025"
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

# De vaste projectnaam elentrik in compose.yaml mag de eigen projectnaam van de rooktest niet overschrijven
# (-p wint): anders zou de rooktest het lokale infra-project elentrik raken.
[ "$(docker inspect "${PROJECT}-web" --format '{{index .Config.Labels "com.docker.compose.project"}}')" = "$PROJECT" ] || faal "de rooktest draait niet onder zijn eigen projectnaam"
[ -z "$(docker ps -aq --filter label=com.docker.compose.project=elentrik --filter label=com.docker.compose.service=web)" ] || faal "er draait een compose-project met de naam elentrik"
goed "de stack draait onder het project ${PROJECT}, niet onder de vaste naam elentrik uit compose.yaml"

# Docker's eigen HEALTHCHECK (node + /api/gezondheid in het image) moet ook slagen.
GEZONDHEID_WEB=""
for _ in $(seq 1 30); do
  GEZONDHEID_WEB="$(docker inspect "${PROJECT}-web" --format '{{.State.Health.Status}}')"
  [ "$GEZONDHEID_WEB" = healthy ] && break
  sleep 2
done
[ "$GEZONDHEID_WEB" = healthy ] || faal "de HEALTHCHECK van web werd niet healthy (status: ${GEZONDHEID_WEB})"
goed "de HEALTHCHECK van het image meldt healthy"

# Staging draait er in dezelfde stack naast, tegen dezelfde Postgres en Gotenberg.
GEZONDHEID_STAGING=""
for _ in $(seq 1 30); do
  GEZONDHEID_STAGING="$(docker inspect "${PROJECT}-web-staging" --format '{{.State.Health.Status}}')"
  [ "$GEZONDHEID_STAGING" = healthy ] && break
  sleep 2
done
[ "$GEZONDHEID_STAGING" = healthy ] || faal "de HEALTHCHECK van web-staging werd niet healthy (status: ${GEZONDHEID_STAGING})"
goed "de HEALTHCHECK van web-staging meldt healthy"

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

# De nachtelijke lus rond de zomertijd: elke kalenderdag precies een dump. backup.sh --test-tijd leest
# polltijdstippen (elke minuut) en meldt wanneer de lus zou dumpen; het draait met busybox en de echte
# tijdzonedata van Europe/Brussels in het postgres:alpine-image.
stap "5b. Back-up rond de zomertijd (drie nachten, een poll per minuut)"
dumps_in() { # $1 = begin (UTC), $2 = einde (UTC)
  node -e 'for (let t = Date.parse(process.argv[1]) / 1000; t <= Date.parse(process.argv[2]) / 1000; t += 60) console.log(t)' "$1" "$2" \
    | docker run --rm -i -e TZ=Europe/Brussels -v "${ROOT}/deploy/nas/backup.sh:/backup.sh:ro" --entrypoint sh "$PG_IMAGE" /backup.sh --test-tijd \
    | tr '\n' ' ' | sed 's/ *$//'
}
# Lente: 2027-03-28, 02:00 wordt 03:00. Herfst: 2027-10-31, 03:00 wordt 02:00. Gewone nacht: juni.
LENTE="$(dumps_in 2027-03-27T18:00:00Z 2027-03-29T18:00:00Z)"
[ "$LENTE" = "dump 20270328 03 dump 20270329 03" ] || faal "lente: verwacht een dump per dag (28 en 29 maart), kreeg: '${LENTE}'"
goed "nacht van 27 op 28 maart (klok vooruit): precies een dump per dag"
HERFST="$(dumps_in 2027-10-30T18:00:00Z 2027-11-01T18:00:00Z)"
[ "$HERFST" = "dump 20271031 03 dump 20271101 03" ] || faal "herfst: verwacht een dump per dag (31 oktober en 1 november), kreeg: '${HERFST}'"
goed "nacht van 30 op 31 oktober (klok achteruit): precies een dump per dag"
GEWOON="$(dumps_in 2027-06-14T18:00:00Z 2027-06-17T18:00:00Z)"
[ "$GEWOON" = "dump 20270615 03 dump 20270616 03 dump 20270617 03" ] || faal "gewone nachten: kreeg: '${GEWOON}'"
goed "gewone nachten: precies een dump per dag, om 03:xx lokale tijd"

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
  -e "DATABASE_URL=postgres://elentrik@postgres:5432/elentrik"
  -e "PGPASSWORD=${DB_WACHTWOORD}"
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
geen_lek "$(docker logs "${PROJECT}-kapot" 2>&1)" "de log van de kapotte migratie"
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
  -e "DATABASE_URL=postgres://elentrik@postgres:5432/elentrik" \
  -e "PGPASSWORD=${DB_WACHTWOORD}" \
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
geen_lek "$LOG_ZONDER" "de log zonder ELENTRIK_GOTENBERG_URL"
if printf '%s' "$LOG_ZONDER" | grep -q "$GEHEIM_TESTWAARDE"; then faal "de log bevat een geheime waarde"; fi
[ "$(docker inspect "${PROJECT}-zonder" --format '{{.State.Health.Status}}')" != healthy ] || faal "de container zonder variabele werd gezond"
goed "de log noemt ELENTRIK_GOTENBERG_URL en bevat geen waarde van een geheim; nooit gezond"
printf '%s\n' "$LOG_ZONDER" | grep -m3 'ELENTRIK_GOTENBERG_URL' | cut -c1-160 | sed 's/^/        | /'
docker rm -f "${PROJECT}-zonder" >/dev/null

# ---------------------------------------------------------------- 8. het databasewachtwoord in de logs
stap "8. Het databasewachtwoord (met / # ? @) staat nergens in een log"
# Een wachtwoord in de URL is toch ongeldig (/ # ? @): het migratiescript meldt dan alleen een code.
SLECHTE_URL_UITVOER="$(docker run --rm --network "$PROJECT" -e "DATABASE_URL=postgres://elentrik:${DB_WACHTWOORD}@postgres:5432/elentrik" \
  --entrypoint node "$IMAGE" /app/migreer.mjs 2>&1 || true)"
printf '%s\n' "$SLECHTE_URL_UITVOER" | head -3 | sed 's/^/        | /'
printf '%s' "$SLECHTE_URL_UITVOER" | grep -q 'Migreren mislukt' || faal "migreer.mjs meldt een ongeldige URL niet"
geen_lek "$SLECHTE_URL_UITVOER" "de uitvoer van migreer.mjs met een ongeldige URL"
goed "migreer.mjs met het wachtwoord in een ongeldige URL meldt alleen een code, geen wachtwoord"
for DIENST in web postgres gotenberg; do
  geen_lek "$(compose logs --no-color "$DIENST" 2>&1)" "de log van $DIENST"
done
geen_lek "$(compose logs --no-color backup 2>&1)" "de log van backup"
goed "de logs van web, postgres, gotenberg en backup bevatten het wachtwoord niet (de stack draaide er de hele rooktest mee)"

# ================================================================ staging naast productie
# De tekst van een PDF, via pdf.js uit apps/web (dezelfde bibliotheek als de app).
pdf_tekst() {
  (cd "${ROOT}/apps/web" && node --input-type=module -e '
    import { readFileSync } from "node:fs";
    import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
    const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[1])), useSystemFonts: true }).promise;
    let tekst = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const inhoud = await (await doc.getPage(p)).getTextContent();
      tekst += inhoud.items.map((i) => i.str).join(" ") + "\n";
    }
    process.stdout.write(tekst);
  ' "$1")
}

# De statuscode en X-Robots-Tag van een adres: "<status> <waarde of ->".
kop_van() { # $1 = adres, $2 = optioneel cookiebestand
  local kop status robots
  kop="$(curl -s -D - -o /dev/null ${2:+-b "$2"} "$1" | tr -d '\r')"
  status="$(printf '%s\n' "$kop" | head -1 | cut -d' ' -f2)"
  robots="$(printf '%s\n' "$kop" | grep -i '^x-robots-tag:' | head -1 | cut -d: -f2- | sed 's/^ *//' || true)"
  printf '%s %s' "$status" "${robots:--}"
}

# ---------------------------------------------------------------- 9. twee web-diensten, een Postgres, een Gotenberg
stap "9. Productie en staging naast elkaar op een Postgres en een Gotenberg"
[ "$(docker inspect "${PROJECT}-web" --format '{{.State.Health.Status}}')" = healthy ] || faal "web is niet healthy"
[ "$(docker inspect "${PROJECT}-web-staging" --format '{{.State.Health.Status}}')" = healthy ] || faal "web-staging is niet healthy"
[ "$(compose ps -q postgres | wc -l | tr -d ' ')" = 1 ] || faal "er draait niet precies een Postgres"
[ "$(compose ps -q gotenberg | wc -l | tr -d ' ')" = 1 ] || faal "er draait niet precies een Gotenberg"
[ "$(curl -s "${BASIS_STAGING}/api/gezondheid" | jget ok)" = true ] || faal "/api/gezondheid van staging geeft niet { ok: true }"
goed "web en web-staging zijn beide healthy tegen een Postgres en een Gotenberg"
MAILPIT_GEZOND=""
for _ in $(seq 1 15); do
  MAILPIT_GEZOND="$(docker inspect "${PROJECT}-mailpit" --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}geen{{end}}')"
  [ "$MAILPIT_GEZOND" = healthy ] && break
  sleep 2
done
[ "$MAILPIT_GEZOND" = healthy ] || faal "de healthcheck van mailpit werd niet healthy (status: ${MAILPIT_GEZOND})"
goed "de healthcheck van mailpit meldt healthy"
psql_staging() { compose exec -T -e "PGPASSWORD=${STAGING_WACHTWOORD}" postgres psql -h postgres -U elentrik_staging -d elentrik_staging -tA -c "$1"; }
TELLING_STAGING="$(psql_staging 'select count(*) from drizzle.__drizzle_migrations' | tr -d '[:space:]')"
[ "$TELLING_STAGING" = "$VERWACHT" ] || faal "de staging-database telt ${TELLING_STAGING} migraties, verwacht ${VERWACHT}"
goed "web-staging heeft de migraties op zijn eigen database elentrik_staging gezet (${TELLING_STAGING})"
[ "$(psql_db "select count(*) from \"user\" where email like '%@staging-rooktest.%'" | tr -d '[:space:]')" = 0 ] || faal "staging-gegevens in de productiedatabase"

# ---------------------------------------------------------------- 10. gescheiden databases en rollen
stap "10. Productie en staging kunnen niet in elkaars database (beide gewone gebruikers, geen superuser)"
UITVOER="$(compose exec -T -e "PGPASSWORD=${STAGING_WACHTWOORD}" postgres psql -h postgres -U elentrik_staging -d elentrik -tA -c 'select 1' 2>&1 || true)"
printf '%s\n' "$UITVOER" | head -2 | sed 's/^/        | /'
printf '%s' "$UITVOER" | grep -q 'permission denied for database' || faal "elentrik_staging mag de database elentrik openen, of de fout klopt niet"
geen_lek "$UITVOER" "de foutmelding van de geweigerde verbinding"
goed "elentrik_staging krijgt 'permission denied for database' op elentrik"
[ "$(psql_staging 'select current_database()' | tr -d '[:space:]')" = elentrik_staging ] || faal "elentrik_staging kan zijn eigen database niet openen"
[ "$(psql_staging "select rolsuper::text || rolcreatedb::text || rolcreaterole::text from pg_roles where rolname = 'elentrik_staging'" | tr -d '[:space:]')" = falsefalsefalse ] || faal "elentrik_staging is superuser of mag databases/rollen maken"
goed "elentrik_staging opent wel zijn eigen database en is geen superuser"
# Via het netwerk (-h postgres) geldt scram; op 127.0.0.1 staat de Postgres-image op trust. Een verkeerd wachtwoord wordt dus geweigerd.
if compose exec -T -e "PGPASSWORD=fout-wachtwoord" postgres psql -h postgres -U elentrik_staging -d elentrik_staging -tA -c 'select 1' >/dev/null 2>&1; then
  faal "elentrik_staging kan met een verkeerd wachtwoord aanmelden"
fi
PUBLIEK="$(psql_db "select count(*) from pg_database d, aclexplode(coalesce(d.datacl, acldefault('d', d.datdba))) a where d.datname in ('elentrik','elentrik_staging','postgres','template1') and a.grantee = 0 and a.privilege_type = 'CONNECT'" | tr -d '[:space:]')"
[ "$PUBLIEK" = 0 ] || faal "PUBLIC heeft nog CONNECT op een van de databases"
goed "verkeerd wachtwoord wordt geweigerd en PUBLIC heeft geen CONNECT op elentrik, elentrik_staging, postgres of template1"
# Omgekeerd: ook de app van productie is een gewone gebruiker en komt niet in staging. De superuser is de
# aparte beheerder elentrik_beheer, die geen enkele app gebruikt.
for DB in elentrik_staging postgres template1; do
  UITVOER="$(compose exec -T -e "PGPASSWORD=${DB_WACHTWOORD}" postgres psql -h postgres -U elentrik -d "$DB" -tA -c 'select 1' 2>&1 || true)"
  printf '%s' "$UITVOER" | grep -q 'permission denied for database' || faal "elentrik mag de database ${DB} openen, of de fout klopt niet: ${UITVOER}"
  geen_lek "$UITVOER" "de foutmelding van de geweigerde verbinding"
done
printf '%s
' "$UITVOER" | head -1 | sed 's/^/        | /'
goed "elentrik (productie) krijgt 'permission denied for database' op elentrik_staging, postgres en template1"
[ "$(compose exec -T -e "PGPASSWORD=${DB_WACHTWOORD}" postgres psql -h postgres -U elentrik -d elentrik -tA -c 'select current_database()' | tr -d '[:space:]')" = elentrik ] || faal "elentrik kan zijn eigen database niet openen"
[ "$(psql_db "select rolsuper::text || rolcreatedb::text || rolcreaterole::text || rolbypassrls::text from pg_roles where rolname = 'elentrik'" | tr -d '[:space:]')" = falsefalsefalsefalse ] || faal "elentrik is superuser of mag databases/rollen maken"
[ "$(psql_db "select string_agg(datname || '=' || pg_get_userbyid(datdba), ',' order by datname) from pg_database where datname like 'elentrik%'" | tr -d '[:space:]')" = "elentrik=elentrik,elentrik_staging=elentrik_staging" ] || faal "de eigenaars van de databases kloppen niet"
if compose exec -T postgres psql -U elentrik -d elentrik -tA -c 'create role rooktest_mag_niet' >/dev/null 2>&1; then faal "elentrik mag een rol aanmaken"; fi
[ "$(compose exec -T postgres psql -U elentrik_beheer -d postgres -tA -c "select rolsuper::text from pg_roles where rolname = 'elentrik_beheer'" | tr -d '[:space:]')" = true ] || faal "de beheerder elentrik_beheer is geen superuser"
goed "elentrik is een gewone gebruiker (geen superuser, createdb, createrole, bypassrls) en eigenaar van zijn database; elentrik_beheer is de superuser"

# ---------------------------------------------------------------- 11. de eigen Mailpit van de stack
stap "11. Een registratie op staging komt in de Mailpit van de stack"
for _ in $(seq 1 30); do
  curl -s --max-time 3 -o /dev/null "${MAILPIT_STAGING}/api/v1/info" && break
  sleep 1
done
EMAIL_S="rooktest-${ID}@staging-rooktest.elentrik.test"
WACHTWOORD_S="Rooktest-staging-wachtwoord-${ID}"
JAR_S="${TMP}/cookies-staging.txt"
CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'content-type: application/json' -H "origin: ${BASIS_STAGING}" \
  --data "{\"name\":\"Staging Gebruiker\",\"email\":\"${EMAIL_S}\",\"password\":\"${WACHTWOORD_S}\",\"wachtendeBedrijfsnaam\":\"Staging Elektro\"}" \
  "${BASIS_STAGING}/api/auth/sign-up/email")"
[ "$CODE" = 200 ] || faal "registreren op staging gaf ${CODE}"
MAIL_ID_S=""
for _ in $(seq 1 40); do
  MAIL_ID_S="$(curl -s -G --data-urlencode "query=to:${EMAIL_S}" "${MAILPIT_STAGING}/api/v1/search" | jget messages.0.ID || true)"
  [ -n "$MAIL_ID_S" ] && break
  sleep 0.5
done
[ -n "$MAIL_ID_S" ] || faal "geen bevestigingsmail in de Mailpit van de stack"
TEKST_S="$(curl -s "${MAILPIT_STAGING}/api/v1/message/${MAIL_ID_S}" | jget Text)"
LINK_S="$(printf '%s' "$TEKST_S" | grep -oE "${BASIS_STAGING}/[^[:space:]<>\"]+" | head -1 || true)"
[ -n "$LINK_S" ] || faal "geen link naar ${BASIS_STAGING} in de mail van staging"
goed "de bevestigingsmail van staging staat in de Mailpit van de stack (SMTP naar mailpit:1025)"
HOST_TREFFERS="$(curl -s -G --data-urlencode "query=to:${EMAIL_S}" "${MAILPIT}/api/v1/search" | jget messages_count)"
[ "${HOST_TREFFERS:-0}" = 0 ] || faal "de mail van staging kwam in de lokale Mailpit van de host terecht"
goed "de mail van staging is niet bij de Mailpit van de host aangekomen"

CODE="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR_S" "$LINK_S")"
case "$CODE" in 2*|3*) ;; *) faal "bevestigen op staging gaf ${CODE}" ;; esac
grep -q 'session_token' "$JAR_S" || faal "geen sessiecookie na bevestigen op staging"
[ "$(psql_staging "select count(*) from \"user\" where email = '${EMAIL_S}'" | tr -d '[:space:]')" = 1 ] || faal "de gebruiker staat niet in elentrik_staging"
[ "$(psql_db "select count(*) from \"user\" where email = '${EMAIL_S}'" | tr -d '[:space:]')" = 0 ] || faal "de gebruiker van staging staat in de productiedatabase"
goed "de staging-gebruiker staat alleen in elentrik_staging, niet in elentrik"

# ---------------------------------------------------------------- 12. het watermerk in de PDF
stap "12. Een export op staging heeft het watermerk, op productie niet"
PROJ_S="$(curl -s -b "$JAR_S" -X POST -H 'content-type: application/json' -H "origin: ${BASIS_STAGING}" \
  --data '{"naam":"Rooktest project","klantnaam":"","stroomtype":"2x230V"}' "${BASIS_STAGING}/api/projecten")"
PROJECT_ID_S="$(printf '%s' "$PROJ_S" | jget id)"
PROJECT_VERSIE_S="$(printf '%s' "$PROJ_S" | jget versie)"
[ -n "$PROJECT_ID_S" ] || faal "project aanmaken op staging mislukt: ${PROJ_S}"
EXPORT_S="$(curl -s -b "$JAR_S" -X POST -H 'content-type: application/json' -H "origin: ${BASIS_STAGING}" -H "if-match: ${PROJECT_VERSIE_S}" \
  --data '{"onderdelen":{"eendraadschema":true,"situatieschema":false,"kringenlijst":true,"bijlage":false},"papier":"A4","versieLabel":"V1"}' \
  "${BASIS_STAGING}/api/projecten/${PROJECT_ID_S}/exports")"
BESTAND_ID_S="$(printf '%s' "$EXPORT_S" | jget bestandId)"
[ -n "$BESTAND_ID_S" ] || faal "export op staging mislukt: ${EXPORT_S}"
curl -s -b "$JAR_S" -o "${TMP}/export-staging.pdf" "${BASIS_STAGING}/api/bestanden/${BESTAND_ID_S}"
[ "$(head -c 5 "${TMP}/export-staging.pdf")" = "%PDF-" ] || faal "de export van staging is geen PDF"
[ -n "$(find "${DATA}/staging/bestanden" -type f | head -1)" ] || faal "de export van staging staat niet in <data>/staging/bestanden"
[ "$(find "${DATA}/bestanden" -type f | wc -l | tr -d ' ')" = 1 ] || faal "productie heeft meer of minder dan een bestand: de bestandenmappen zijn niet gescheiden"
goed "de export van staging staat in <data>/staging/bestanden, niet in de map van productie"
TEKST_PDF_S="$(pdf_tekst "${TMP}/export-staging.pdf")"
TEKST_PDF_P="$(pdf_tekst "${TMP}/export.pdf")"
[ "${#TEKST_PDF_S}" -gt 200 ] || faal "de tekst van de PDF van staging is niet te lezen (pdf.js gaf ${#TEKST_PDF_S} tekens)"
[ "${#TEKST_PDF_P}" -gt 200 ] || faal "de tekst van de PDF van productie is niet te lezen (pdf.js gaf ${#TEKST_PDF_P} tekens)"
printf '%s' "$TEKST_PDF_S" | grep -q 'STAGING' || faal "de PDF van staging bevat het woord STAGING niet"
printf '%s' "$TEKST_PDF_S" | grep -qE 'Geen geldig document|Document non valable|Not a valid document' || faal "de PDF van staging bevat 'Geen geldig document' niet"
if printf '%s' "$TEKST_PDF_P" | grep -q 'STAGING'; then faal "de PDF van productie bevat STAGING"; fi
goed "de PDF-tekst van staging bevat STAGING en 'Geen geldig document'; die van productie niet"

# ---------------------------------------------------------------- 13. noindex en de balk
stap "13. Staging is herkenbaar en niet indexeerbaar; productie ongewijzigd"
curl -s -o "${TMP}/inloggen-staging.html" "${BASIS_STAGING}/inloggen"
grep -q 'data-testid="staging-balk"' "${TMP}/inloggen-staging.html" || faal "de SSR-HTML van /inloggen op staging heeft de balk niet"
grep -q 'Staging: testomgeving, geen echte gegevens' "${TMP}/inloggen-staging.html" || faal "de balktekst staat niet in de SSR-HTML van staging"
grep -q '<title>\[Staging\] ' "${TMP}/inloggen-staging.html" || faal "de titel van staging begint niet met [Staging] "
if grep -q 'data-testid="staging-balk"' "${TMP}/inloggen.html"; then faal "productie toont de staging-balk"; fi
if grep -q '<title>\[Staging\]' "${TMP}/inloggen.html"; then faal "productie heeft een [Staging]-titel"; fi
goed "SSR-HTML van /inloggen: staging heeft de balk en de titel [Staging] ...; productie niet"
ASSET="$(grep -oE '/_nuxt/[A-Za-z0-9_./-]+\.(js|css)' "${TMP}/inloggen-staging.html" | head -1)"
[ -n "$ASSET" ] || faal "geen /_nuxt/-bestand gevonden in de HTML van /inloggen"
# Pad en verwachte status. Zonder sessie verwijst een onbekende pagina of API-route naar /inloggen (302);
# met sessie (cookie "ja") geeft hij echt 404. Een onbekend bestand onder /_nuxt/ geeft altijd 404.
for REGEL in "/inloggen 200 nee" "${ASSET} 200 nee" "/api/gezondheid 200 nee" "/bestaat-niet-${ID} 302 nee"   "/bestaat-niet-${ID} 404 ja" "/api/bestaat-niet-${ID} 404 ja" "/_nuxt/bestaat-niet-${ID}.js 404 nee"; do
  read -r PAD VERWACHT_STATUS MET_COOKIE <<<"$REGEL"
  if [ "$MET_COOKIE" = ja ]; then KOP_S="$(kop_van "${BASIS_STAGING}${PAD}" "$JAR_S")"; KOP_P="$(kop_van "${BASIS}${PAD}" "$JAR")"
  else KOP_S="$(kop_van "${BASIS_STAGING}${PAD}")"; KOP_P="$(kop_van "${BASIS}${PAD}")"; fi
  [ "$KOP_S" = "${VERWACHT_STATUS} noindex, nofollow" ] || faal "staging ${PAD}: '${KOP_S}', verwacht '${VERWACHT_STATUS} noindex, nofollow'"
  [ "$KOP_P" = "${VERWACHT_STATUS} -" ] || faal "productie ${PAD}: '${KOP_P}', verwacht '${VERWACHT_STATUS} -'"
  printf '        | %-34s %s%s  staging: %s   productie: %s
' "$PAD" "$VERWACHT_STATUS" "$([ "$MET_COOKIE" = ja ] && echo ' (met sessie)' || true)" "$KOP_S" "$KOP_P"
done
goed "X-Robots-Tag op staging bij een pagina, een /_nuxt-bestand, een API-route, een doorverwijzing en twee 404's; op productie nergens"
ROBOTS_S="$(curl -s "${BASIS_STAGING}/robots.txt")"
[ "$ROBOTS_S" = "$(printf 'User-agent: *\nDisallow: /')" ] || faal "robots.txt van staging klopt niet: '${ROBOTS_S}'"
[ "$(curl -s -o /dev/null -w '%{http_code}' -b "$JAR" "${BASIS}/robots.txt")" = 404 ] || faal "productie geeft met sessie geen 404 op /robots.txt (zoals vandaag)"
if curl -s "${BASIS}/robots.txt" | grep -q Disallow; then faal "productie geeft Disallow op /robots.txt"; fi
goed "robots.txt van staging is 'User-agent: *' + 'Disallow: /'; productie geeft 404 (met sessie) en nooit Disallow"

# ---------------------------------------------------------------- 14. de grendels in de opstartcontrole
stap "14. Staging start nooit met Graph of een live Stripe-sleutel; productie nooit met de Mailpit van staging"
grendel() { # $1 = naam, $2 = dienst, $3 = variabele die de log moet noemen, $4 = waarde die nooit in de log mag, rest = -e opties
  local naam="$1" dienst="$2" noemt="$3" geheim="$4" code log
  shift 4
  compose run -d --no-deps --name "${PROJECT}-${naam}" "$@" "$dienst" >/dev/null || faal "${naam}: de container starten mislukte"
  code="$(wacht_op_stop "${PROJECT}-${naam}" 120)"
  [ "$code" != timeout ] || faal "${naam}: de container stopte niet"
  [ "$code" != 0 ] || faal "${naam}: de container stopte met exitcode 0"
  [ "$(docker inspect "${PROJECT}-${naam}" --format '{{.State.Health.Status}}')" != healthy ] || faal "${naam}: de container werd healthy"
  log="$(docker logs "${PROJECT}-${naam}" 2>&1)"
  printf '%s' "$log" | grep -q "$noemt" || faal "${naam}: de log noemt ${noemt} niet"
  if [ -n "$geheim" ] && printf '%s' "$log" | grep -qF -- "$geheim"; then faal "${naam}: de log bevat een waarde (${geheim})"; fi
  geen_lek "$log" "de log van ${naam}"
  printf '%s\n' "$log" | grep -m1 "$noemt" | cut -c1-160 | sed 's/^/        | /'
  docker rm -f "${PROJECT}-${naam}" >/dev/null
  goed "${naam}: exitcode ${code}, nooit healthy, de log noemt ${noemt} en geen waarde"
}
grendel graph web-staging MAIL_VERZENDER "rooktest-graph-geheim-0123" \
  -e MAIL_VERZENDER=graph -e GRAPH_TENANT_ID=rooktest-tenant -e GRAPH_CLIENT_ID=rooktest-client \
  -e GRAPH_CLIENT_GEHEIM=rooktest-graph-geheim-0123 -e MAIL_AFZENDER=noreply@rooktest.elentrik.test
grendel sk-live web-staging STRIPE_GEHEIME_SLEUTEL "sk_live_rooktest0123456789" \
  -e STRIPE_GEHEIME_SLEUTEL=sk_live_rooktest0123456789 -e STRIPE_WEBHOOK_GEHEIM=whsec_rooktest0123456789 \
  -e STRIPE_PRIJS_MAAND=price_rooktestmaand -e STRIPE_PRIJS_JAAR=price_rooktestjaar
grendel mailpit-prod web SMTP_HOST "" -e SMTP_HOST=mailpit
[ "$(docker inspect "${PROJECT}-web-staging" --format '{{.State.Health.Status}}')" = healthy ] || faal "web-staging werd ongezond"

# ---------------------------------------------------------------- 15. bijwerken.sh
stap "15. bijwerken.sh herstart alleen de gevraagde dienst"
BIJWERKEN="${ROOT}/deploy/nas/bijwerken.sh"
[ -f "$BIJWERKEN" ] || faal "deploy/nas/bijwerken.sh ontbreekt"
bijwerken() { # $@ = argumenten van bijwerken.sh. Pull wordt onderschept: de images van de rooktest bestaan alleen lokaal.
  (
    export COMPOSE_PROJECT_NAME="$PROJECT" COMPOSE_PATH_SEPARATOR=, COMPOSE_FILE="${ROOT}/deploy/nas/compose.yaml,${TMP}/override.yaml" \
      COMPOSE_ENV_FILES="${ROOT}/deploy/nas/.env.rooktest"
    docker() {
      if [ "${1:-}" = compose ] && [[ " $* " == *" pull "* ]]; then echo "(pull overgeslagen in de rooktest: $*)" >&2; return 0; fi
      MSYS_NO_PATHCONV=1 command docker "$@"
    }
    export -f docker
    bash "$BIJWERKEN" "$@"
  )
}
if bijwerken >"${TMP}/bijwerken-leeg.log" 2>&1; then faal "bijwerken.sh zonder argument gaf exitcode 0"; fi
grep -q 'staging|productie' "${TMP}/bijwerken-leeg.log" || faal "bijwerken.sh zonder argument toont de gebruiksregel niet"
if bijwerken web >"${TMP}/bijwerken-fout.log" 2>&1; then faal "bijwerken.sh met een ongeldig argument gaf exitcode 0"; fi
grep -q 'staging|productie' "${TMP}/bijwerken-fout.log" || faal "bijwerken.sh met een ongeldig argument toont de gebruiksregel niet"
goed "bijwerken.sh zonder of met een ongeldig argument stopt met een foutcode en de gebruiksregel"

ID_WEB_VOOR="$(docker inspect "${PROJECT}-web" --format '{{.Id}}')"
ID_STAGING_VOOR="$(docker inspect "${PROJECT}-web-staging" --format '{{.Id}}')"
# Een "nieuwe versie" van het staging-image: dezelfde lagen, een ander revisielabel.
REVISIE="rooktest-${ID}"
printf 'FROM %s\nLABEL org.opencontainers.image.revision=%s\n' "$IMAGE" "$REVISIE" | docker build -q -t "$IMAGE_STAGING" - >/dev/null \
  || faal "het nieuwe staging-image bouwen mislukte"
bijwerken staging >"${TMP}/bijwerken-staging.log" 2>&1 || { cat "${TMP}/bijwerken-staging.log" >&2; faal "bijwerken.sh staging mislukte"; }
sed 's/^/        | /' "${TMP}/bijwerken-staging.log"
ID_WEB_NA="$(docker inspect "${PROJECT}-web" --format '{{.Id}}')"
ID_STAGING_NA="$(docker inspect "${PROJECT}-web-staging" --format '{{.Id}}')"
[ "$ID_WEB_NA" = "$ID_WEB_VOOR" ] || faal "bijwerken.sh staging herstartte web: het container-ID veranderde"
[ "$ID_STAGING_NA" != "$ID_STAGING_VOOR" ] || faal "bijwerken.sh staging maakte web-staging niet opnieuw aan"
grep -q "$REVISIE" "${TMP}/bijwerken-staging.log" || faal "bijwerken.sh toont de image-revisie niet"
grep -q 'pull web-staging)' "${TMP}/bijwerken-staging.log" || faal "bijwerken.sh staging haalde web-staging niet op (pull)"
if grep -qE 'dump gemaakt' "${TMP}/bijwerken-staging.log"; then faal "bijwerken.sh staging maakte een back-up (alleen productie)"; fi
[ "$(docker inspect "${PROJECT}-web-staging" --format '{{.State.Health.Status}}')" = healthy ] || faal "web-staging is na bijwerken niet healthy"
[ "$(curl -s "${BASIS}/api/gezondheid" | jget ok)" = true ] || faal "productie reageert niet meer na bijwerken van staging"
goed "bijwerken.sh staging: web-staging opnieuw aangemaakt, web onaangeroerd (container-ID gelijk), revisie getoond, geen back-up"

ID_STAGING_VOOR="$ID_STAGING_NA"
bijwerken productie >"${TMP}/bijwerken-productie.log" 2>&1 || { cat "${TMP}/bijwerken-productie.log" >&2; faal "bijwerken.sh productie mislukte"; }
sed 's/^/        | /' "${TMP}/bijwerken-productie.log"
grep -q 'dump gemaakt' "${TMP}/bijwerken-productie.log" || faal "bijwerken.sh productie maakte geen back-up"
REGEL_DUMP="$(grep -n 'dump gemaakt' "${TMP}/bijwerken-productie.log" | head -1 | cut -d: -f1)"
REGEL_HERSTART="$(grep -n 'web herstarten' "${TMP}/bijwerken-productie.log" | head -1 | cut -d: -f1)"
[ -n "$REGEL_DUMP" ] && [ -n "$REGEL_HERSTART" ] && [ "$REGEL_DUMP" -lt "$REGEL_HERSTART" ] || faal "bijwerken.sh productie maakt de back-up niet vóór het herstarten van web (regels ${REGEL_DUMP:-?} en ${REGEL_HERSTART:-?})"
grep -q 'pull web)' "${TMP}/bijwerken-productie.log" || faal "bijwerken.sh productie haalde web niet op (pull)"
[ "$(docker inspect "${PROJECT}-web-staging" --format '{{.Id}}')" = "$ID_STAGING_VOOR" ] || faal "bijwerken.sh productie herstartte web-staging"
[ "$(docker inspect "${PROJECT}-web" --format '{{.State.Health.Status}}')" = healthy ] || faal "web is na bijwerken niet healthy"
goed "bijwerken.sh productie: eerst een back-up, dan web; web-staging onaangeroerd"

# Een laatste controle over alle logs van de hele rooktest: geen van de drie wachtwoorden in een log.
for DIENST in web web-staging mailpit postgres gotenberg backup; do
  geen_lek "$(compose logs --no-color "$DIENST" 2>&1)" "de log van $DIENST"
done
goed "de logs van web, web-staging, mailpit, postgres, gotenberg en backup bevatten na alle stappen geen wachtwoord"

stap "Klaar"
