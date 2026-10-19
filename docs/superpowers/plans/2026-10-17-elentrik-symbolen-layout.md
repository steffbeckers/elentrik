# Elentrik plan 2: symbolen, layout en SVG van het eendraadschema

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** een eendraadschema van een `InstallatieDocument` automatisch opmaken en als SVG uitvoeren, verdeeld over A4- of A3-pagina's.

**Architecture:** er komen drie nieuwe pure TypeScript-pakketten, zonder I/O en zonder DOM.
- `@elentrik/symbols`: per node een parametrisch symbool, als SVG-fragment met een vaste maat en vaste aansluitpunten.
- `@elentrik/layout`: rekent de boom om naar een "strook" met absolute posities in mm, en verdeelt die strook over pagina's.
- `@elentrik/render`: zet de opmaak om naar een SVG-string. Dat is het schermdeel van spec §3; de print-HTML volgt in een later plan.

**Tech Stack:** zoals in plan 1 (Node 24, pnpm 12, TypeScript 7, Vitest 5). Daarnaast `fast-xml-parser` als devDependency, alleen in tests, om te controleren dat de SVG goedgevormde XML is, en `tsx` voor het voorbeeldscript.

**Spec:** `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md`, §3 (pakketten), §6.2 (eendraadschema: "de positie van symbolen wordt niet vrij gekozen", `layout.opmaak(doc, analyse, papier)`), §6.5 (symbolen), §7 punt 3 (paginering "per groep van kringen") en §10 stap 3.

## Ontwerpbeslissingen (de spec laat dit open)

1. **Eenheden:** alles is in millimeter op papier. Er wordt getekend op schaal 1:1, en de renderer schaalt alleen voor de paginering.
2. **Kolomraster:** elk symbool staat gecentreerd op een verticale kolomlijn.
   - Een bladkolom is minstens 24 mm breed (`KOLOM_BREEDTE_MM = 24`), adaptief.
   - De breedte volgt wat erin staat. Links van de kolomlijn reikt het verste symbool of de verste tekst (anker `end` of `middle`), plus 1 mm. Rechts reikt het verste symbool of de verste tekst (anker `start`). Elke kant is minstens 12 mm. Een tekst is geschat `tekens × grootte × 0,6` breed (`tekstBreedte`).
   - Een subboom is zo breed als de som van zijn bladkolommen. `Strook.kolomGrenzen` geeft de linkerrand van elke bladkolom, gevolgd door de strookbreedte.
   - Een node met één kind staat in dezelfde kolom als dat kind. Zo ontstaan rechte verticale lijnen.
   - Een node met meerdere kinderen staat in de kolom van zijn eerste kind.
   - Een `verdeelbord` wordt getekend als horizontale rail van de eerste tot de laatste kindkolom. Andere nodes met meerdere kinderen krijgen een korte horizontale verbinding.
3. **Verticale opbouw:** het schema groeit naar boven. De root `aansluiting` staat onderaan (de grootste y), elk kind staat boven zijn ouder.
   - De opmaak wordt eerst berekend als afstand `d` vanaf de voeding en daarna omgezet naar `y = hoogte − d`. Er geldt `d(kind) = d(ouder) + hoogte(ouder) + VERTICALE_AFSTAND_MM`, met `VERTICALE_AFSTAND_MM = 4`.
   - Boven een rail komt een extra `RAIL_AFSTAND_MM = 6`. De rail ligt boven de vertakkende node, de kinderen erboven.
   - Een verbinding loopt van `uit` van de ouder (bovenkant) omhoog naar `in` van het kind (onderkant). Het kringlabel staat tussen de rail en de beveiliging.
   - Tekst blijft rechtop. Bij het omzetten blijft de glyph (ca. 0,7 × grootte hoog) gespiegeld op dezelfde plek, dus de basislijn wordt `hoogte − d + 0,7 × grootte`.
4. **Paginering:**
   - Eerst wordt de hele strook opgemaakt.
   - Als de strook hoger is dan de bruikbare hoogte, krijgen alle pagina's dezelfde `schaal = bruikbaar / strookhoogte`, met een minimum van `MIN_SCHAAL = 0.5`. Onder dat minimum volgt de waarschuwing `SCHEMA_TE_HOOG`, en blijft de schaal 0.5.
   - Daarna wordt de strook horizontaal geknipt op kolomgrenzen tussen kringen, met de bruikbare breedte gedeeld door de schaal.
   - Rails die over een knip lopen, worden afgebroken en krijgen een `vervolg`-markering met het paginanummer.
   - Is een enkele kring breder dan een pagina, dan wordt toch geknipt, met de waarschuwing `KRING_TE_BREED`. Die knip valt op de verste kolomgrens binnen de kring die nog past, zodat geen symbool doormidden gaat en geen lege pagina ontstaat. Alleen een enkele kolom breder dan een pagina wordt op de volle paginabreedte geknipt.
