# Symbolen volgens het AREI en het symbolenvenster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elk symbool dat Elentrik tekent, volgt AREI tabel 2.23. In de editor kies je in een symbolenvenster elke variant en combinatie om te tekenen.

**Architecture:**
- **Symbolen:** de tekenfuncties in `packages/symbols` worden herschreven volgens de tabel. Hun signatuur en de `Symbool`-vorm blijven gelijk, dus schema, situatieschema en pdf volgen vanzelf.
- **Labels:** `beveiligingLabel` in `packages/layout` krijgt de AREI-notatie.
- **Model:** het model krijgt een `Voorinstelling` (de visuele velden van een punt). `voegOnderdeelToe` en `magToevoegen` leggen die over `STANDAARD`.
- **Editor:** de store onthoudt een voorinstelling per onderdeel. Een pure kaartenbron (`apps/web/app/editor/symbolen.ts`) voedt een nieuw `SymbolenVenster.vue` en de mini-symbolen in het onderdelenpaneel.

**Tech Stack:** TypeScript, Vitest, Nuxt 4 met Nuxt UI (UModal, USwitch, USelect), Pinia, @nuxtjs/i18n, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-elentrik-symbolen-arei-design.md` (goedgekeurd). Bron: AREI tabel 2.23, https://economie.fgov.be/sites/default/files/Files/Energy/Symboles-nl.pdf (blz. 40 tot 47). Elke symbooltaak legt de bouwer naast de pagina uit die pdf. Verwijs in code en commits alleen naar het AREI, nooit naar andere software.

## Global Constraints

- **Richting:** voeding van onder. `in` = `{ x: breedte/2, y: hoogte }`, `uit` = `{ x: breedte/2, y: 0 }`. De lijn loopt door naar `uit`.
- **Maat:** `breedte <= KOLOM_BREEDTE_MM - 4` (20 mm). Alles blijft binnen de maat (`buitenVak`), goedgevormd (`isGoedgevormd`), tekst rechtop (`nietRechtop`). Lijndikte `LIJNDIKTE_MM` en standaard tekstgrootte `TEKSTGROOTTE_MM` blijven.
- **Rollen:** bestaande `data-rol` blijven waar het element blijft. Nieuwe rollen staan per taak vermeld.
- **Teksten:** elke nieuwe UI-tekst komt in nl, fr en en (de pariteitstest `apps/web/test/vertalingen.test.ts` en `geen-hardgecodeerde-tekst.test.ts`), en volgt `docs/vertalingen.md`. In het Frans heet het AREI "RGIE".
- **Geen migratie:** het documentschema verandert niet. `SCHEMA_VERSIE` blijft.
- **Snapshots:** wijzig een snapshot alleen nadat je het verschil hebt nagekeken (`vitest run -u <bestand>`). Werk nooit alle snapshots blind bij.
- **Tests en e2e** raken nooit de echte database `elentrik` of `.data/bestanden`.
- **Commits:**
  - ondertekend (1Password);
  - eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - op de branch `symbolen-arei`, die vertrekt van `develop`.

## Review Focus

1. **De voorinstelling van een ander onderdeel lekt niet.** Een schakelaar-voorinstelling `{ soort: "wissel" }` mag een toestel nooit `soort: "wissel"` geven. → test in Task 8.
2. **Een ongeldige voorinstelling breekt de editor niet.** Bv. `soort: "x"` voor een lichtpunt: `magToevoegen` geeft `false` en de + verschijnt niet, er is geen crash. → test in Task 8.
3. **Alleen-lezen:**
   - de sneltoets `a` en de knop openen het venster;
   - "Kiezen en tekenen" is uitgeschakeld;
   - de voorinstelling verandert niet.

   → test in Task 10 (store) en Task 12 (e2e).
4. **Zoeken zonder resultaat** toont een melding in plaats van een lege witte vlakte. Zoeken werkt in de actieve taal (fr: "prise" vindt de contactdoos). → test in Task 9.
5. **Lange labels.** Een differentieel van 4 polen met 300 mA ("40/0,3A type A 4P") blijft leesbaar in de kolom: de kolom wordt breder, en er overlapt geen tekst. → test in Task 3.

---

### Task 1: Voeding en verdeling (aansluiting, teller, verdeelbord)

**Files:**
- Modify: `packages/symbols/src/voeding.ts`, `packages/symbols/src/leiding.ts`
- Create: `packages/symbols/test/voeding.test.ts`

**Interfaces:**
- Produces: `tekenAansluiting`, `tekenTeller`, `tekenVerdeelbord` (signaturen ongewijzigd).

- [ ] **Step 1: Schrijf de falende tests** in `voeding.test.ts`. Gebruik de helpers uit `test/hulp.ts`, net als `punten.test.ts`.
  - `aansluiting: sinus als pad, geen tekst`:
    - `svg` bevat geen `<text`;
    - bevat een `<path` met `data-rol="sinus"` en een `A`-opdracht;
    - de cirkel blijft.
  - `teller: band bovenaan`:
    - er is precies één `<line` met `data-rol="band"`;
    - die lijn is horizontaal, met y = de bovenrand van de rechthoek + 1,5 mm (± 0,5);
    - de tekst `kWh` staat onder die lijn.
  - `verdeelbord: gewone rechthoek`: `svg` bevat precies één `<rect` en geen `<line`.
  - Elk van de drie: `isGoedgevormd`, niet `buitenVak`, `breedte <= 20`.
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols/test/voeding.test.ts`. Verwacht: FAIL. Er is nog geen rol "sinus" of "band", en het verdeelbord heeft nog een lijn.
- [ ] **Step 3: Implementeer.**
  - **aansluiting:** de sinus is twee halve bogen (`A`) binnen de cirkel, met `data: { rol: "sinus" }`.
  - **teller:** de rechthoek en een band (`lijn` met rol "band").
  - **verdeelbord:** alleen `rechthoek(0, 0, breedte, hoogte)`.
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/layout packages/render`. Kijk elk snapshotverschil na en werk alleen de gewijzigde symbolen bij met `-u`. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): aansluiting, teller en verdeelbord volgens AREI tabel 2.23`.

