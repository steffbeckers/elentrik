# Elektricienworkflow: resterende punten

Opdracht: de gebruiker vraagt op 6 november 2026 expliciet alle nog open punten op te lossen. Vervolg op de hertest van 5 november; de bestaande verbeterbranch blijft de werkplek.

## Werkpakketten en eigenaarschap

1. Kwartslagen — bestaande draaiknoppen 90°, fijne sneltoetsen 15°, selectie als één undo-stap. Afgerond in `980919b`; 91 gerichte tests, typecontrole en desktop/mobiele browserproef geslaagd.
2. Dossiermodel — aardelektrode en aardingsonderbreker als eigen onderdelen, teller plaatsbaar; 50 Hz, tellerstroom, kVA, panelenaantal en DC-detectie als afzonderlijke velden. Expliciete ongenummerde PV-bron mogelijk; onzeker driebladenpictogram blijft als onbekend herkenbaar. Eén eigenaar voor schema, nummering, symbolen, eigenschappen en technische labels.
3. Afdruk — begin verticale paginering bij de inhoud van de horizontale strook en vul bladen met passende fragmenten. Geen verkleining van technische tekst; wederzijdse vervolgverwijzingen en alle onderdelen behouden. Afzonderlijke eigenaar voor printpaginering, tests en PDF-bewijs.
4. Bron opschonen — handmatige verwijderbare witte vlakken tussen het raster en de eigen symbolen. Twee tegenoverliggende hoeken aanklikken, selecteren/verwijderen, undo/redo en export. Originele bestanden blijven behouden; geen automatische interpretatie van muren of symbolen. Afzonderlijke eigenaar voor situatiebediening en afdekkingsoperaties, schema in overleg met modeleigenaar.
5. Integratie — gerichte regressies, gezamenlijke typecontrole, brede tests, browserinvoer en echte PDF-export. De oude proefgegevens worden via de UI aangevuld. De verdwenen rasters uit de eerdere werkboom zijn uiteindelijk bytegetrouw uit de browsercache hersteld; de oorspronkelijke ACA-PDF was lokaal bewaard. Modelobjecten en plaatsingen zijn via de zichtbare app ingevoerd.

## Bronverificatie

De officiële [FOD-publicatie](https://economie.fgov.be/nl/publicaties/algemeen-reglement-op-de) vermeldt versie 07 van 15 september 2026, van toepassing vanaf 1 november 2026. De volledige download is nu bereikbaar. De symbolen voor leiding in/op een wand en in buis zijn visueel vergeleken met tabel 2.23, gedrukte p. 55–56 (PDF-pagina 60–61). De bestaande samengestelde leidingnotatie volgt deze tekens, gedraaid voor de verticale leiding. De eerdere CAPTCHA-beperking voor deze vergelijking is vervallen.

Deze vergelijking is geen elektrische keuring. Het exacte toestel achter H3, de locatie van I3 en de PV-array zijn niet af te leiden uit de geselecteerde bronbladen. We bouwen bediening om zekere informatie getrouw vast te leggen; we verzinnen geen ontbrekende plaats of toestelbetekenis.

## Verificatie en oplevering

- [x] Kwartslagen geïmplementeerd, onafhankelijk nagekeken en getest.
- [x] Nieuwe modelonderdelen en velden invoeren, bewaren, herladen en afdrukken.
- [x] Bronafdekking toevoegen/verwijderen op desktop en mobiel; undo en export controleren.
- [x] Compactere afdruk meten op synthetisch dossier én bestaand proefproject.
- [x] Brede functionele tests en typecontrole uitvoeren op de gecombineerde wijzigingen.
- [x] Resterende brononzekerheden duidelijk houden in het nieuwe hertestrapport.

Implementatiekeuzes: geen extra runtimebibliotheken; optionele velden behouden oude documenten; kVA wordt niet naar W geconverteerd; bronafdekking is een omkeerbare weergavelaag; geen puntnummer betekent geen extra genummerd kringpunt maar sluit controle/plaatsing van het onderdeel niet uit.

Afgerond: 204 bestanden / 3.791 functionele tests, vijf browserproeven, volledige typecontrole. De laatste tellerafdrukcorrectie is aanvullend gecontroleerd met 142 gerichte printtests, render-typecontrole, een nieuwe volledige typecontrole en een echte UI-export. De vijf prestatietests slagen op de laatste code. Onafhankelijke herreviews hebben geen resterende concrete codebevindingen. Zie [de hertest](../../reviews/2026-11-06-elektricien-restpunten.md) voor de scheiding tussen opgeloste productpunten en resterende bron-/dossierafwerking.
