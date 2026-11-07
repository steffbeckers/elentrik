# Dossierbijlage en bewerkbaar afdrukvoorbeeld

> **For agentic workers:** Gebruik superpowers:executing-plans; voer deze twee gerichte reparaties in de bestaande checkout uit.

**Goal:** De twee resterende punten uit de bronreconstructie oplossen.

**Architecture:** Eén gedeelde dossierstatus voor checklist en PDF, apart van elektrische bevindingen. De bestaande printHtml-renderer blijft de bron voor een live afdrukvoorbeeld naast dezelfde opmaakvelden als in de editor.

**Tech Stack:** TypeScript, Vue/Nuxt, Vitest en Playwright.

**Spec:** De sectie 'Resterende productfeedback uit de afwerking' in `docs/reviews/2026-11-06-elektricien-restpunten.md`, expliciet ter uitvoering gevraagd door de gebruiker.

## Randvoorwaarden en keuzes

- Bestaande branch en checkout behouden op verzoek uit de sessie; proefproject niet vervangen.
- Onzekere brongegevens blijven onzeker; geen modelposities verplaatsen om een afdrukprobleem te verbergen.
- Geen nieuwe wettelijke controles of afhankelijkheden. Nederlands, Frans en Engels ondersteunen.
- Gedeelde dossierstatus voorkomt drift; losse extra PDF-controles zouden dezelfde fout opnieuw mogelijk maken.
- Een bewerkbaar afdrukvoorbeeld hergebruikt de echte renderer. Een benaderende tweede canvas-schaalberekening kan opnieuw afwijken door papier, kalibratie of cartouchehoogte.

## Taken

- [x] 1. Schrijf falende regressies voor ongeplaatste infrastructuur, ongenummerde PV en onbekende installatiecontext in de PDF. Verplaats de bestaande plaatslijstafleiding en dossierstatus naar render; behoud web-importpaden als re-exports. Neem ontbrekende metadata, plannen en herkenbaar benoemde onderdelen apart in de bijlage op. Referentiebladen tellen niet als af te drukken plannen. Behoud bestaande elektrische bevindingen zonder dubbele plaatsmeldingen. Test NL/FR/EN, lange tekst en een volledig dossier.
- [x] 2. Schrijf een browserregressie voor opmaak aanpassen met zichtbare afdruk. Splits de bestaande opmaakvelden af voor hergebruik; voeg in Planopmaak toegang toe tot het bestaande afdrukvoorbeeld met een zijpaneel voor puntselectie, labelpositie, grootte, versie en pagina-afdrukinstellingen. Dezelfde renderer en formulieroperaties blijven verantwoordelijk voor uitvoer en undo/opslag. Houd exportpreview zonder zijpaneel intact.
- [x] 3. Draai relevante tests, volledige functionele suite en typecontrole. Controleer desktop/mobiel, herladen, bronposities en een nieuwe echte proefprojectexport. Laat de wijzigingen onafhankelijk reviewen en werk het reviewverslag bij.

## Reviewfocus

- Referentiebladen mogen een ontbrekend uitvoeringsplan niet verbergen.
- Ongenummerde PV moet herkenbaar blijven en mag geen fictief puntnummer krijgen.
- Lege of lange metadata, drie talen en paginering mogen geen informatie verliezen.
- Aanpassen in preview moet echte opgeslagen opmaak wijzigen, met undo en alleen-lezen bescherming.
- Een laadfout in het afdrukvoorbeeld mag geen leeg paneel zonder uitleg opleveren.

## Voortgang

- Oorzaken vastgesteld: PDF kent alleen AREI-bevindingen; print-only minimumgrootte ontbreekt in de gewone editorweergave.
- Uitvoering direct geautoriseerd met 'Los de resterende punten ook op'; geen nieuwe goedkeuringsronde nodig.

- Gedeelde dossierstatus en volledige bijlage geïmplementeerd; vijf gerichte regressies dekken talen, infrastructuur, referentiebladen en lange tekst.
- Bewerkbare preview gebruikt printHtml en dezelfde opmaakvelden; onafhankelijk gevonden A3/A4-navigatiefout hersteld.
- Volledige suite: 206 bestanden / 3.816 tests; prestaties: 5/5; volledige typecontrole en laatste web-typecontrole geslaagd.
- Nieuwe acht pagina’s tellende UI-export gecontroleerd; volledige projectdocument bleef exact gelijk.
- Drie browserregressies geslaagd: echte export/download, bestaand afdrukvoorbeeld en bewerken met gemengde A3/A4-pagina’s, desktop/mobiel en opslag/herladen. De herlaadtest wacht op de bestaande autosave-status.