### Task 2: Automaat en differentieel

**Files:**
- Modify: `packages/symbols/src/beveiliging.ts`
- Modify: `packages/symbols/test/beveiliging.test.ts` (en de snapshot)

**Interfaces:**
- Produces: `tekenAutomaat`, `tekenDifferentieel`, `tekenZekering` (signaturen ongewijzigd).

- [ ] **Step 1: Pas de tests aan.**
  - `automaat volgens AREI`, voor `polen` 1 tot 4:
    - geen element met `data-rol="pool"`;
    - geen kruisje (geen twee gekruiste korte lijnen; test op het ontbreken van `data-rol="kruis"` en op het aantal `<line`-elementen ≤ 3);
    - precies één gevuld element met `data-rol="blokje"`;
    - het blokje ligt links van `x = breedte/2`, tussen 50 % en 90 % van de hoogte gemeten vanaf `in`.
  - `automaat is gelijk voor elk aantal polen`: de `svg` van 1 en 4 polen is identiek.
  - `differentieel tekent hetzelfde contact als de automaat`:
    - `tekenDifferentieel(d).svg === tekenAutomaat(a).svg` bij dezelfde breedte, of anders bevat de differentieel exact de elementen van de automaat;
    - er is geen `<rect` en geen tekst "ΔI".
  - `zekering`: ongewijzigd (de bestaande test blijft).
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols/test/beveiliging.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer `schakelcontact(x)` zonder polen.**
  - lijn van `in` tot het scharnier;
  - schuin contact van het scharnier naar linksboven;
  - op het vrije uiteinde een gevuld blokje van ongeveer 0,8 × 0,8 mm, gedraaid langs het contact (`pad` met `gevuld: true`, rol "blokje");
  - een onderbreking;
  - de lijn van het vaste contact naar `uit`.

  De differentieel gebruikt hetzelfde contact en dezelfde breedte als de automaat (10 mm). Verwijder `POOL_*` en `KRUIS_*`.
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/layout packages/render`. Kijk de snapshots na en werk ze gericht bij. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): automaat en differentieel volgens AREI tabel 2.23`.

### Task 3: Labels van de beveiligingen

**Files:**
- Modify: `packages/layout/src/labels.ts:28-38`
- Modify: `packages/layout/test/labels.test.ts`, `packages/layout/test/kolommen.test.ts` (de verwachte breedtes en teksten)

**Interfaces:**
- Produces: `beveiligingLabel(node): string`, met de formaten hieronder; `ampereTekst(mA: number): string` (intern).

- [ ] **Step 1: Schrijf de falende tests** in `labels.test.ts`:
  ```ts
  expect(beveiligingLabel(automaat({ nominaal_A: 20, curve: "C", polen: 1 }))).toBe("C20");
  expect(beveiligingLabel(automaat({ nominaal_A: 16, curve: "B", polen: 2 }))).toBe("B16 2P");
  expect(beveiligingLabel(differentieel({ nominaal_A: 40, gevoeligheid_mA: 30, klasse: "A", polen: 2 }))).toBe("40/0,03A type A 2P");
  expect(beveiligingLabel(differentieel({ nominaal_A: 40, gevoeligheid_mA: 300, klasse: "A", polen: 4 }))).toBe("40/0,3A type A 4P");
  expect(beveiligingLabel(differentieel({ nominaal_A: 63, gevoeligheid_mA: 300, klasse: "AC", polen: 1 }))).toBe("63/0,3A type AC");
  expect(beveiligingLabel(zekering({ nominaal_A: 20 }))).toBe("20 A");
  ```
  Voeg in `kolommen.test.ts` een test toe (Review Focus 5). Een differentieel `40/0,3A type A 4P` in kolom 0 geeft een rechterbudget ≥ `tekstBreedte("40/0,3A type A 4P", 2)`, en geen enkele tekst overlapt met de tekst van kolom 1. Gebruik de bestaande overlaphulp of het rechterbudget.
