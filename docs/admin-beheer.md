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

## Uitrollen

Maak de gebruikelijke database- en bestandsback-up en voer `pnpm db:migrate` uit op de bedoelde omgeving vóór de nieuwe applicatie start. Migraties `0010` tot en met `0013` voegen de superuser-vlag, mutatieontvangsten, auditregels, interne notities, correctiesessies en projectrevisies toe. Bestaande gebruikers krijgen geen beheertoegang. Ken die daarna uitsluitend aan gecontroleerde accounts toe met de SQL hierboven.

Het dashboard staat op `/admin`; het gebruikersmenu toont **Beheer** voor een superuser. Er is geen aparte login of impersonatie. Een geweigerde of onbereikbare rechtencontrole opent geen beheerpagina. Zoekresultaten en detailverzoeken zijn gebonden aan het account dat het venster opende.

## Dagelijks gebruik

Het overzicht toont aantallen, recente activiteit, toegang per bedrijf, aandachtspunten en vervallen opvolgdatums. Zoeken vindt gebruikers, bedrijven en projecten; de tabellen ondersteunen filters en paginering. Een verwijderd project verschijnt bij zoeken op zijn exacte ID, met een duidelijke verwijderstatus. Het kan hier niet hersteld of aangepast worden.

Op een gebruiker kun je de naam corrigeren. Op een bedrijf kun je de naam, contactgegevens en het adres corrigeren. Vermeld steeds een concrete reden. Het bestaande bedrijfslogo en eerder gemaakte exports blijven behouden. Een gelijktijdige wijziging levert een conflict op: controleer de actuele gegevens voordat je opnieuw indient. Een herhaalde poging na een verloren antwoord hergebruikt dezelfde mutatie-ID zolang de invoer gelijk blijft.

## Gratis toegang, proefperiode en Stripe

**Gratis toegang toekennen** zet de lokale vrijstelling van een bedrijf aan. Het bedrijf kan dan zonder abonnement blijven schrijven, ook na het einde van de proef. Opslaglimieten en lidmaatschappen blijven gelden. Nieuwe Checkout-sessies zijn geblokkeerd zolang de vrijstelling actief is. Stopzetten van gratis toegang past de bestaande proef- en abonnementsregels opnieuw toe; het begint geen nieuwe proef of betaling.

**Proefperiode verlengen** vraagt de nieuwe laatste proefdag in `Europe/Brussels`. Die dag is inbegrepen: de opgeslagen grens is het begin van de volgende Brusselse kalenderdag, met zomer- en wintertijd. De datum moet in de toekomst liggen en het bestaande lokale proefeinde verlengen. Dit verandert de eerdere proefgerechtigdheid van de gebruiker niet.

Beide acties veranderen uitsluitend de lokale toegang. Een bestaand Stripe-abonnement blijft factureren, en een eerder geopende Checkout-link kan nog gebruikt worden. Bij een geregistreerd abonnement of open Checkout moet je dit expliciet erkennen. Annuleer of wijzig het abonnement, de facturering of een Stripe-proef in Stripe zelf. De knoppen bij het bedrijf openen het opgeslagen abonnement of klantrecord in de juiste test- of liveomgeving. Bij ontbrekende IDs, een onbekende omgeving of de lokale nep-Stripe wordt geen misleidende link getoond.

De toegangsverklaring gebruikt dezelfde beslisregels als de app: betalingen globaal uit, vrijstelling, actief abonnement, betalingsgratie, lokale proef en alleen-lezen. Een proefverlenging kan daardoor tijdelijk onder een andere toegangsregel vallen. De geregistreerde Stripe-status en synchronisatiedatum zijn lokale gegevens; een link openen ververst of wijzigt ze niet.

## Projectcorrecties