5. **Papier:** liggend.
   - A4 is 297 × 210 mm, A3 is 420 × 297 mm.
   - `marge_mm = 10`.
   - Onderaan wordt `cartoucheHoogte_mm = 30` vrijgehouden voor de cartouche van het PDF-plan.
6. **Symbolen** zijn eigen ontwerp in een IEC 60617-achtige stijl. Er wordt niets overgenomen van andere software.
   - `stroke="currentColor"`, lijndikte 0,35 mm.
   - Tekst in `font-family="sans-serif"`.
   - Labels staan buiten het symboolkader en worden door de layout geplaatst.
7. **Veiligheid:** alle tekst uit het document (labels, kabeltype, namen) wordt **altijd** geëscaped in `render`. `symbols` geeft alleen SVG van vaste vormen terug, met numerieke attributen en korte vaste teksten.
8. **Determinisme:** getallen in de SVG worden afgerond tot maximaal 2 decimalen, zonder afsluitende nullen, met "-0" als "0". Elementen staan in pre-order. Zo blijven snapshottests stabiel.

## Global Constraints

- **Eigen ontwikkeling:** geen code, symbolen, teksten of vertalingen van andere software overnemen.
- **Geen I/O in `packages/*/src`:** geen `node:`-imports, geen `fs`, geen `fetch`, geen Vue of Nuxt. Testbestanden en `scripts/` mogen wel `node:`-modules gebruiken.
- **Afhankelijkheden in één richting:** `model` ← `arei`; `model` ← `symbols`; `model`, `arei`, `symbols` ← `layout`; `symbols`, `layout` ← `render`. Een pakket importeert nooit "naar boven".
- **Modules:** ESM, TypeScript `strict` en `noUncheckedIndexedAccess`. `exports` wijst naar `./src/index.ts`, zonder build.
- **Namen:** domeinnamen in het Nederlands. Bestaande namen uit `@elentrik/model` en `@elentrik/arei` worden ongewijzigd gebruikt.
- **Iteratief:** alle doorlopingen van de boom zijn iteratief, met een expliciete stapel en zonder recursie. Ketens van duizenden punten zijn normaal.
- **Tests:** imports expliciet uit `vitest`. `structuredClone` is niet getypt, dus gebruik `kloon` uit de testhulp van het eigen pakket.
- **Commits:**
  - Conventional Commits, eindigend op `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - ondertekend via 1Password: nooit `--no-gpg-sign`;
  - mislukt de ondertekening, dan stoppen en het melden.

## Review Focus

1. **Tekst van de gebruiker in de SVG**, bv. een onderbordnaam `<script>` of `"&'`: die wordt geëscaped, zodat de SVG veilig in de DOM kan (geen XSS) en goedgevormd blijft. → Task 2 en Task 8.
2. **Diepe ketens** (5.000 punten onder één leiding): geen stack overflow in `opmaak` of `render`, en lineaire tijd. → Task 5 en Task 9.
3. **Een kring breder dan een pagina, of een schema hoger dan een pagina:** niets wordt stil afgeknipt. De pagina's bevatten samen elk element precies één keer en geven een waarschuwing. → Task 7.
4. **Een document met alleen een aansluiting en teller, of met punten zonder kring:** die worden toch getekend en geven geen crash. → Task 5.
5. **Leidingen met doorsnede 0 of een leeg kabeltype:** het label toont "?" in plaats van "0 mm²" of een lege string. → Task 6.

---

### Task 1: Pakketskeletten en een strengere I/O-controle

**Files:**
- Create: `packages/symbols/{package.json,tsconfig.json,src/index.ts}`, `packages/layout/{package.json,tsconfig.json,src/index.ts}`, `packages/render/{package.json,tsconfig.json,src/index.ts}`
- Modify: `.gitignore`, `test/geen-io.test.ts`
- Test: `packages/render/test/workspace.test.ts`, `test/geen-io.test.ts`

**Interfaces:**
- Produces: de pakketten `@elentrik/symbols` (afhankelijk van model), `@elentrik/layout` (afhankelijk van model, arei en symbols) en `@elentrik/render` (afhankelijk van symbols en layout). Ze volgen dezelfde vorm als `packages/arei`: `type: module`, `exports` naar `./src/index.ts`, script `typecheck`, `engines.node >=24`, en een `tsconfig` die `../../tsconfig.base.json` uitbreidt met include `["src", "test"]`. Elk `src/index.ts` exporteert voorlopig `export const PAKKET = "<naam>"`.

**Wijzigingen:**
- **`.gitignore`:** voeg `.claude/worktrees/` en `out/` toe.
- **`test/geen-io.test.ts`:** maak de controle strenger. Dit lost drie uitgestelde minors uit plan 1 op.
  - De regex moet ook vangen:
    - `import "node:x"`;
    - `import("node:x")`;
    - `from "fs"` en `from "fs/promises"`;
    - `require(`;
    - `fetch(`;
    - `from "vue"` en `from "nuxt"`.
  - Pakketten zonder `src/` worden overgeslagen in plaats van te crashen.
  - Gescand worden `.ts`, `.tsx`, `.mts` en `.vue`.
  - De regex wordt getest met een tabel van positieve en negatieve strings in hetzelfde bestand.