- [ ] **Step 2:** Run `pnpm vitest run packages/layout/test/labels.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
  - automaat: `${curve}${nominaal_A}` plus `" ${polen}P"` als `polen > 1`;
  - differentieel: `${nominaal_A}/${ampereTekst(gevoeligheid_mA)}A type ${klasse}` plus hetzelfde poolachtervoegsel;
  - `ampereTekst`: mA / 1000, maximaal 3 decimalen, zonder overbodige nullen, met komma, zonder Intl (zoals `doorsnedeTekst`).

  Werk de commentaarregel bij met de nieuwe voorbeelden.
- [ ] **Step 4:** Werk de verwachte teksten en breedtes in `kolommen.test.ts` bij voor de nieuwe labels. Pas daar alleen getallen en teksten aan, geen logica. Daarna run je `pnpm vitest run packages/layout packages/render`. Verwacht: PASS. De kringenlijst volgt vanzelf.
- [ ] **Step 5:** Commit: `feat(layout): beveiligingslabels in de notatie van AREI tabel 2.23`.

### Task 4: Contactdoos

**Files:**
- Modify: `packages/symbols/src/punten.ts` (`tekenContactdoos`, plus een gedeelde helper `letterH(x, y)` voor waterdicht)
- Modify: `packages/symbols/test/punten.test.ts` (en de snapshot)

**Interfaces:**
- Produces: `tekenContactdoos` (signatuur ongewijzigd). De interne helper `letterH(x: number, y: number): string` geeft `tekst(..., "h", { rol: "waterdicht", grootte: 2.5 })`, met de basislijn op `y` en links op `x`; Task 6 hergebruikt hem.

- [ ] **Step 1: Pas de tests aan**, voor alle 8 combinaties (de bestaande lus `contactdozen`):
  - `de boog opent naar uit`: het `A`-pad van de boog heeft zijn uiteinden boven zijn top. De top ligt het dichtst bij `in`.
  - `randaarde raakt de bolle kant`:
    - een horizontale lijn met rol "randaarde" op de y van de top van de boog (± 0,2);
    - de lijn is breder dan de boog (lengte > 2r).
  - `kinderbescherming`: precies twee horizontale lijnen met rol "kinderbeveiliging". Elk begint aan een uiteinde van de boog en wijst naar buiten (de x weg van het midden).
  - `waterdicht is de letter h`: er is een `<text` met rol "waterdicht" en inhoud `h`, rechts van de boog, en er is geen gevuld pad.
  - `aantal`:
    - bij `aantal: 3` een lijn met rol "aantal-streep" en een tekst `3` met rol "aantal";
    - geen "×";
    - bij `aantal: 1` geen van beide.
  - De bestaande tests voor de maat en de goedgevormdheid blijven.
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols/test/punten.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer** volgens spec §3.5:
  - de boog heeft zijn bolle kant naar `in` en de lijn loopt door naar `uit`;
  - randaarde is een streep tegen de top;
  - kinderbescherming is twee voetjes;
  - waterdicht is `letterH`;
  - een aantal groter dan 1 is een klein schuin streepje over de boog met het getal ernaast.
  - Verwijder `waterdichtDriehoek` pas in Task 6, wanneer de schakelaar hem niet meer gebruikt.
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/render`. Kijk de snapshots na en werk ze gericht bij. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): contactdoos volgens AREI tabel 2.23`.

### Task 5: Lichtpunt

**Files:**
- Modify: `packages/symbols/src/punten.ts` (`tekenLichtpunt`)
- Modify: `packages/symbols/test/punten.test.ts`

**Interfaces:**
- Produces: `tekenLichtpunt` (signatuur ongewijzigd).

- [ ] **Step 1: Pas de tests aan.**
  - `standaard en zonder soort`: geen `<circle`. Wel twee diagonale lijnen met rol "kruis" die elkaar snijden op `x = breedte/2`. De verticale lijn van `in` naar `uit` gaat door dat snijpunt.
  - `led`: het kruis plus een tekst "LED".
  - `tl`:
    - geen kruis;
    - een horizontale lijn met rol "tl" die de leiding in het midden kruist;
    - aan beide uiteinden een kort verticaal streepje met rol "tl-einde".
  - `spot`:
    - een `<circle` met daarin een kruis (de ⊗);
    - een boog-pad met rol "projector" aan de kant van `in` (de y van het boogmidden ligt groter dan de cy van de cirkel).
  - `noodverlichting`: het kruis plus een gevulde `<circle` met rol "nood" in het snijpunt, en geen andere cirkel.
  - `aantal 3`: de tekst `3×` blijft, met rol "aantal".
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols/test/punten.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer** volgens spec §3.5 (Lichtpunt).
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/render`, werk de snapshots gericht bij. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): lichtpunt volgens AREI tabel 2.23`.

### Task 6: Schakelaar

**Files:**
- Modify: `packages/symbols/src/punten.ts` (`tekenSchakelaar`, plus de helper `haak(...)`; verwijder `waterdichtDriehoek`)
- Modify: `packages/symbols/test/punten.test.ts`

**Interfaces:**
- Consumes: `letterH` uit Task 4.
- Produces: `tekenSchakelaar` (signatuur ongewijzigd).

- [ ] **Step 1: Pas de tests aan**, met per soort het aantal elementen per rol:

  | soort | "hendel" | "haak" | extra |
  |---|---|---|---|
  | enkel | 1 (naar rechtsboven: eindpunt x > cx en y < cy) | 0 | |
  | dubbel | 2 (beide met eindpunt y < cy, één links en één rechts van cx) | 2 | |
  | wissel | 2 (één rechtsboven, één linksonder) | 2 | |
  | kruis | 4 (één per kwadrant) | 4 | |
  | dimmer | 1 | 0 | 1 pad met rol "vlag" op het uiteinde van de hendel |
  | drukknop | 0 | 0 | 2 `<circle` (concentrisch, de binnenste met een kleinere r), geen hendel |

  - Elke haak staat haaks op zijn hendel (het inproduct van de richtingen is ≈ 0) en begint op het uiteinde ervan.
  - `waterdicht`: een tekst `h` met rol "waterdicht", en geen gevuld pad.
  - `hendels raken de geleider niet`: geen enkele hendel heeft een punt binnen 0,3 mm van de verticale lijn `x = breedte/2`, behalve zijn beginpunt op de cirkel.
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols/test/punten.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer** volgens spec §3.5 (Schakelaar):
  - de hendels beginnen op de cirkelrand;
  - een tweede hendel aan dezelfde kant ligt minstens 30° van de verticale lijn;
  - `haak(x1, y1, x2, y2)` tekent een streepje van ongeveer 1 mm haaks op het uiteinde, naar buiten.

  De breedte mag groeien, tot maximaal 20 mm.
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/render`, werk de snapshots gericht bij. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): schakelaars volgens AREI tabel 2.23`.

### Task 7: Toestellen

**Files:**
- Modify: `packages/symbols/src/punten.ts` (`tekenToestel`; verwijder `TOESTEL_AFKORTINGEN`)
- Modify: `packages/symbols/src/index.ts` (de export van `TOESTEL_AFKORTINGEN` vervalt)
- Modify: `packages/symbols/test/alle-types.test.ts` (het blok `TOESTEL_AFKORTINGEN` vervalt), `packages/symbols/test/punten.test.ts`

**Interfaces:**
- Produces: `tekenToestel` (signatuur ongewijzigd). `TOESTEL_AFKORTINGEN` bestaat niet meer; niets buiten `packages/symbols` gebruikte het.

- [ ] **Step 1: Schrijf de falende tests**, één per soort (`ToestelsoortSchema.options`), op de pictogramelementen met rol `picto`:

  | soort | verwachting |
  |---|---|
  | andere | een vierkant, en geen element met rol "picto" |
  | wasmachine | 1 `<circle` niet gevuld en 1 gevulde `<circle` |
  | droogkast | 1 pad "∞" (twee bogen) en 1 gevulde `<circle` |
  | vaatwasser | 2 diagonale lijnen en 1 `<circle` |
  | kookplaat | precies 3 gevulde `<circle` |
  | oven | 1 band-lijn en 1 gevulde `<circle` |
  | boiler | geen `<rect`; 1 `<circle` met ≥ 3 verticale lijnen erbinnen |
  | laadpaal | ≥ 2 `<rect` (zuil en schermpje) en ≥ 1 lijn (kabel) |
  | omvormer | 1 diagonale lijn; 1 volle en 1 gestippelde horizontale lijn linksboven (`stroke-dasharray`); 1 sinuspad rechtsonder |
  | warmtepomp | een tekst "WP" |

  Geen enkele soort heeft nog een tekst behalve warmtepomp. Alle tien blijven binnen de maat en zijn goedgevormd.
- [ ] **Step 2:** Run `pnpm vitest run packages/symbols`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer** volgens spec §3.5 (Toestel).
  - Heeft `lijn` nog geen optie voor een stippellijn, voeg dan `streep?: string` toe aan de opties in `svg.ts`. Die geeft `stroke-dasharray`. Voeg ook een test toe in `svg.test.ts`.
  - Werk `alle-types.test.ts` bij.
- [ ] **Step 4:** Run `pnpm vitest run packages/symbols packages/render && pnpm typecheck`, werk de snapshots gericht bij. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(symbols): toestellen met de pictogrammen van AREI tabel 2.23`.

