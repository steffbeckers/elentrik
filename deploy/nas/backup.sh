#!/bin/sh
# Back-up van de database van Elentrik, voor de dienst `backup` in compose.yaml (postgres:alpine,
# dus busybox sh). Elke nacht om 03:00 Europe/Brussels een `pg_dump -Fc` naar /backups, en dumps
# ouder dan 30 dagen worden verwijderd. De verbinding komt uit PGHOST, PGUSER, PGDATABASE en
# PGPASSWORD (compose zet ze).
#
#   backup.sh        wacht tot 03:00, maakt een dump en herhaalt dat elke nacht
#   backup.sh --nu   maakt een dump meteen en stopt (voor een test of vlak voor een update)
set -u

MAP=/backups
BEWAAR_DAGEN=30
DRIE_UUR=$((3 * 3600))

log() { echo "[backup $(date '+%Y-%m-%d %H:%M:%S')] $*"; }

maak_dump() {
  naam="$MAP/elentrik-$(date +%Y%m%d-%H%M).dump"
  # Eerst naar .tmp en dan hernoemen: een dump die halverwege stopt, staat nooit onder de echte naam.
  if pg_dump -Fc -f "$naam.tmp" && mv "$naam.tmp" "$naam"; then
    log "dump gemaakt: $(basename "$naam") ($(wc -c <"$naam") bytes)"
    return 0
  fi
  rm -f "$naam.tmp"
  log "FOUT: de dump is mislukt"
  return 1
}

ruim_op() {
  find "$MAP" -maxdepth 1 -type f \( -name 'elentrik-*.dump' -o -name 'elentrik-*.dump.tmp' \) -mtime +"$BEWAAR_DAGEN" -exec rm -f {} \;
}

# Het aantal seconden tot de volgende 03:00 (lokale tijd), 0 tot 86399.
seconden_tot_drie() {
  u=$(date +%H); m=$(date +%M); s=$(date +%S)
  u=${u#0}; m=${m#0}; s=${s#0}
  nu=$(( ${u:-0} * 3600 + ${m:-0} * 60 + ${s:-0} ))
  wacht=$(( DRIE_UUR - nu ))
  [ "$wacht" -lt 0 ] && wacht=$(( wacht + 86400 ))
  echo "$wacht"
}

if [ "${1:-}" = "--nu" ]; then
  maak_dump || exit 1
  ruim_op
  exit 0
fi

log "wacht op 03:00 ($(date +%Z)); bewaart ${BEWAAR_DAGEN} dagen"
while :; do
  wacht=$(seconden_tot_drie)
  # Hoogstens een uur per keer slapen: de klok (zomertijd) wordt zo telkens opnieuw gelezen.
  if [ "$wacht" -gt 3600 ]; then
    sleep 3600
    continue
  fi
  sleep "$wacht"
  maak_dump
  ruim_op
  # Voorbij het venster van 03:00, zodat dezelfde nacht niet opnieuw begint.
  sleep 120
done
