# Editorcompositie herstellen

**Doel:** het plan is de hoofdinhoud; de afzonderlijke UX-fixes vormen één rustige werkplek.
**Aanleiding:** gebruiker vindt het plan te klein, de balken te ruim en de tools door elkaar.
**Keuze:** behoud de bestaande vormgeving en functies, consolideer de bediening. Alleen padding verkleinen laat de verkeerde hiërarchie bestaan; zwevende panelen zouden het plan opnieuw bedekken. Daarom één optioneel zijpaneel en twee gezamenlijke navigatierijen.
**Techniek:** bestaande Vue/Nuxt-componenten; geen nieuwe dependencies of documentmodelwijzigingen.

- [x] Projectacties in EditorBovenbalk; dossiernavigatie samen met paneelkeuze in EditorWerkruimte. Eén sluitbaar paneel voor onderdelen/eigenschappen/bevindingen/opmaak, standaard gesloten op het plan.
- [x] PlanCanvas: puntkeuze en selectieacties in één compacte werkbalk; hulp op aanvraag. PaginaTabs onder het plan, instructie alleen tijdens plaatsen/meten.
- [x] SchemaCanvas: compacte bediening zonder dubbele labelregels; behoud native selectie en invoegpunt.
- [x] Controleer desktop en telefoon samen: groot plan, panelen sluiten/openen, selectie, bevindingennavigatie, opmaak, pagina's, export en geen pagina-overflow. Webtypecheck en relevante regressies uitvoeren.

**Reviewfocus:** canvas blijft zichtbaar bij opmaak; selectie opent niet onverwacht een paneel; toetsenbordfocus bij sluiten keert terug naar de opener; alle functies en NL/FR/EN blijven beschikbaar. Bestaande lokale wijzigingen behouden; niet deployen.

## Resultaat

Op 1280×720 is het planvenster 1280×553 zonder paneel en 992×553 met paneel (voorheen circa 737×350 met beide panelen). Visuele controle op desktop en 390×844, inclusief open planopmaak; mobiele paneelkeuze past zonder horizontale overflow. Puntselectie houdt gesloten panelen gesloten. Labeloffset wijzigen/undo, bevinding naar kring, paneel sluiten/focusherstel en Escape gecontroleerd. Tijdelijke documentwijziging ongedaan gemaakt.

`pnpm --filter @elentrik/web typecheck`: geslaagd. Gerichte Vitest-run: 6 bestanden, 134 tests geslaagd. Onafhankelijke code-review: geen concrete P1/P2-regressies. `git diff --check`: schoon. Bewijsbeelden: `out/review-2026-11-01/compositie-desktop.png`, `compositie-desktop-opmaak.png`, `compositie-phone.png`.