### Task 8: Voorinstelling in het model

**Files:**
- Modify: `packages/model/src/standaarden.ts` (type `Voorinstelling`, `VISUELE_VELDEN`)
- Modify: `packages/model/src/toevoegen.ts`, `packages/model/src/index.ts`
- Modify: `packages/model/test/toevoegen.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Voorinstelling = {
    aantal?: number;
    randaarde?: boolean;
    kinderbeveiliging?: boolean;
    waterdicht?: boolean;
    soort?: string;
  };
  /** Per onderdeel de sleutels die een voorinstelling mag zetten; andere onderdelen: geen. */
  export const VISUELE_VELDEN: Readonly<Partial<Record<Onderdeel, readonly (keyof Voorinstelling)[]>>>;
  // contactdoos: aantal, randaarde, kinderbeveiliging, waterdicht
  // lichtpunt: aantal, soort; schakelaar: soort, waterdicht; toestel: soort
  export function magToevoegen(doc, aanknoping, onderdeel: Onderdeel, voorinstelling?: Voorinstelling): boolean;
  export function voegOnderdeelToe(doc, aanknoping, onderdeel: Onderdeel, voorinstelling?: Voorinstelling): OperatieResultaat & { ids: NodeId[] };
  ```
  Het vierde argument `toestelsoort` vervalt; de enige aanroepers zijn de store en `SchemaCanvas.vue`, die in Task 10 meegaan.

