#!/bin/sh
# Maakt naast de database `elentrik` de database en rol van staging aan. Draait alleen bij de eerste
# initialisatie van een lege datamap (zo werkt /docker-entrypoint-initdb.d); voor een Postgres die al
# draait staat dezelfde SQL in docs/online.md.
#
#   - de rol `elentrik_staging` (geen superuser) met het wachtwoord uit STAGING_POSTGRES_WACHTWOORD;
#   - de database `elentrik_staging`, met die rol als eigenaar;
#   - PUBLIC mag op geen van beide databases verbinden; elke rol alleen op zijn eigen database.
#     (De rol `elentrik` is de superuser van Postgres en blijft overal bij; wat telt is dat staging
#     productie niet bereikt.)
#
# Het wachtwoord gaat niet via een argument en niet via shell-interpolatie in de SQL: psql leest het
# met \getenv en voegt het met :'wachtwoord' als correct afgeschermde tekst in, dus ook tekens als
# ' " / # ? @ breken niets en komen niet in een procesoverzicht.
# Geen `set -u` hier: Docker leest dit bestand in zijn eigen shell in als het niet uitvoerbaar is.
: "${STAGING_POSTGRES_WACHTWOORD:?STAGING_POSTGRES_WACHTWOORD ontbreekt: de database van staging kan niet worden aangemaakt}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv wachtwoord STAGING_POSTGRES_WACHTWOORD
CREATE ROLE elentrik_staging LOGIN PASSWORD :'wachtwoord';
CREATE DATABASE elentrik_staging OWNER elentrik_staging;
REVOKE CONNECT ON DATABASE elentrik FROM PUBLIC;
REVOKE CONNECT ON DATABASE elentrik_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE elentrik TO elentrik;
GRANT CONNECT ON DATABASE elentrik_staging TO elentrik_staging;
SQL