Open het project vanuit de beheerdetailpagina. De gedeelde editor opent **alleen-lezen**. Begin een supportcorrectie met een reden om te wijzigen. De banner toont het bedrijf, de reden en het verloopmoment. De sessie geldt maximaal acht uur, voor dit project, deze beheerder en deze specifieke login. Een pagina herladen vereist opnieuw een expliciet gestarte correctie voordat lokaal werk kan worden opgeslagen.

Een supportcorrectie kan ook een project van een bedrijf met alleen-lezen abonnementsrechten wijzigen. Documentvalidatie, versieconflicten, bestandscontrole en opslaglimieten blijven gelden. Iedere geslaagde bewaring heeft een auditregel en een volledige voor/na-revisie; uploads hebben eveneens auditbewijs. **Correctie afronden** wacht op de laatste bewaring en stopt daarna verdere wijzigingen. Een mislukte bewaring sluit de sessie niet stilzwijgend af. Na een verloren antwoord bevestigt de editor eerst de oorspronkelijke bewaring voordat latere wijzigingen met de nieuwe versie worden verstuurd.

Bij verloop, intrekking van rechten of een andere login stoppen verdere schrijfpogingen. Niet-opgeslagen werk blijft in het venster en wordt waar mogelijk in IndexedDB bewaard. Supportconcepten zijn gescheiden van klantconcepten, ook voor dezelfde gebruiker en hetzelfde project. Bij een conflict kun je de nieuwste serverversie laden of het lokale document downloaden. De download is pas beschikbaar zodra het juiste project geladen is. De JSON bevat bestandsverwijzingen, **geen archief met de planbestanden**. Sluit een venster met niet-opgeslagen werk pas nadat je het hebt hersteld of veiliggesteld.

In beheermodus kun je geen project aanmaken, dupliceren, verwijderen of herstellen en geen nieuwe dossier-PDF genereren. Bestaande exports zijn via de beheerdetailpagina beschikbaar.

## Audit, notities en opslag

De auditgeschiedenis bewaart actornaam, tijdstip, doel, actie, reden en voor/na-gegevens. Correctiesessies bundelen de bijbehorende acties. Grote projectrevisies worden pas opgevraagd als je ze opent. Geschiedenis blijft beschikbaar na een naamswijziging of verwijdering van de oorspronkelijke gebruiker of het project; een link naar een niet meer bestaand record kan daarom ontbreken of niet meer openen.

Bestanden waarnaar een bewaarde auditrevisie verwijst, worden niet als verweesd opgeruimd. Dat geldt ook na de gewone bewaartermijn van een verwijderd project. Deze bestanden blijven meetellen in de opslag van het bedrijf. De dagelijkse opruiming controleert dit opnieuw onder hetzelfde transactieslot als een supportbewaring. Er is bewust geen automatische auditvervaltermijn of rollbackknop: bepaal een eventuele bewaartermijn als afzonderlijke product- en beheerbeslissing. Neem auditdata en bestanden samen op in back-ups.

Supportnotities horen bij een bedrijf of project en zijn uitsluitend zichtbaar voor superusers. Ze verschijnen niet in klantantwoorden of dossierexports. Aanmaken, wijzigen en archiveren worden geaudit. Een opvolgdatum wordt vanaf die Brusselse kalenderdag zichtbaar in het overzicht; archiveren of verwijderen van de opvolgdatum haalt ze daar weg. **Alle resultaten bekijken** opent de gepagineerde opvolglijst.

## Verificatie en grenzen

De geautomatiseerde controles dekken toegangsrechten, transacties, versieconflicten, herhaalde verzoeken, datumgrenzen, bewaarbeleid voor bestanden, gescheiden concepten en de beheer- en klantflows. Browsercontroles gebruiken uitsluitend de geïsoleerde testdatabase, testmailbox en lokale PDF-service; zie [de lokale testopstelling](lokaal-en-online.md#wat-de-e2e-tests-doen).

Een echte Stripe-accountkoppeling, productiegegevens en een productie-uitrol worden hiermee niet getest. De app beheert geen Stripe-abonnementen vanuit dit dashboard.