- [ ] **Step 1: Schrijf de falende tests** in `toevoegen.test.ts`:
  - `voorinstelling wordt over STANDAARD gelegd`: een contactdoos met `{ randaarde: true, kinderbeveiliging: true, waterdicht: true, aantal: 2 }` geeft een node met die vier waarden.
  - `alleen visuele velden van het onderdeel` (Review Focus 1): een toestel met `{ soort: "boiler", waterdicht: true, randaarde: true }` krijgt `soort: "boiler"`, maar geen `waterdicht` of `randaarde`.
  - `een voorinstelling geldt niet voor beveiligingen`: een differentieel met `{ soort: "x" }` is gelijk aan `STANDAARD.differentieel`.
  - `ongeldige soort` (Review Focus 2): `magToevoegen(..., "lichtpunt", { soort: "x" })` is `false`, en `voegOnderdeelToe` gooit een `DocumentFout`.
  - `toestelsoort blijft werken`: `{ soort: "boiler" }` geeft een toestel met boiler. Pas de bestaande tests die een toestelsoort meegaven daarop aan.
- [ ] **Step 2:** Run `pnpm vitest run packages/model/test/toevoegen.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer.** `onderdeelInvoer(onderdeel, voorinstelling)` neemt `STANDAARD[onderdeel]` en kopieert daarop alleen de sleutels uit `VISUELE_VELDEN[onderdeel]` die in de voorinstelling staan. De bestaande schemacontrole in `voegToe` vangt ongeldige waarden. Controleer dat die een `DocumentFout` gooit. Zo niet, valideer dan in `maakPlan` met `NodeSchema` en gooi `ONGELDIG_SCHEMA`.
- [ ] **Step 4:** Run `pnpm vitest run packages/model && pnpm typecheck`. Verwacht: PASS. De typecheck faalt nog in `apps/web`; dat is Task 10.
- [ ] **Step 5:** Commit: `feat(model): voorinstelling voor nieuwe punten`.

### Task 9: De kaartenbron

**Files:**
- Create: `apps/web/app/editor/symbolen.ts`
- Create: `apps/web/test/symbolen.test.ts`

**Interfaces:**
- Consumes: `Voorinstelling`, `VISUELE_VELDEN`, `STANDAARD` en `NIEUWE_KRING_AUTOMAAT` uit `@elentrik/model` (exporteer wat nog niet geëxporteerd is), `NodeSchema`, `ToestelsoortSchema`.
- Produces:
  ```ts
  export type Categorie = "punten" | "leidingenEnBorden" | "beveiliging" | "voeding";
  export type AreiRubriek = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
  export type Kaart = {
    type: NodeType;
    onderdeel: Onderdeel | null;          // null = niet te kiezen
    waaromNiet?: "automatisch" | "altijd"; // automaat | aansluiting en teller
    categorie: Categorie;
    rubriek: AreiRubriek;
    /** Visuele velden met hun waarden, in de volgorde van het raster. `aantal` zit hier niet in. */
    velden: readonly { sleutel: "randaarde" | "kinderbeveiliging" | "waterdicht" | "soort"; waarden: readonly (boolean | string)[] }[];
    heeftAantal: boolean;
  };
  export const KAARTEN: readonly Kaart[];
  export function combinaties(kaart: Kaart): Voorinstelling[];           // cartesisch product van `velden`
  export function voorbeeldNode(kaart: Kaart, v: Voorinstelling): Node;  // geldige node voor tekenSymbool
  export function zoekKaarten(kaarten: readonly Kaart[], zoek: string, tekst: (k: Kaart) => string): Kaart[];
  ```
  `tekst` levert de vertaalde naam, uitleg en variantnamen van een kaart, zodat het zoeken de actieve taal volgt. Zoeken negeert hoofdletters en accenten. Een lege zoekterm geeft alle kaarten.

- [ ] **Step 1: Schrijf de falende tests:**
  - `elk nodetype heeft precies één kaart`: de types uit `KAARTEN`, gesorteerd, zijn gelijk aan `NodeSchema.options` (zoals in `alle-types.test.ts`).
  - `kiesbaar`: de onderdelen van de kaarten (zonder `null`), gesorteerd, zijn precies de acht `Onderdeel`-waarden. Voor automaat is `waaromNiet` "automatisch", voor aansluiting en teller "altijd".
  - `aantal combinaties`: contactdoos 8, lichtpunt 5, schakelaar 12, toestel 10, alle andere 1 (de lege voorinstelling).
  - `soorten komen uit het model`: de soortwaarden van lichtpunt, schakelaar en toestel zijn gelijk aan de enums in `NodeSchema` en `ToestelsoortSchema`.
  - `voorbeeldNode is geldig`: voor elke kaart en elke combinatie slaagt `NodeSchema.safeParse(voorbeeldNode(k, c))`.
  - `zoekKaarten` (Review Focus 4):
    - met een `tekst` die "Prise de courant" teruggeeft voor de contactdoos, vindt `"prise"` de contactdoos;
    - `"PRISE"` en `"prisé"` vinden haar ook;
    - `"xyz"` geeft `[]`;
    - `""` geeft alle kaarten.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/test/symbolen.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer**, puur, zonder Vue of Nuxt, en met expliciete imports, zoals `velden.ts`.
  - **Categorieën:** punten = contactdoos, lichtpunt, schakelaar, toestel; leidingenEnBorden = leiding, verdeelbord (onderdeel "onderbord"); beveiliging = differentieel, zekering, automaat; voeding = aansluiting, teller.
  - **Rubrieken:** contactdoos F, lichtpunt G, schakelaar E, toestel G, leiding C, verdeelbord B, beveiligingen D, aansluiting A, teller G.
  - **Lichtpunt:** de waarde `"standaard"` staat voor "geen soort".
- [ ] **Step 4:** Run de test. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(web): kaartenbron voor het symbolenvenster`.