- [ ] **Step 1: Schrijf de falende tests.**
  - `packages/render/test/workspace.test.ts` importeert `PAKKET` uit `@elentrik/render`, `@elentrik/layout` en `@elentrik/symbols`, en verwacht de drie namen.
  - Een regex-tabeltest:
    - `'import "node:fs"'`, `'await import("node:path")'`, `'from "fs"'` en `'from "vue"'` matchen;
    - `'from "./fs-hulp"'` en `'const fetcher = 1'` matchen niet.
- [ ] **Step 2: Draai `pnpm install && pnpm test`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de skeletten en de strengere controle.
- [ ] **Step 4: Draai `pnpm test && pnpm typecheck`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `chore: pakketten symbols, layout en render; strengere io-controle`

---

### Task 2: SVG-basis voor symbolen

**Files:**
- Create: `packages/symbols/src/svg.ts`, `packages/symbols/src/types.ts`, `packages/symbols/test/hulp.ts` (`kloon`)
- Modify: `packages/symbols/src/index.ts`
- Test: `packages/symbols/test/svg.test.ts`

**Interfaces:**
- Produces:
  - `type Punt = { x: number; y: number }`
  - `type SymboolMaat = { breedte: number; hoogte: number; in: Punt; uit: Punt }`, in mm. `in` is het aansluitpunt onderaan en `uit` het aansluitpunt bovenaan. Beide liggen op `x = breedte / 2`.
  - `type Symbool = { maat: SymboolMaat; svg: string }`: `svg` is de inhoud van een `<g>` in lokale coördinaten, met (0,0) linksboven.
  - `LIJNDIKTE_MM = 0.35`, `TEKSTGROOTTE_MM = 2.5`, `KOLOM_BREEDTE_MM = 24`. `KOLOM_BREEDTE_MM` staat hier, omdat symbols moet garanderen dat `breedte <= KOLOM_BREEDTE_MM - 4`.
  - `getal(n: number): string`: maximaal 2 decimalen, zonder afsluitende nullen, `-0` wordt `"0"`, en `NaN` of `Infinity` gooit een `RangeError`.
  - `escapeXml(tekst: string): string`: escapet `&`, `<`, `>`, `"` en `'`.
  - Builders die een string teruggeven, met attributen in een vaste volgorde:
    - `lijn(x1, y1, x2, y2)`
    - `cirkel(cx, cy, r, opties?: { gevuld?: boolean })`
    - `rechthoek(x, y, b, h)`
    - `pad(d: string)`
    - `tekst(x, y, inhoud: string, opties?: { grootte?: number; anker?: "start" | "middle" | "end" })`, waarbij `tekst` de inhoud zelf escapet.
  - Lijnen krijgen `stroke="currentColor" stroke-width="0.35" fill="none"`. `gevuld` geeft `fill="currentColor"`.

- [ ] **Step 1: Schrijf de falende tests.**
  - `getal`: 1 → "1", 1.5 → "1.5", 1.234 → "1.23", 2.005 → "2.01" (gebruik `Math.round(n * 100) / 100` met epsilon-correctie, en documenteer de keuze), -0 → "0", en `NaN` gooit een fout.
  - `escapeXml('<a href="x">&\'</a>')` geeft `&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;`.
  - `lijn(0, 0, 1.5, 2)` is precies `<line x1="0" y1="0" x2="1.5" y2="2" stroke="currentColor" stroke-width="0.35" fill="none"/>`.
  - `tekst(0, 0, "<b>")` bevat `&lt;b&gt;`.
- [ ] **Step 2: Draai `pnpm vitest run packages/symbols/test/svg.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(symbols): svg-basis met afronding en escaping`

---

### Task 3: Symbolen voor voeding en beveiliging

**Files:**
- Create: `packages/symbols/src/voeding.ts`, `packages/symbols/src/beveiliging.ts`, `packages/symbols/src/teken.ts`
- Modify: `packages/symbols/src/index.ts`
- Test: `packages/symbols/test/beveiliging.test.ts`

**Interfaces:**
- Consumes: `NodeVan` en `Node` uit `@elentrik/model`, en de builders uit Task 2.
- Produces:
  - `tekenSymbool(node: Node): Symbool` in `teken.ts`. Het is een uitputtende `switch` op `node.type`, met een `never`-controle. In deze task dekt hij `aansluiting`, `teller`, `differentieel`, `automaat` en `zekering`. De andere types gooien tijdelijk `Error("NOG_NIET")`; Task 4 vult ze aan.
  - Per type een functie, bv. `tekenAutomaat(node: NodeVan<"automaat">): Symbool`.

