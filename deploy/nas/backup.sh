#!/bin/sh
# Back-up van de database van Elentrik, voor de dienst `backup` in compose.yaml (postgres:alpine,
# dus busybox sh). Elke nacht om 03:00 Europe/Brussels een `pg_dump -Fc` naar /backups, en dumps
# ouder dan 30 dagen worden verwijderd. De verbinding komt uit PGHOST, PGUSER, PGDATABASE en
# PGPASSWORD (compose zet ze).
#
#   backup.sh                 draait voor altijd: een nachtelijke dump, elke kalenderdag precies een
#   backup.sh --nu            maakt een dump meteen en stopt (voor een test of vlak voor een update)
#   backup.sh --test-tijd     leest Unix-tijden (een per regel, als polltijdstippen) van stdin en schrijft
#                             "dump JJJJMMDD UU" voor elk moment waarop de lus zou dumpen; er wordt niets
#                             gedumpt (voor deploy/nas/rooktest.sh, rond de zomertijdnachten)
#
# Het schema: elke minuut kijkt de lus naar de lokale klok (TZ=Europe/Brussels). Is het uur 03 en
# staat er voor de datum van vandaag nog geen markering, dan volgt een dump en de markering. Zo krijgt
# elke kalenderdag precies een dump, ook in de nacht dat de klok vooruit gaat (02:00 wordt 03:00) of
# achteruit (03:00 wordt 02:00; het uur 03 komt dan maar een keer voor).
set -u

MAP=/backups
BEWAAR_DAGEN=30
DUMPUUR=03
# De datum van de laatste geslaagde nachtelijke dump; een handmatige --nu telt niet mee.
MARKERING="$MAP/.laatste-nachtdump"

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

# Moet er nu een nachtelijke dump komen? $1 = datum (JJJJMMDD), $2 = uur (UU), lokale tijd.
moet_dumpen() {
  [ "$2" = "$DUMPUUR" ] && [ "$(cat "$MARKERING" 2>/dev/null)" != "$1" ]
}

if [ "${1:-}" = "--nu" ]; then
  maak_dump || exit 1
  ruim_op
  exit 0
fi

if [ "${1:-}" = "--test-tijd" ]; then
  MARKERING=$(mktemp)
  rm -f "$MARKERING"
  while read -r tijd; do
    datum=$(date -d "@$tijd" +%Y%m%d)
    uur=$(date -d "@$tijd" +%H)
    if moet_dumpen "$datum" "$uur"; then
      echo "dump $datum $uur"
      echo "$datum" >"$MARKERING"
    fi
  done
  rm -f "$MARKERING"
  exit 0
fi

log "dumpt elke nacht om ${DUMPUUR}:00 ($(date +%Z)); bewaart ${BEWAAR_DAGEN} dagen"
while :; do
  datum=$(date +%Y%m%d)
  uur=$(date +%H)
  if moet_dumpen "$datum" "$uur"; then
    if maak_dump; then
      echo "$datum" >"$MARKERING"
      ruim_op
    else
      # Mislukt (bijvoorbeeld de database is even weg): over vijf minuten opnieuw, binnen het uur.
      sleep 240
    fi
  fi
  sleep 60
done