### Task 10: Store: voorinstelling per onderdeel

**Files:**
- Modify: `apps/web/app/stores/editor.ts`, `apps/web/app/components/editor/SchemaCanvas.vue:208` (`magToevoegen`-aanroep)
- Modify: `apps/web/test/editor-store.test.ts`

**Interfaces:**
- Consumes: `Voorinstelling`, `magToevoegen` en `voegOnderdeelToe` (Task 8).
- Produces (op de store):
  ```ts
  voorinstellingen: Ref<Partial<Record<Onderdeel, Voorinstelling>>>; // begin: { toestel: { soort: "wasmachine" } }
  voorinstelling: ComputedRef<Voorinstelling>;            // die van `onderdeel`, of {}
  toestelsoort: WritableComputedRef<Toestelsoort>;        // leest en schrijft voorinstellingen.toestel.soort
  kiesVariant(onderdeel: Onderdeel, v: Voorinstelling): void; // zet beide; doet niets in alleen-lezen
  zetStandaard(onderdeel: Onderdeel): void;                // terug naar de beginwaarde
  symbolenOpen: Ref<boolean>;
  ```
  `voegToe` en `voegToeBijSelectie` geven `voorinstelling.value` door. `laad` raakt de voorinstellingen niet aan: ze blijven zolang de editor open is.

- [ ] **Step 1: Schrijf de falende tests:**
  - `kiesVariant zet onderdeel en voorinstelling, en toevoegen gebruikt ze`: na `kiesVariant("contactdoos", { waterdicht: true })` en `voegToe(aanknoping)` heeft de nieuwe node `waterdicht: true`.
  - `de voorinstelling blijft per onderdeel`: kies `schakelaar` met wissel, dan `store.onderdeel = "contactdoos"`, dan `store.onderdeel = "schakelaar"`. `voorinstelling.value` is nog `{ soort: "wissel" }`.
  - `zetStandaard`: na `zetStandaard("toestel")` is `toestelsoort` "wasmachine". Na `zetStandaard("schakelaar")` is de voorinstelling `{}`.
  - `toestelsoort blijft bruikbaar`: de bestaande verwachting (`"wasmachine"`) blijft; `store.toestelsoort = "boiler"` geeft `voorinstellingen.toestel.soort === "boiler"`.
  - `alleen-lezen` (Review Focus 3): na `zetAlleenLezen(true)` verandert `kiesVariant` niets, en kan `symbolenOpen` wel `true` worden.