**Symbolen** (eigen ontwerp, maten in mm, breedte ≤ 20):
- `aansluiting`: een korte verticale lijn met een cirkel van r = 2 bovenaan en de tekst "~" erin. 10 × 8.
- `teller`: een rechthoek van 10 × 12 met de tekst "kWh". 10 × 12.
- `automaat`: een schakelaarsymbool met een schuine contactlijn en een kruisje op het vaste contact. Per pool een korte schuine streep over de verticale lijn: 1 tot 4 streepjes volgens `polen`. 10 × 14. Het label (nominaal en curve) plaatst de layout.
- `differentieel`: hetzelfde contact als de automaat, plus een kleine rechthoek naast het contact met de tekst "ΔI", plus de poolstreepjes. 14 × 14.
- `zekering`: een rechthoek van 4 × 10 met een verticale lijn door het midden. 8 × 14.
- Voor alle symbolen geldt: `in = { x: breedte / 2, y: 0 }` en `uit = { x: breedte / 2, y: hoogte }`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een snapshot (`toMatchSnapshot`) per variant: een automaat met 1, 2, 3 en 4 polen, een differentieel met 2 en 4 polen, en een zekering, teller en aansluiting.
  - Per symbool de invarianten:
    - `breedte > 0` en `hoogte > 0`;
    - `breedte <= KOLOM_BREEDTE_MM - 4`;
    - `in.x === uit.x === breedte / 2`;
    - `in.y === 0` en `uit.y === hoogte`.
  - Bij een automaat met 4 polen bevat de svg precies 4 poolstreepjes: tel ze via een `data-rol="pool"`-attribuut op die lijnen.
  - Elk fragment, gewikkeld in `<svg xmlns="http://www.w3.org/2000/svg">…</svg>`, is goedgevormde XML volgens `XMLValidator.validate` van `fast-xml-parser` (devDependency in `packages/symbols`).
