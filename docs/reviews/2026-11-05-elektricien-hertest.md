# Hertest van de elektricienworkflow

Uitgevoerd op 5 november 2026 in de lokale integratiewerkboom `D:/Orca/elentrik/elektricien-verbeteringen`, branch `users/s.beckers/elektricien-verbeteringen`. Dit rapport onderscheidt geïmplementeerde bediening, daadwerkelijk uitgevoerde controles en nog open bronacceptatie. Het is geen elektrische keuring.

## Testomgeving en bron

De handmatige proef gebruikt de interne Orca-browser, een nieuw via de registratie- en e-mailverificatieroute aangemaakt testaccount en een aparte lokale database. Project: [ACA praktijktest — verbeterde workflow](http://127.0.0.1:3200/projecten/e26c4d4c-fdd2-4dc9-a8e5-dae9ee57defd). De oorspronkelijke reviewgegevens zijn behouden.

De elektrische reconstructie gebeurt via zichtbare appbediening. Het model, Pinia en de database worden niet rechtstreeks gevuld om ontbrekende invoer te omzeilen. Automatische regressietests gebruiken daarnaast zelfgemaakte fixtures; die gelden niet als handmatige reconstructie.

De [broninventaris](2026-11-05-aca-broninventaris.md) bevat de 16 bronkringen en de afgelezen specificaties. De [ACA-gids van maart 2025](https://www.acavzw.be/app/uploads/2025/01/Praktische-gids-huishoudelijke-installaties-versie-maart-2025.pdf) toont een voorbeeld met revisie 02 van 1 juni 2023. De actuele volledige officiële AREI-download gaf bij raadpleging een CAPTCHA. De toegankelijke officiële symbolentabel is visueel geraadpleegd; hiermee wordt geen actuele juridische conformiteit van het bronvoorbeeld of de app verklaard.

## Wat de drie werkpakketten veranderen

- **Dossiermodel:** expliciete invoegbestemming; hergebruik van een bestaande differentieel; vaste kring- en differentieelreferenties; gecontroleerd hernummeren en dupliceren; brandreactieklasse en gecombineerde aanleg; lichtschakelingen met afzonderlijk plaatsbare onderdelen; migratie van bestaande documenten op de relevante lees- en schrijfroutes.
- **Bediening:** doorplaatsen met open desktopzijpaneel; stabiel plananker; zoeken en kringfilter; onderscheidende selectieteksten; ongeldige invoer blijft zichtbaar en wordt niet als bewaard voorgesteld.
- **Import en afdruk:** meerdere benoemde uitsneden uit één bronbestand; rotatie en referentiebladen; papierkeuze en oriëntatie per situatieblad; passend of gekalibreerd afdrukken; afdrukvoorbeeld; leesbare paginering, doorlopende cartouches en herhaalde kringkoppen.

De broncontrole leidde ook tot ontbrekende symbolen en gedeelde puntgroepen voor contactdozen/toestellen. De resterende bronuitbreidingen en hun verificatie worden hieronder apart bijgehouden.

## Handmatige controles

### Zeven contactdozen

In de browser zijn J1–J7 met de zichtbare invoer aangemaakt, met C20, 2P, 3 kA, XVB 3G2,5 Cca onder F (30 mA, 63 A, 2P, type A). De voeding is 3N × 400 V. De zeven punten zijn als echte Elentrik-objecten op de afgelezen bronposities geplaatst.

De plaatsroute kostte **10 klikken**: paneel openen, doorplaatsen inschakelen, J1 kiezen en zeven keer op het plan klikken. Escape beëindigde de keuze na J7. Zoeken/kringfilter, draaien en labelcorrecties vallen buiten deze vaste vergelijking, evenals het vooraf opbouwen van de kring. De eerdere vaste deelhandeling kostte 21 klikken. Browserautomatiseringswachttijd is niet als menselijke invoertijd gemeten of vergeleken.

Het plan bleef tijdens deze plaatsreeks op dezelfde positie en schaal. Een aparte browsertest controleert het plananker numeriek. De exacte uitslag van die test staat bij de definitieve testresultaten.

### Bronbestand en export

ACA-pagina 27 is via de importdialoog uitgesneden tot `Gelijkvloers - ACA` en `Eerste verdieping - ACA`. Het originele PDF-bestand bleef de gemeenschappelijke bron. De uitsneden verwijderen boekmarges en oude cartouches; **de bestaande elektrische symbolen in de bron blijven aanwezig**. De afbeelding op de verdieping is op zichzelf geen nieuw elektrisch model.

De handmatige deelproef is geëxporteerd als `Hertest J1-J7 - uitsneden en voeding`. De echte gedownloade PDF telt zes pagina's: twee schema-, twee situatie-, één kringenlijst- en één bevindingenpagina. Alle zes pagina's zijn gerenderd en visueel bekeken. Voeding, J1–J7, F, C20/2P/3 kA en Cca staan in de relevante afdrukken. Het lange versielabel loopt door in de cartouche. De bron en de nieuwe symbolen zijn op de situatiepagina zichtbaar; dit is een proefexport, geen schoon uitvoeringsdossier.

De eerste schemahelft bevat de punten; de tweede bevat de beveiligingen en voeding. Vervolgverwijzingen verbinden beide. Dat bewaart de tekstgrootte, maar gebruikt bij deze kleine proef meer papier dan een compacte handtekening. Compactere schema-indeling blijft een bruikbaar verbeterpunt.

Bestanden staan lokaal onder `out/hertest/`: `elentrik-j1-j7.pdf`, de zes `j-p*.png`-renders en de bronvergrotingen. De externe ACA-bron is niet als repositoryfixture opgenomen.

### Fysieke afdrukmaat

`scripts/workflow-print-proof.ts` is in de integratiewerkboom uitgevoerd tegen Gotenberg. De dossiers tellen respectievelijk 8, 8 en 10 pagina's voor Nederlands, Frans en Engels en bevatten gemengde formaten/oriëntaties. Een getekende referentie van 10 meter meet in de PDF **100,01 mm bij 1:100**. De technische tekst in de handmatige PDF meet met PyMuPDF ongeveer **2,498 mm**, overeenkomend met het doel van 2,5 mm binnen PDF-afronding. Dat doel is een leesbaarheidskeuze, geen geciteerde wettelijke eis. De tekengrootte van reeds in een raster aanwezige bronlabels wordt hierdoor niet groter.

## Reviews en regressies

De onafhankelijke reviews vonden en lieten gericht herstellen:

- botsende presentatienamen bij bijvoorbeeld `Keuken`, `Keuken`, `Keuken 1`;
- vervolgverwijzingen naar een verkeerde verticale tegel bij tegelijk brede en hoge schema's;
- duplicatie naar een reeds automatisch gebruikte kringcode;
- onveilige objectlookup bij ontbrekende geïmporteerde node-ID's zoals `constructor`;
- dubbele referenties die bij een lege node-ID door validatie glipten;
- ononderscheidbare invoegbestemmingen en ontbrekende differentieelreferenties in keuzelijsten;
- botsing tussen een geïmporteerd onderbord-ID `hoofd` en de interne hoofdnummerreeks.

De gerichte herreviews accepteerden die reparaties. De eerste brede browsertest vond daarnaast verouderde testhelpers: klikken in een lege SVG-contactopening, extra getelde filterknoppen, een fixture met acht in plaats van zeven contactdozen, een oude bewaarstatustekst en een vaste verwachting van één schemapagina. De tests zijn gericht gecorrigeerd; selectie, opslagherstel en PDF-inhoud blijven inhoudelijk gecontroleerd.

## Definitieve resultaten en bronacceptatie

### Volledig opgebouwd proefproject

Alle **16 bronkringen** zijn via de UI opgebouwd. Op de twee situatiebladen staan **64 eigen modelobjecten**: 33 op het gelijkvloers en 31 op de eerste verdieping. G bevat elf afzonderlijke schakelaars en elf lampen; gedeelde referenties blijven behouden. Wandlampen, tweepolige schakelaars, de deurbel/monitor en leidingnotatie `4x10`/`2x6` zijn toegevoegd en gebruikt.

De twee laat gevonden invoegblokkades zijn verholpen met **Leiding/Differentieel vóór de selectie invoegen**. Daarmee staan de hoofdleiding vóór A en de afzonderlijke EV-differentieel na automaat B. Na volledig herladen bevestigt de opgeslagen UI opnieuw 33 en 31 plaatsbare objecten op de twee bladen. De bestaande takken en plaatsingen blijven behouden; de gecontroleerde ID-lijsten bevatten geen verdwenen objecten. Invoegen is één undo-stap en de bediening noemt het doel expliciet.

De eerste volledige concept-PDF `out/hertest/source-full-concept.pdf` is via de exportdialoog gedownload: vier A3-schema-, twee A4-situatie-, drie A3-kringenlijstpagina’s en één A3-bevindingenpagina. Versie: **ACA volledige UI-hertest (afwijkingen)**. De bestaande UI-limiet van 40 tekens is gerespecteerd. De bronklant/werf staan erin, de eigen organisatie blijft duidelijk TEST. Alle pagina’s zijn gerenderd; de visuele eindcontrole wordt hieronder geregistreerd.

### Resterende productverbeteringen en bronverschillen

1. **Aarding en teller op het situatieplan:** aardelektrode en aardingsonderbreker ontbreken als eigen onderdelen; de teller in het eendraadmodel is niet zelfstandig plaatsbaar. De oude achtergrondpixels dekken dit niet af.
2. **Technische annotaties:** 20 panelen, 10 kVA en 6 mA DC-detectie worden als omschrijving bewaard en verschijnen in de lijst, maar niet als eigen parameters/volledige annotaties bij de schemaglyph. Voor 50 Hz en teller 40 A ontbreken velden. Er is geen kVA-naar-W-conversie verzonnen.
3. **Referentie en onbekend symbool:** de PV-array krijgt S2, terwijl de bronarray geen eigen nummer toont. H3 gebruikt een generiek toestel met expliciete onzekerheidsomschrijving; de ronde driebladen-glyph is niet exact gereproduceerd.
4. **Schone ondergrond:** de importuitsneden behouden historische symbolen, waardoor oude en nieuwe tekens/labels overlappen. Een schoon bronplan blijft nodig voor een afgewerkt dossier; OCR of automatisch wissen hoort niet bij deze implementatie.
5. **Compactere afdruk:** de tekst blijft leesbaar, maar één A3-schema vervolgblad bevat vrijwel alleen de teller/voeding en een ander alleen kring E. Pagina’s beter vullen zonder tekst te verkleinen is de belangrijkste resterende printverbetering.
6. **Sneller oriënteren:** de toolbar draait in stappen van 15°. Voor 90° zijn zes acties nodig. Kwartslagen en draaien van meerdere geselecteerde objecten verdienen een vervolg. De vaste 10-klikkenplaatsproef omvatte bewust geen rotatie.

I3 (zolder) en de PV-array zijn ongeplaatst gelaten omdat de geselecteerde bron geen zolder-/daklocatie geeft. Er is geen geometrie verzonnen. De situatiebladen gebruiken “Passend op papier”; er is geen onbewezen bouwkundige schaal opgegeven. De app meldt beide ongeplaatste punten en exporteert als concept. Nul bevindingen uit beperkte automatische elektrische controles betekent geen AREI-conformiteit.

**Opleverbesluit:** de drie verbeterpakketten zijn geïmplementeerd en afzonderlijk gereviewd. De uitgebreide praktijkproef bewijst de bovenstaande invoer- en uitvoerfuncties. De strikte eindacceptatie van taak 10 — het volledige bronvoorbeeld exact overnemen — blijft **niet geslaagd** door de concrete bronverschillen hierboven. Dit zijn expliciete open productpunten, geen stilzwijgend geaccepteerde afwijkingen. Ook actuele AREI-conformiteit is niet vastgesteld.

### Definitieve softwareverificatie

Op integratiecommit `3773ac9` zijn `pnpm typecheck`, `pnpm test:parallel --maxWorkers=1` en `pnpm test:prestatie` uitgevoerd: **190 testbestanden / 3.632 tests geslaagd**, plus **5 prestatietests geslaagd**. De brede run duurde 552 seconden. De prestatietests draaiden afzonderlijk, zoals het bestaande `pnpm test`-script voorschrijft.

De geraakte browserdekking omvat **39 unieke geslaagde scenario’s over meerdere runs**: 21 editor/situatie/export, 12 gerelateerde abonnement-/lijst-/tekenroutes, vier symboolscenario’s en twee nieuwe invoegscenario’s. De eerste run bevatte failures; deze zijn niet als geslaagd meegeteld. De laatste twee invoegscenario’s zijn samen opnieuw uitgevoerd en geslaagd na een gerichte wachttijd voor de eerste Nuxt-editorinitialisatie (`418c9e9`). De trace toonde de laadpagina en nog lopende module-initialisatie bij de oude limiet van vijf seconden; selectie, mutatie, persistentie en undo/redo-asserties zijn behouden.

De onafhankelijke PDF-audit heeft alle tien pagina’s bekeken en wederzijdse vervolgverwijzingen, tabelkoppen, versielabel, voeding en paginanummering bevestigd. Zij vond nog te kleine aantallen bij meervoudige contactdozen: circa 2,0 mm in het schema en 0,585 mm op het situatieblad. Commit `6b96ec1` herstelt dit uitsluitend voor afdrukken: het aantal staat als eigen rechtopstaande ×N-annotatie buiten het symbool, met behoud van de opgeslagen geometrie en de editorweergave. De nieuwe echte UI-export **ACA hertest - leesbare aantallen**, `out/hertest/source-full-concept-fixed.pdf`, telt opnieuw tien pagina’s. Alle twaalf aantalteksten meten **2,498 mm** (vijf op p. 1, één op p. 3 en zes op p. 6). Alle eigen geëxtraheerde tekst is minimaal 2,49 mm; bronlabels in het raster vallen buiten die meting. De relevante bladen zijn op volle grootte opnieuw bekeken; het volledige contactblad en alle tien renders zijn bewaard. De onafhankelijke herreview accepteert de correctie. De oude PDF blijft als oorspronkelijke versie behouden.

De finale typecontrole na deze productwijziging slaagt. De aanvullende regressies controleren onder meer ×2/×12, horizontale samenstellingen, 0°/90°/180° en kleine/grote planschaal. De bredere render-/layoutcontrole bevestigt de functionele asserties; één oude verwachting `2×` is in `fbdb4a2` vervangen door de expliciete leesbare printannotatie `×2`, met een extra controle dat de editor zijn oorspronkelijke tekst behoudt. De laatste gerichte run op `fbdb4a2` slaagt: **20 bestanden / 317 render- en layouttests**, gevolgd door het vastgelegde resultaat **5/5 prestatietests geslaagd** (de prestatietests draaiden afzonderlijk vóór die functionele run).

Tijdens de tussencontrole overschreed één schema-snelheidsmeting 50 ms en een latere printmeting 200 ms. Een begrensde A–B–B–A-vergelijking met dezelfde 2.000-nodefixture en ongewijzigde 200 ms-grens gaf 116,959/126,349 ms voor de vorige versie en 115,533/115,981 ms voor de nieuwe. Alle vier controles slaagden; dit bewijst geen versnelling, maar gaf geen aanwijzing voor een blijvende regressie door de aantalcorrectie. De exacte oorzaak van de eerdere variatie is niet bewezen. De daaropvolgende volledige seriële prestatiereeks slaagde 5/5. Er zijn geen drempels versoepeld en geen productwijzigingen gedaan om een toevallige meting te maskeren.

De volledige logs en reviewrapporten worden lokaal bewaard onder `out/hertest/verification/`; de UI-bewijzen en PDF’s onder `out/hertest/`.


### Gemaakte integratiekeuzes

| Keuze | Gevolg als deze keuze moet worden herzien |
|---|---|
| Drie geïsoleerde werkpakketten parallel, daarna integratie | Extra samenvoegwerk en hertests. |
| Eén eigenaar voor schema/migraties, inclusief import- en printvelden | Gedeelde interfaces en migratie moeten samen worden aangepast. |
| Browsertests achtereenvolgens wegens gedeelde testpoort/database | Meer coördinatie; veilige parallelisatie vereist aparte omgevingen. |
| Gedeelde puntgroepen uitgebreid met contactdozen/toestellen en ontbrekende toestelsymbolen | Meer model-/symboolonderhoud en deskundige notatiecontrole. |
| Referentiebladen sluiten plaatsing en afdruk uit | Eerst omzetten naar een echt planblad om er punten op te plaatsen. |
| Runtime-migratie op database-, herstel- en revisieleesroutes; historische JSON/PDF behouden | Meer compatibiliteitspaden te onderhouden. |
| Ieder armatuur als afzonderlijk plaatsbaar onderdeel | Grotere documentbomen bij veel lampen. |
| Vier extra bronvarianten en expliciete keuze x/G; ontbrekend blijft oude G-weergave | Meer symbool-/modelvarianten en deskundige controle. |
| Deurbel/Monitor overgenomen zonder onbewezen intercom- of H3-identiteit | Onzekere bronbetekenissen blijven open. |
| Expliciet leiding/differentieel vóór de selectie invoegen | Extra structureel commando dat validatie en undo moet blijven respecteren. |
| Exacte bronacceptatie open houden bij ontbrekende objecten/gegevens | Aanvullend productwerk nodig voordat een exacte reconstructie kan worden geaccepteerd. |

**Definitieve lokale oplevering:** branch `users/s.beckers/elektricien-verbeteringen`, app op http://127.0.0.1:3200. De laatste proefexport is [source-full-concept-fixed.pdf](../../out/hertest/source-full-concept-fixed.pdf). De codewijzigingen en documentatie zijn lokaal gecommit. De strikte bronacceptatie en deskundige toetsing blijven open zoals hierboven beschreven.
