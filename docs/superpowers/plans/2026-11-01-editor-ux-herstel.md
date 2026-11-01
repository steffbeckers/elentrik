# Editor UX herstel — implementatieplan

**Doel:** alle bevindingen uit de Impeccable-review oplossen binnen de bestaande editor, inclusief toetsenbordbediening en invoerfeedback.

**Ontwerp:** vaste gereedschap- en inspectiepanelen op desktop; compacte paneelkeuze met volle werkbreedte op smalle schermen. Planopmaak verhuist van canvas naar inspecteur. Bevindingen groeperen op ernst, regel, berichtparameters en kring, met individuele motivatie en navigatie naar relevante beveiliging. Technische tabelwaarden blijven intact en worden bewust uitgelijnd/gegroepeerd.

**Autorisatie:** gebruiker vraagt alle beschreven problemen op te lossen. Bestaande worktree en lokale wijzigingen behouden. De gekozen richting verfijnt de huidige Operate-interface; geen nieuwe visuele identiteit of claims. Eén assetdependency toegevoegd: `@iconify-json/lucide`, omdat ontbrekende lokale iconen een falende externe fallback veroorzaakten.

**Reviewfocus:** document/undo/read-only behouden; grouping mag afwijkingen of verschillende parameters niet samenvoegen; selectie vanuit keyboard moet bereikbare eigenschappen opleveren; mobiel mag geen documentbrede overflow hebben; opmaak mag geen canvas bedekken; NL/FR/EN compleet.

- [x] Bevindingen: pure grouping/navigatiehelper met red→green regressies, compacte gegroepeerde UI, zichtbare context en Projectgegevens openen. Agent findings.
- [x] Plan: Planopmaak uit canvas verwijderen, invoerfeedback en veldvalidatie; keyboardselectie/verplaatsing/plaatsing met readonlybescherming. Agent plan.
- [x] Schema/tabel: bereikbare structurele selecties en invoegpunten; keyboardactivatie; tabelkolombreedtes en kringgroepering zonder gegevensverlies. Agent schema.
- [x] Shell: compacte responsieve bovenbalk, paneelbediening, inspector voor eigenschappen/bevindingen/planopmaak, selectiefocus en full-width canvas. Root.
- [x] Integratie: vertalingen, volledige functionele tests/typecheck, onafhankelijke code-review en begrensde browsercontrole desktop/tablet/telefoon; één herstelronde op bevindingen.

## Verificatie — 1 november 2026

- `pnpm test`: 139 testbestanden / 3263 tests geslaagd; daarnaast 5 prestatietests geslaagd.
- `pnpm typecheck`: alle packages en webapp geslaagd.
- Onafhankelijke review: twee bevindingen hersteld met regressietests (Enter/Space op native summary en dubbele undo-stap bij labeloffset). Herreview: geen resterende P1/P2-bevindingen.
- Impeccable detect voor de gewijzigde editoroppervlakken: lege resultatenlijst.
- Browsercontrole bij 1280×720, 768×1024 en 390×844: schemaonderdelen toevoegen/selecteren, planpunten plaatsen/verplaatsen, undo, invoervalidatie, gegroepeerde bevindingen en navigatie, contextdialoog en exportdialoog. Geen documentbrede horizontale overflow; tabel scrollt binnen het eigen paneel.
- Tijdelijke wijzigingen in het fictieve testproject ongedaan gemaakt. De tien elektrische bevindingen zijn bewust aanwezige testdata.
- Na installatie van Lucide en serverherstart laden de werkbalkiconen lokaal; visueel en via de gerenderde SVG-maskers bevestigd.
- Testlogs en screenshots staan in `out/review-2026-11-01/`, met `ux-desktop-plan-final.png` als eindbeeld.

Geen volledige schermlezeraudit of nieuwe PDF-rendercontrole in deze UX-ronde; de browsercontroles gebruikten gesimuleerde schermbreedtes.

Geen deployment of push. Devserver blijft beschikbaar op poort 3200.