- [ ] **Step 2: Draai `pnpm vitest run packages/symbols/test/beveiliging.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS. Bekijk de snapshotbestanden, want die worden mee gecommit.
- [ ] **Step 5: Commit:** `feat(symbols): voeding en beveiligingen`

---

### Task 4: Symbolen voor punten, leiding en onderbord

**Files:**
- Create: `packages/symbols/src/punten.ts`, `packages/symbols/src/leiding.ts`
- Modify: `packages/symbols/src/teken.ts`, `packages/symbols/src/index.ts`
- Test: `packages/symbols/test/punten.test.ts`, `packages/symbols/test/alle-types.test.ts`

**Interfaces:**
- Produces: `tekenSymbool` dekt nu alle 11 node-types. `Error("NOG_NIET")` verdwijnt.
  - `TOESTEL_AFKORTINGEN: Readonly<Record<Toestelsoort, string>>`:
    - wasmachine "WM", droogkast "DK", vaatwasser "VW";
    - kookplaat "KP", oven "OV", boiler "B";
    - warmtepomp "WP", laadpaal "LP", omvormer "OMV", andere "T".

**Symbolen** (eigen ontwerp):
- `contactdoos`: een halve cirkel (r = 3) met de open kant naar boven, en een verticale lijn naar het aansluitpunt.
  - `randaarde`: een horizontale lijn boven de boog.
  - `kinderbeveiliging`: twee korte schuine streepjes in de boog.
  - `waterdicht`: een kleine gevulde driehoek rechtsboven.
  - `aantal > 1`: de tekst `${aantal}×` links naast de boog.
  - Maat 14 × 10.
- `lichtpunt`: een cirkel (r = 3) met een kruis erin.
  - `soort`: "led" geeft de tekst "LED" eronder, "tl" geeft een korte balk eronder, "spot" een kleine driehoek, en "noodverlichting" een gevulde stip in het midden.
  - `aantal > 1`: `${aantal}×` links.
  - Maat 14 × 10.
- `schakelaar`: een cirkel (r = 2) met een schuine lijn naar rechtsboven.
  - "dubbel" krijgt een tweede schuine lijn, "wissel" een lijn in beide richtingen, "kruis" een kruisvorm, "dimmer" een pijltje, en "drukknop" een kort horizontaal streepje bovenaan.
  - `waterdicht`: de driehoek zoals bij de contactdoos.
  - Maat 12 × 10.
- `toestel`: een vierkant van 10 × 10 met de afkorting uit `TOESTEL_AFKORTINGEN` erin. Maat 12 × 12.
- `leiding`: alleen een verticale lijn over de volle hoogte (maat 2 × 12). Het label plaatst de layout.
- `verdeelbord`: een rechthoek van 12 × 6 met een horizontale lijn onderaan. Maat 12 × 6. De rail tekent de layout.

- [ ] **Step 1: Schrijf de falende tests.**
  - Snapshots per variant:
    - een contactdoos met alle combinaties van randaarde, kinderbeveiliging en waterdicht, plus `aantal: 3`;
    - een lichtpunt per soort;
    - een schakelaar per soort;
    - een toestel per soort.
  - `alle-types.test.ts`:
    - itereer over alle opties van `NodeSchema` (lees ze uit de discriminator van de union);
    - maak per type een minimale geldige node met `nieuwDocument` en `voegToe` of een literal;
    - `tekenSymbool` gooit niet, de invarianten uit Task 3 gelden, en de XML is goedgevormd.
  - `TOESTEL_AFKORTINGEN` heeft een sleutel voor elke waarde van `ToestelsoortSchema`.
- [ ] **Step 2: Draai `pnpm vitest run packages/symbols`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS. Bekijk de snapshots.
- [ ] **Step 5: Commit:** `feat(symbols): punten, leiding en onderbord`

---

### Task 5: Layout, deel 1: kolomboom en posities in de strook

**Files:**
- Create: `packages/layout/src/types.ts`, `packages/layout/src/kolommen.ts`, `packages/layout/test/hulp.ts` (`kloon`)
- Modify: `packages/layout/src/index.ts`
- Test: `packages/layout/test/kolommen.test.ts`

**Interfaces:**
- Consumes: `InstallatieDocument` en `NodeId` uit model, `tekenSymbool`, `KOLOM_BREEDTE_MM` en `Symbool` uit symbols. In tests ook de bouwer uit `@elentrik/arei/testing`.
- Produces:
  - `type SchemaElement =`
    - `| { soort: "symbool"; nodeId: NodeId; x: number; y: number; symbool: Symbool }`: x en y linksboven in strookcoördinaten (mm);
    - `| { soort: "lijn"; x1: number; y1: number; x2: number; y2: number; rol: "verbinding" | "rail" | "leiding" }`;
    - `| { soort: "tekst"; x: number; y: number; tekst: string; grootte: number; anker: "start" | "middle" | "end"; rol: "kring" | "punt" | "leiding" | "beveiliging" | "onderbord" }`;
    - `| { soort: "vervolg"; x: number; y: number; richting: "links" | "rechts"; paginaNummer: number }`.
  - `type Strook = { breedte: number; hoogte: number; elementen: SchemaElement[]; kolomVan: Record<NodeId, number>; kringGrenzen: number[] }`:
    - `kolomVan` geeft de kolomindex per node;
    - `kringGrenzen` geeft de x-posities (mm) waar een kringsubboom begint, oplopend en uniek.
  - `VERTICALE_AFSTAND_MM = 4`, `RAIL_AFSTAND_MM = 6`, `STROOK_MARGE_MM = 4` (marge rond de strook).
  - `maakStrook(doc: InstallatieDocument): Strook`. In deze task bevat de strook alleen `symbool`-elementen en verticale `verbinding`-lijnen. Task 6 voegt rails, verbindingen tussen kinderen en teksten toe.

**Algoritme** (iteratief, met een expliciete stapel):
1. Post-order: `bladen(n)` = 1 als n geen kinderen heeft, anders de som van `bladen` over de kinderen.
2. Pre-order: geef kolommen toe. De root krijgt kolom 0. Het eerste kind van een node krijgt dezelfde startkolom als de node, elk volgend kind start na de vorige subboom.
   - `cx(n) = STROOK_MARGE_MM + kolom(n) * KOLOM_BREEDTE_MM + KOLOM_BREEDTE_MM / 2`.
   - Het symbool staat op `x = cx - breedte / 2`.
3. Pre-order: `y(root) = STROOK_MARGE_MM`, en `y(kind) = y(ouder) + hoogte(ouder) + VERTICALE_AFSTAND_MM`, plus `RAIL_AFSTAND_MM` als de ouder meerdere kinderen heeft.
4. **Verbindingslijnen:**
   - Voor elk kind loopt een lijn van `(cx(ouder), y(ouder) + uit.y)` naar `(cx(kind), y(kind))`.
   - Ligt het kind in een andere kolom, dan bestaat de lijn uit twee stukken: horizontaal op `y(ouder) + hoogte(ouder) + VERTICALE_AFSTAND_MM`, daarna verticaal.
   - In deze task komen die horizontale stukken er alleen als `verbinding`. Task 6 maakt er een `rail` van onder een verdeelbord.
5. **Afmetingen:** `breedte = 2 × STROOK_MARGE_MM + bladen(root) × KOLOM_BREEDTE_MM`, en `hoogte` = de grootste onderkant plus `STROOK_MARGE_MM`.
6. **`kringGrenzen`:** de linkerrand (mm) van elke node die in `analyseer(doc).kringen` staat als `beveiligingId`. Dit is de enige plek waar layout de analyse gebruikt.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een keten aansluiting → teller → differentieel → verdeelbord → automaat → leiding → 3 contactdozen staat in één kolom: alle `cx` zijn gelijk, de `y` strikt oplopend.
  - Twee kringen onder een bord: de kringen staan in kolom 0 en 1, en het bord in kolom 0.
  - `breedte` is 2 × 4 + 2 × 24.
  - Een contactdoos met twee kinderen (een keten die splitst) neemt 2 bladkolommen in.
  - Een document met alleen aansluiting en teller: 2 symbolen, 1 lijn.
  - Een punt zonder kring (differentieel → leiding → contactdoos) wordt getekend.
  - Een keten van 5.000 contactdozen (via raw nodes en `kloon`): geen `RangeError`, 5.000+ symbolen.
  - Determinisme: twee aanroepen geven `toEqual`-gelijke resultaten.
  - `kringGrenzen` bij 3 kringen is `[4, 28, 52]`.
- [ ] **Step 2: Draai `pnpm vitest run packages/layout/test/kolommen.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(layout): kolomboom en posities in de strook`

---

### Task 6: Layout, deel 2: rails, verbindingen en labels

**Files:**
- Create: `packages/layout/src/labels.ts`
- Modify: `packages/layout/src/kolommen.ts`
- Test: `packages/layout/test/labels.test.ts`

**Interfaces:**
- Consumes: `analyseer`, `Analyse` (`kringen[].label`, `puntLabels`) uit `@elentrik/arei`.
- Produces: `maakStrook(doc)` krijgt ook rails, verbindingen tussen kinderen en teksten:
  - `leidingLabel(node: NodeVan<"leiding">): string`: `${kabeltype} ${aantalGeleiders}G${doorsnede}`, met de doorsnede met een komma als decimaalteken (bv. "XVB 3G2,5"). Is `kabeltype.trim()` leeg, dan staat er "?" voor het kabeltype. Is `doorsnede_mm2 === 0`, dan staat er "?" voor de doorsnede.
  - `beveiligingLabel(node)`:
    - automaat: `${nominaal_A} A ${curve}`;
    - zekering: `${nominaal_A} A`;
    - differentieel: `${gevoeligheid_mA} mA ${klasse}`.

**Regels:**
- **Rail boven een bord:** boven een `verdeelbord` met minstens één kind komt een `rail`-lijn op `y(bord) - VERTICALE_AFSTAND_MM`, van `cx(eerste kind)` tot `cx(laatste kind)`. Bij één kind is die lijn 0 lang en wordt hij weggelaten. Daarvandaan lopen verticale verbindingen naar elk kind. Andere nodes met meerdere kinderen krijgen dezelfde vorm met rol `verbinding`.
- **Leidinglabel:** een tekst met rol `leiding` op `x = cx + 2`, verticaal gecentreerd op de leiding, met grootte 2 en anker `start`.
- **Kringlabel:** een tekst met rol `kring` met het kringlabel uit de analyse, links van de lijn, tussen de rail en de beveiliging, met grootte 3.
- **Beveiligingslabel:** een tekst met rol `beveiliging` rechts van de beveiliging.
- **Puntlabel:** een tekst met rol `punt` met het puntlabel (bv. "A3"), links van het symbool (`x = x - 1`), met anker `end` en grootte 2,5. Punten zonder label (zonder kring) krijgen geen puntlabel.
- **Onderbordlabel:** een tekst met rol `onderbord` met `verdeelbord.naam`, als die niet leeg is, rechts van het bordsymbool.
- **Escaping:** layout escapet **niet**. De tekst blijft ruw; dat doet render.

- [ ] **Step 1: Schrijf de falende tests.**
  - Het appartement (zie Task 9 voor de bouwer; maak hier een lokale variant met 3 kringen) heeft precies één `rail` onder het hoofdbord, van `cx` van kring A tot `cx` van de laatste kring.
  - De `kring`-teksten zijn in volgorde ["A", "B", "C"].
  - De `punt`-tekst van de derde contactdoos in kring A is "A3".
  - `leidingLabel`:
    - XVB, 3 geleiders, 2,5 → "XVB 3G2,5";
    - kabeltype "" → "? 3G2,5";
    - doorsnede 0 → "XVB 3G?".
  - `beveiligingLabel` van een automaat 16 B is "16 A B".
  - Een onderbord met de naam `<x>` geeft een tekst met precies de ruwe inhoud `<x>`.
  - Een punt zonder kring heeft geen `punt`-tekst.
- [ ] **Step 2: Draai `pnpm vitest run packages/layout/test/labels.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de layouttests opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(layout): rails, verbindingen en labels`

---

### Task 7: Layout, deel 3: papier, schaal en paginering

**Files:**
- Create: `packages/layout/src/papier.ts`, `packages/layout/src/paginering.ts`
- Modify: `packages/layout/src/index.ts`
- Test: `packages/layout/test/paginering.test.ts`

**Interfaces:**
- Produces:
  - `type Papier = { formaat: "A4" | "A3"; marge_mm: number; cartoucheHoogte_mm: number }` en `STANDAARD_PAPIER_A4 = { formaat: "A4", marge_mm: 10, cartoucheHoogte_mm: 30 }`.
  - `papierMaat(formaat): { breedte: number; hoogte: number }`, liggend: A4 297 × 210, A3 420 × 297.
  - `bruikbaar(papier): { breedte: number; hoogte: number }` = `{ breedte - 2 × marge, hoogte - 2 × marge - cartoucheHoogte }`.
  - `type SchemaPagina = { index: number; xVan: number; xTot: number; schaal: number; elementen: SchemaElement[] }`: de elementen staan in strookcoördinaten; render past toe `translate(-xVan)` en daarna `scale(schaal)`.
  - `type Waarschuwing = { code: "SCHEMA_TE_HOOG" | "KRING_TE_BREED"; paginaIndex?: number }`.
  - `type SchemaOpmaak = { strook: Strook; papier: Papier; paginas: SchemaPagina[]; waarschuwingen: Waarschuwing[] }`.
  - `opmaak(doc: InstallatieDocument, papier?: Papier): SchemaOpmaak`, met A4 als standaard. Dit is de publieke ingang. Spec §6.2 noemt `opmaak(doc, analyse, papier)`; omdat de analyse uit `doc` volgt, berekent layout die zelf. Een overload `opmaak(doc, papier, analyse?)` neemt een al berekende analyse over, zodat de editor niet twee keer rekent.

**Algoritme:**
1. **Schaal:** `schaal = min(1, bruikbaar.hoogte / strook.hoogte)`. Is de schaal kleiner dan `MIN_SCHAAL = 0.5`, dan wordt hij 0.5 en volgt de waarschuwing `SCHEMA_TE_HOOG`.
2. **Paginabreedte in strookcoördinaten:** `W = bruikbaar.breedte / schaal`.
3. **Knippen** (greedy): begin met `xVan = 0`. Kies de grootste kandidaat in `[0, ...kringGrenzen, strook.breedte]` die groter is dan `xVan` en kleiner of gelijk aan `xVan + W`. Is er geen kandidaat, dan wordt `xTot = xVan + W`, met de waarschuwing `KRING_TE_BREED` voor die pagina.
4. **Elementen toewijzen:**
   - Een symbool of tekst gaat naar de pagina waar zijn ankerpunt valt: het midden van het symbool, of de x van de tekst. Het interval is half open: `[xVan, xTot)`, en de laatste pagina neemt ook `xTot`.
   - Verticale lijnen gaan naar de pagina van hun x.
   - Horizontale lijnen die over een knip lopen, worden in stukken geknipt.
   - Een rail die doorloopt naar de volgende pagina krijgt rechts een `vervolg` met `richting: "rechts"` en `paginaNummer: index + 2`. Op de volgende pagina komt links een `vervolg` met `richting: "links"` en `paginaNummer: index`. Paginanummers beginnen bij 1.
5. **Elk element precies één keer:** behalve geknipte lijnen staat elk element van de strook op precies één pagina (Review Focus 3).

- [ ] **Step 1: Schrijf de falende tests.**
  - `papierMaat` en `bruikbaar` voor A4 en A3: A4 bruikbaar is 277 × 160.
  - 3 kringen op A4: 1 pagina met schaal 1.
  - 20 kringen op A4:
    - het aantal pagina's is `ceil` volgens de knipregel; reken het in de test uit met de constanten;
    - elk symbool met een `nodeId` staat op precies één pagina;
    - elke rail die over een knip loopt, heeft de juiste `vervolg`-paren.
  - Op A3 passen er meer kringen per pagina dan op A4.
  - Een keten van 60 contactdozen (te hoog): de schaal is kleiner dan 1 en groter of gelijk aan 0.5.
  - Een keten van 400 contactdozen: de schaal is 0.5 en er is de waarschuwing `SCHEMA_TE_HOOG`.
  - Een kring met 30 punten in een vertakte boom (breder dan een pagina): de waarschuwing `KRING_TE_BREED`, en nog steeds elk symbool precies één keer.
  - `opmaak(doc)` en `opmaak(doc, STANDAARD_PAPIER_A4, analyseer(doc))` zijn gelijk.
- [ ] **Step 2: Draai `pnpm vitest run packages/layout/test/paginering.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai `pnpm vitest run packages/layout`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(layout): papier, schaal en paginering`

---

### Task 8: Render: eendraadschema als SVG

**Files:**
- Create: `packages/render/src/schema-svg.ts`
- Modify: `packages/render/src/index.ts`, `packages/render/package.json` (devDependency `fast-xml-parser`)
- Test: `packages/render/test/schema-svg.test.ts`

**Interfaces:**
- Consumes: `SchemaOpmaak`, `SchemaPagina`, `SchemaElement` en `papierMaat` uit layout, en `getal` en `escapeXml` uit symbols.
- Produces:
  - `schemaPaginaSvg(opmaak: SchemaOpmaak, paginaIndex: number): string`: een volledige `<svg xmlns="http://www.w3.org/2000/svg" width="297mm" height="210mm" viewBox="0 0 297 210">` voor A4 (A3 analoog).
    - Een `<g transform="translate(marge marge) scale(schaal) translate(-xVan 0)">` bevat de elementen.
    - De cartouchezone blijft leeg; die vult het PDF-plan in.
    - Een ongeldige `paginaIndex` gooit een `RangeError`.
  - `schemaStripSvg(opmaak: SchemaOpmaak): string`: de hele strook op schaal 1, met `viewBox="0 0 breedte hoogte"`, voor de editor.
  - **Elementen:**
    - een `symbool` wordt `<g data-node-id="…" transform="translate(x y)">…symbool.svg…</g>`;
    - een `lijn` krijgt `class="lijn-${rol}"`;
    - een `tekst` wordt geëscaped, met `class="tekst-${rol}"`;
    - een `vervolg` wordt een klein pijltje met de tekst `p. ${paginaNummer}`.
  - **Attributen en getallen:** alle attribuutwaarden (ook `data-node-id`) gaan door `escapeXml`, en alle getallen door `getal`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een snapshot van `schemaPaginaSvg` voor een installatie met 2 kringen.
  - Goedgevormde XML (`XMLValidator.validate`) voor elke pagina van een installatie met 20 kringen.
  - XSS: een onderbord met de naam `<script>alert(1)</script>` en een kabeltype `"><img src=x onerror=alert(1)>`. De uitvoer bevat geen `<script` en geen `<img`. Ze is goedgevormd en de geëscapete tekst staat erin.
  - Het aantal `data-node-id` in `schemaStripSvg` is gelijk aan het aantal nodes in het document.
  - Een `paginaIndex` buiten het bereik gooit een `RangeError`.