- [ ] **Step 2:** Run `pnpm vitest run apps/web/test/editor-store.test.ts`. Verwacht: FAIL.
- [ ] **Step 3: Implementeer** in de store, en geef in `SchemaCanvas.vue` `store.voorinstelling` door in plaats van `store.toestelsoort`.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck`. Verwacht: PASS.
- [ ] **Step 5:** Commit: `feat(web): voorinstelling per onderdeel in de editor`.

### Task 11: SymboolVoorbeeld, SymbolenVenster en het onderdelenpaneel

**Files:**
- Create: `apps/web/app/components/editor/SymboolVoorbeeld.vue`, `apps/web/app/components/editor/SymbolenVenster.vue`
- Modify:
  - `apps/web/app/components/editor/OnderdelenPaneel.vue`
  - `apps/web/app/pages/projecten/[id].vue` (`<SymbolenVenster />` mounten)
  - `apps/web/app/composables/sneltoetsen.ts`
  - `apps/web/app/components/editor/SchemaCanvas.vue` (de actie "symbolen")
- Modify: `apps/web/i18n/locales/nl.json`, `fr.json`, `en.json`
- Modify: `apps/web/test/sneltoetsen.test.ts`

**Interfaces:**
- Consumes: `KAARTEN`, `combinaties`, `voorbeeldNode`, `zoekKaarten` (Task 9); de store (Task 10); `tekenSymbool` uit `@elentrik/symbols`.
- Produces:
  - `SymboolVoorbeeld.vue`, met props `{ node: Node; schaal?: number }` (px per mm, standaard 4). Het rendert `<svg viewBox="0 0 b h" :width :height>` met `v-html` van `tekenSymbool(node).svg`, `fill="none"`, `stroke="currentColor"` en `stroke-width` `LIJNDIKTE_MM`, met `aria-hidden="true"`. De `svg` is door `escapeXml` veilig, net als het schema.
  - `Actie` krijgt `{ soort: "symbolen" }`. De toets `a` (zonder modifier, niet in een invoerveld) geeft die actie, ook in alleen-lezen.
  - De vertaalsleutels (nl hieronder; fr en en volgen dezelfde structuur):
    ```
    editor.symbolen.openen        "Alle symbolen"
    editor.symbolen.titel         "Symbolen"
    editor.symbolen.zoeken        "Zoek een symbool…"
    editor.symbolen.geenResultaten "Geen symbool gevonden voor \"{zoek}\"."
    editor.symbolen.kiezen        "Kiezen en tekenen"
    editor.symbolen.standaard     "Standaard"
    editor.symbolen.combinaties   "Alle combinaties"
    editor.symbolen.arei          "AREI tabel 2.23, {rubriek}"          (fr: "RGIE tableau 2.23, {rubriek}")
    editor.symbolen.rubrieken.A…H  "A. Algemeenheden", "B. Elektrische toestellen", "C. Elektrische leidingen",
                                   "D. Beschermingstoestellen", "E. Schakelaars", "F. Contactdozen",
                                   "G. Gebruikstoestellen", "H. Bronnen"
    editor.symbolen.categorieen.{punten,leidingenEnBorden,beveiliging,voeding}
    editor.symbolen.waaromNiet.automatisch "Komt automatisch met een nieuwe kring."
    editor.symbolen.waaromNiet.altijd      "Staat in elk schema."
    editor.symbolen.uitleg.<nodetype>      één zin per nodetype (11)
    ```
    De naam van een kaart is `editor.types.<nodetype>` (die bestaat voor alle 11 types). Variantnamen komen uit `velden.<sleutel>.label` en `velden.soort.opties.<waarde>`.

- [ ] **Step 1: Schrijf de falende sneltoetstest:**
  - `sneltoets({ key: "a", ... })` geeft `{ soort: "symbolen" }`;
  - met `alleenLezen: true` ook;
  - met `doelIsInvoer: true` `null`;
  - met `ctrlKey: true` `null`.
- [ ] **Step 2:** Run de sneltoetstest. Verwacht: FAIL.
- [ ] **Step 3: Implementeer de sneltoets** en de actie in `SchemaCanvas.vue` (`store.symbolenOpen = true`). Run de test. Verwacht: PASS.
- [ ] **Step 4: Implementeer `SymbolenVenster.vue`** volgens spec §4.2: een `UModal` met `v-model:open="store.symbolenOpen"` en `fullscreen` of een brede inhoud.
  - **Links:** het zoekveld (`data-testid="symbolen-zoeken"`) en de kaarten per categorie. Elke kaart is een knop (`data-testid="symbolenkaart-<type>"`) met `SymboolVoorbeeld`, de naam, de uitleg en `editor.symbolen.arei`. Is er geen resultaat, dan toont het venster `geenResultaten`.
  - **Rechts:** de geopende kaart, met:
    - een groot voorbeeld;
    - per veld een `USwitch` (ja of nee) of een `USelect` (soort);
    - een `UInputNumber` voor het aantal als `heeftAantal`;
    - het raster `combinaties(kaart)`: elke combinatie is een knop met `SymboolVoorbeeld` en een korte naam, `data-testid="combinatie-<index>"`, `aria-pressed` als die overeenkomt met de bediening, en een dubbelklik kiest meteen;
    - de knop "Kiezen en tekenen" (`data-testid="symbolen-kiezen"`), uitgeschakeld als `store.alleenLezen` of `kaart.onderdeel === null`. Hij roept `store.kiesVariant` op en sluit het venster.
  - Bovenaan in de body staat `<AlleenLezenMelding />`, zoals in de andere dialogen sinds plan 12.

  De bediening begint bij openen op de huidige voorinstelling van dat onderdeel.
- [ ] **Step 5: Pas `OnderdelenPaneel.vue` aan.**
  - Elke knop krijgt links een `SymboolVoorbeeld` (schaal 2) van `voorbeeldNode` met de voorinstelling van dat onderdeel.
  - Wijkt de voorinstelling af van de beginwaarde, dan toont de knop eronder een korte tekst (de namen van de aan-velden of de soort) en een kleine knop `editor.symbolen.standaard` die `zetStandaard` oproept.
  - Onder de lijst staat een knop `editor.symbolen.openen` (`data-testid="symbolen-openen"`) met `<UKbd value="A" />`.
- [ ] **Step 6: Voeg de teksten toe** in nl, fr en en. Run `pnpm vitest run apps/web/test/vertalingen.test.ts apps/web/test/geen-hardgecodeerde-tekst.test.ts && pnpm typecheck`. Verwacht: PASS.
- [ ] **Step 7:** Commit: `feat(web): symbolenvenster met alle varianten en combinaties`.

### Task 12: E2e en visuele controle

**Files:**
- Create: `apps/web/e2e/symbolen.spec.ts`

**Interfaces:**
- Consumes: de testids uit Task 11; `gebruikTestgebruiker` uit `e2e/hulp/inloggen.ts`. Die registreert het spoor en wist in `afterAll` met `ruimOp` alles van de testgebruiker, zoals in `editor.spec.ts`. Een spec die meer aanmaakt dan projecten van die gebruiker, voegt dat toe aan het teruggegeven `spoor`.

- [ ] **Step 1: Schrijf de e2e-tests:**
  - `combinatie kiezen en tekenen`:
    1. nieuw project;
    2. open via `symbolen-openen`;
    3. kaart `symbolenkaart-contactdoos`;
    4. klik op de combinatie "randaarde + kinderbescherming, niet waterdicht";
    5. `symbolen-kiezen`;
    6. het venster is dicht;
    7. voeg toe met de + op een kring-einde;
    8. via `/api/projecten/:id` heeft de nieuwe contactdoos `randaarde: true`, `kinderbeveiliging: true` en `waterdicht: false`.
  - `sneltoets a opent het venster`, en Escape sluit het.
  - `zoeken`: "wissel" toont de schakelaar; "xyz" toont de melding.
  - `alleen-lezen` (Review Focus 3): zet een project alleen-lezen met de bestaande aanpak uit `e2e/abonnement.spec.ts` (een organisatie zonder abonnement). Daar opent het venster wel, maar `symbolen-kiezen` is uitgeschakeld.
- [ ] **Step 2:** Run `cd apps/web && npx playwright test e2e/symbolen.spec.ts`. Verwacht: PASS. Run daarna de volledige suite `npx playwright test`. Bestaande e2e die op symboolvormen of labels ("16 A B", "300 mA A") steunen, pas je aan de nieuwe labels aan.
- [ ] **Step 3: Visuele controle door de gebruiker** (spec §5).
  1. Maak in de dev-app (`preview_start`) schermafdrukken van het venster, één per categorie, en van elke geopende puntkaart met het raster.
  2. Maak een A4-pdf-export van een schema met alle types, en één situatieschema met een contactdoos, een schakelaar en een lichtpunt.
  3. Leg ze aan de gebruiker voor naast de pagina's 40 tot 47 van de AREI-pdf.
  4. Wacht op de goedkeuring voordat je de PR opent. Verwerk eventuele opmerkingen als extra commits.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck && (cd apps/web && npx playwright test)`. Verwacht: PASS.
- [ ] **Step 5:** Commit: `test(web): e2e voor het symbolenvenster`. Open daarna een draft-PR naar `develop`.
