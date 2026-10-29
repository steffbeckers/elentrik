#!/bin/sh
# Maakt de databases en rollen van de apps aan. Draait alleen bij de eerste initialisatie van een lege
# datamap (zo werkt /docker-entrypoint-initdb.d); voor een Postgres die al draait staat dezelfde SQL in
# docs/online.md, sectie 11 ("Staging"), stap 2.
#
# De bootstrap-superuser van Postgres is `elentrik_beheer` (POSTGRES_USER in compose.yaml), alleen voor
# beheer; geen enkele app of back-up gebruikt hem. Daarnaast:
#   - de rol `elentrik` (productie): LOGIN, geen superuser, geen CREATEDB/CREATEROLE, wachtwoord uit
#     POSTGRES_WACHTWOORD, eigenaar van de database `elentrik`;
#   - de rol `elentrik_staging`: hetzelfde, wachtwoord uit STAGING_POSTGRES_WACHTWOORD, eigenaar van
#     `elentrik_staging`;
#   - PUBLIC mag op geen enkele database verbinden (ook niet op postgres en template1); elke rol alleen
#     op zijn eigen database. Omdat geen van beide rollen superuser is, geldt dat echt voor beide kanten:
#     productie komt niet in staging en staging niet in productie.
#
# De wachtwoorden gaan niet via een argument en niet via shell-interpolatie in de SQL: psql leest ze met
# \getenv en voegt ze met :'...' als correct afgeschermde tekst in, dus ook tekens als ' " / # ? @ breken
# niets en komen niet in een procesoverzicht.
# Geen `set -u` hier: Docker leest dit bestand in zijn eigen shell in als het niet uitvoerbaar is.
: "${POSTGRES_WACHTWOORD:?POSTGRES_WACHTWOORD ontbreekt: de database van productie kan niet worden aangemaakt}"
: "${STAGING_POSTGRES_WACHTWOORD:?STAGING_POSTGRES_WACHTWOORD ontbreekt: de database van staging kan niet worden aangemaakt}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<'SQL'
\getenv wachtwoord_productie POSTGRES_WACHTWOORD
\getenv wachtwoord_staging STAGING_POSTGRES_WACHTWOORD
CREATE ROLE elentrik LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'wachtwoord_productie';
CREATE ROLE elentrik_staging LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'wachtwoord_staging';
CREATE DATABASE elentrik OWNER elentrik;
CREATE DATABASE elentrik_staging OWNER elentrik_staging;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
REVOKE CONNECT ON DATABASE elentrik FROM PUBLIC;
REVOKE CONNECT ON DATABASE elentrik_staging FROM PUBLIC;
GRANT CONNECT ON DATABASE elentrik TO elentrik;
GRANT CONNECT ON DATABASE elentrik_staging TO elentrik_staging;
SQL