- [ ] **Step 2: Draai `pnpm vitest run packages/render`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(render): eendraadschema als svg`

---

### Task 9: Referentie-installaties, voorbeeldscript en prestatie

**Files:**
- Create: `packages/arei/src/testing/referenties.ts`, `scripts/voorbeeld-schema.ts`, `packages/render/test/referenties.test.ts`, `packages/render/test/prestatie.test.ts`
- Modify: `packages/arei/src/testing/index.ts`, `packages/arei/test/referenties.test.ts` (gebruikt nu de gedeelde bouwers), `package.json` (script `voorbeeld` + devDependency `tsx`)

**Interfaces:**
- Produces (in `@elentrik/arei/testing`):
  - `referentieAppartement(): InstallatieDocument`, `referentieRijwoning(): InstallatieDocument` en `referentieWoning(): InstallatieDocument`, exact zoals ze nu in `packages/arei/test/referenties.test.ts` staan. De bestaande verwachtingen daar blijven ongewijzigd slagen.
  - Het script `pnpm voorbeeld` (`tsx scripts/voorbeeld-schema.ts`) schrijft voor elke referentie `out/<naam>-strook.svg` en `out/<naam>-p<n>.svg` voor A4. `out/` staat in `.gitignore`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een snapshot van `schemaPaginaSvg` voor elke referentie, pagina 1.
  - Elke pagina is goedgevormde XML.
  - Prestatie: een document met 200 kringen × (automaat + leiding + 8 contactdozen), gebouwd via raw nodes. Na 5 opwarmrondes is de mediaan van 20 runs van `opmaak(doc)` plus `schemaStripSvg` minder dan 50 ms. Gebruik een `mediaan()`-hulpfunctie en `declare const performance` zoals in de prestatietest van arei.
- [ ] **Step 2: Draai `pnpm vitest run packages/render packages/arei`.** Verwacht: FAIL (de exports bestaan nog niet).
- [ ] **Step 3: Implementeer** de bouwers, het script en de tests.
- [ ] **Step 4: Draai `pnpm test && pnpm typecheck && pnpm voorbeeld`.** Verwacht: PASS, met de bestanden in `out/`.
- [ ] **Step 5: Commit:** `feat: referentie-installaties delen, voorbeeldscript en prestatietest schema`

---

## Open voor het PDF-plan

- **Leesbaarheid bij verkleining:** alle pagina's krijgen dezelfde schaal, tot `MIN_SCHAAL = 0.5`. Labels van 2 mm worden dan afgedrukt op ongeveer 2,8 tot 4 pt, en dat is te klein om goed te lezen. Het PDF-plan moet kiezen tussen:
  - een minimale afgedrukte tekstgrootte;
  - verticale paginering, met vervolgmarkeringen boven en onder;
  - lange ketens omvouwen.
- **Te hoge schema's:** boven `SCHEMA_TE_HOOG` wordt de inhoud nu geclipt op de bruikbare ruimte. Op het blad zelf is niet te zien dat er iets ontbreekt; alleen de waarschuwing in `SchemaOpmaak.waarschuwingen` meldt het. Ook dit moet het PDF-plan oplossen.
