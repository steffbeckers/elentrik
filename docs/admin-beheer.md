# Systeembeheer

Een systeembeheerder gebruikt `/admin` met zijn eigen bevestigde account. De rol staat los van bedrijfslidmaatschappen. Elke beheer-API controleert de rol opnieuw in de database.

## Toegang verlenen en intrekken

Voer dit alleen als database-operator uit op de bedoelde omgeving. Zoek eerst het exacte account en controleer het bevestigde e-mailadres. Gebruik daarna het gevonden gebruikers-ID; vervang de voorbeeldwaarde hieronder.

```sql
SELECT id, name, email, email_verified, superuser FROM "user" WHERE id = '<exact-gebruikers-id>';
UPDATE "user" SET superuser = true WHERE id = '<exact-gebruikers-id>' AND email_verified = true;
```

Intrekken geldt vanaf het volgende beheerverzoek, ook in bestaande sessies:

```sql
UPDATE "user" SET superuser = false WHERE id = '<exact-gebruikers-id>';
```

Registratie en profielwijzigingen kunnen deze rol niet instellen. Een beheerder zonder bedrijf kan rechtstreeks naar `/admin`. De gewone klantpagina's blijven hun bedrijfslidmaatschap controleren.
