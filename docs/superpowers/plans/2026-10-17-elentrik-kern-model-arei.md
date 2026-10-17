# Elentrik kern (model + AREI-motor): implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** de pnpm-monorepo opzetten met twee pakketten zonder UI:
- `@elentrik/model`: het documentschema, de operaties en de invarianten;
- `@elentrik/arei`: analyse, regelmechaniek en de eerste regelset met voorlopige waarden.

**Architecture:** beide pakketten zijn pure TypeScript, zonder I/O, en draaien zowel in de browser als in Node. `arei` hangt af van `model`, nooit omgekeerd. Alle documentwijzigingen lopen via immer, zodat er patches zijn voor undo. De AREI-motor werkt in twee stappen: `analyseer` (afgeleide gegevens) en daarna `controleer` (regels → bevindingen).

**Tech Stack:**
- Node 24
- pnpm 12 (workspaces)
- TypeScript 7 (strict, ESM)
- Zod 4
- immer 11
- uuid 14 (v7)
- Vitest 5
- fast-check 4

**Spec:** `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md` (§3, §4.1–4.4, §5, §9). Dit is plan 1 van de MVP. De latere plannen dekken:
2. `symbols` en `layout`;
3. de editor voor het eendraadschema;
4. authenticatie, organisaties en projecten (inclusief database, §4.5);
5. het situatieschema;
6. `render` en PDF-export;
7. abonnementen;
8. het publiceren van de regelset.

## Global Constraints

- **Eigen ontwikkeling:** geen code, symbolen, teksten of vertalingen van andere software overnemen.
- **Geen I/O in `packages/*/src`:** geen `node:`-imports, geen `fs`, geen `fetch`, geen Vue of Nuxt. Testbestanden mogen wel `node:`-modules gebruiken.
- **Afhankelijkheden in één richting:** `model` ← `arei`. `model` importeert nooit uit `arei`.
- **Modules:** ESM (`"type": "module"`), TypeScript `strict` en `noUncheckedIndexedAccess`.
- **Interne pakketten worden niet gebouwd:** `exports` wijst naar `./src/index.ts`.
- **Namen:** domeinnamen en veldnamen in het Nederlands, exact zoals in de spec (`nominaal_A`, `doorsnede_mm2`, `gevoeligheid_mA`, …).
- **ID's:** UUIDv7-strings, via `nieuwId()`.
- **AREI-waarden zijn voorlopig:**
  - alle regels krijgen `nagekeken: false` en `artikel: ""`;
  - regelset `arei-2020@1` krijgt `gepubliceerd: false`;
  - een gepubliceerde regelset mag alleen regels bevatten met `nagekeken: true` en een niet-leeg `artikel`.
- **Commits:**
  - Conventional Commits, eindigend op `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - ze worden ondertekend via 1Password: nooit `--no-gpg-sign` gebruiken of de ondertekening uitschakelen;
  - mislukt de ondertekening, dan stoppen en het melden.

## Review Focus

1. **Diepe ketens van punten:** een schema waarin duizenden punten achter elkaar hangen (gebruikelijk in eendraadschema's) mag geen stack overflow geven in `valideerStructuur` of `analyseer`. Alle doorlopingen zijn iteratief. → Task 3 en Task 10.
2. **Verwijderen van een tak met plaatsingen of afwijkingen:** die worden mee opgeruimd. Er mogen geen verweesde verwijzingen overblijven. → Task 4.
3. **Een node verplaatsen naar zijn eigen subboom:** dat geeft `DocumentFout` met code `CYCLUS`, en het document blijft ongewijzigd. → Task 4.
4. **Kring zonder leiding of met doorsnede 0** ("niet ingevuld"): de doorsnederegels crashen niet en geven geen vals alarm. Alleen de info-regel over een onvolledige leiding meldt het. → Task 13 en Task 15.
5. **Document met een onbekend node-type of extra velden**, bv. uit een nieuwere app-versie of handmatig bewerkt: dat wordt geweigerd met `ONGELDIG_SCHEMA` en een pad naar het probleem. Het wordt niet stil geaccepteerd. → Task 2.

---

### Task 1: Monorepo-skelet

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`
- Create: `packages/model/package.json`, `packages/model/tsconfig.json`, `packages/model/src/index.ts`, `packages/model/src/versie.ts`
- Create: `packages/arei/package.json`, `packages/arei/tsconfig.json`, `packages/arei/src/index.ts`
- Test: `packages/arei/test/workspace.test.ts`, `test/geen-io.test.ts`

**Interfaces:**
- Produces: `SCHEMA_VERSIE = 1` (export uit `@elentrik/model`); de scripts `pnpm test` (`vitest run`) en `pnpm typecheck` (`pnpm -r typecheck`, per pakket `tsc --noEmit`).

**Configuratie:**
- `pnpm-workspace.yaml`: `packages: ["packages/*", "apps/*"]`.
- `tsconfig.base.json`:
  - `strict`, `noUncheckedIndexedAccess`;
  - `target`/`lib` `ES2023` (geen DOM);
  - `module: "preserve"`, `moduleResolution: "bundler"`;
  - `verbatimModuleSyntax`, `noEmit`.
- `vitest.config.ts`: `test.projects: ["packages/*"]`.
- `.gitignore`: `node_modules/`, `coverage/`.
- Pakketten:
  - `@elentrik/model` en `@elentrik/arei`, met `"type": "module"`, `"exports": { ".": "./src/index.ts" }` en `engines.node: ">=24"`;
  - `arei` heeft `"@elentrik/model": "workspace:*"`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
// packages/arei/test/workspace.test.ts
import { SCHEMA_VERSIE } from "@elentrik/model";
test("arei kan model importeren", () => expect(SCHEMA_VERSIE).toBe(1));

// test/geen-io.test.ts — handhaaft "geen I/O in packages/*/src"
test("geen node:-imports of fetch in pakketbronnen", () => {
  // lees recursief packages/*/src/**/*.ts met node:fs; verwacht dat geen enkel bestand
  // /from\s+["']node:|require\(|\bfetch\(/ bevat
  expect(overtreders).toEqual([]);
});
```

Voeg `test/` toe als extra Vitest-project (`test.projects: ["packages/*", "test"]`).

- [ ] **Step 2: Draai `pnpm install && pnpm test`.** Verwacht: FAIL, want `@elentrik/model` exporteert `SCHEMA_VERSIE` niet.
- [ ] **Step 3: Implementeer `export const SCHEMA_VERSIE = 1 as const` in `packages/model/src/versie.ts`** en exporteer het via `index.ts`.
- [ ] **Step 4: Draai `pnpm test && pnpm typecheck`.** Verwacht: alles PASS, typecheck zonder fouten.
- [ ] **Step 5: Commit:** `chore: monorepo-skelet met model en arei`

---

### Task 2: Documentschema, fouten en `nieuwDocument`

**Files:**
- Create: `packages/model/src/fouten.ts`, `packages/model/src/schema.ts`, `packages/model/src/ids.ts`, `packages/model/src/document.ts`
- Modify: `packages/model/src/index.ts` (exports)
- Test: `packages/model/test/schema.test.ts`

**Interfaces:**
- Produces:
  - `class DocumentFout extends Error { code: FoutCode; details?: unknown }`
  - `type FoutCode = "ONGELDIG_SCHEMA" | "ONBEKENDE_NODE" | "NIET_TOEGELATEN_KIND" | "CYCLUS" | "ROOT_NIET_WIJZIGBAAR" | "ONGELDIGE_INDEX" | "ONBEKENDE_PAGINA" | "NIET_PLAATSBAAR" | "ONBEKENDE_SCHEMAVERSIE"`
  - Zod-schema's `NodeSchema`, `InstallatieDocumentSchema` en de afgeleide types `Node`, `NodeType`, `NodeId`, `InstallatieDocument`, `Partij`, `Adres`, `Afwijking`, `SituatiePagina`, `Plaatsing`, `Ruimte`, `Toestelsoort`, `Polen`, `Stroomtype`. Ze volgen exact spec §4.1–4.3.
  - `type NodeVan<T extends NodeType> = Extract<Node, { type: T }>`
  - `parseDocument(invoer: unknown): InstallatieDocument`: gooit `DocumentFout("ONGELDIG_SCHEMA", { issues })`.
  - `nieuwId(): NodeId` (uuid v7)
  - `nieuwDocument(opties?: { klantNaam?: string; stroomtype?: Stroomtype; regelset?: string; datum?: string }): InstallatieDocument`

**Beslissingen:**
- **Strikte objecten:** alle objecten zijn `z.strictObject`, zodat onbekende velden geweigerd worden. `NodeSchema` is een `z.discriminatedUnion("type", …)`.
- **Grenzen op getallen:**
  - `aantal` en `aantalGeleiders`: geheel getal ≥ 1;
  - `nominaal_A` en `gevoeligheid_mA`: > 0;
  - `doorsnede_mm2`: ≥ 0, waarbij **0 betekent "niet ingevuld"**;
  - `kabeltype`: string, waarbij een lege string betekent "niet ingevuld";
  - `polen`: 1 tot 4.
- **`schemaVersion`:** `z.literal(SCHEMA_VERSIE)`.
- **`nieuwDocument`:**
  - de root is `aansluiting` met één kind `teller`;
  - standaardwaarden: `stroomtype: "2x230V"`, `regelset: "arei-2020@1"`, `datum` = vandaag als `YYYY-MM-DD`;
  - partijen krijgen `naam: ""`, de klant krijgt `klantNaam`;
  - `werfadres` bestaat uit lege strings, met `land: "BE"`;
  - `situatie: { paginas: [] }` en `afwijkingen: []`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
test("nieuwDocument is geldig en heeft aansluiting → teller", () => {
  const doc = nieuwDocument({ klantNaam: "Janssens", datum: "2026-10-17" });
  expect(parseDocument(structuredClone(doc))).toEqual(doc);
  const root = doc.nodes[doc.rootId]!;
  expect(root.type).toBe("aansluiting");
  expect(doc.nodes[root.kinderen[0]!]!.type).toBe("teller");
  expect(doc.meta.klant.naam).toBe("Janssens");
  expect(doc.voeding.stroomtype).toBe("2x230V");
});
test("onbekend node-type → ONGELDIG_SCHEMA met pad in nodes", () => {
  const doc: any = nieuwDocument();
  doc.nodes[doc.rootId].type = "kernreactor";
  const fout = vangFout(() => parseDocument(doc));
  expect(fout.code).toBe("ONGELDIG_SCHEMA");
  expect(JSON.stringify(fout.details)).toContain("nodes");
});
test("extra veld wordt geweigerd", () => {
  const doc: any = nieuwDocument(); doc.extra = 1;
  expect(vangFout(() => parseDocument(doc)).code).toBe("ONGELDIG_SCHEMA");
});
test("contactdoos met aantal 0 wordt geweigerd", () => { /* voeg via object-literal een contactdoos { aantal: 0 } toe → ONGELDIG_SCHEMA */ });
```

`vangFout(fn): DocumentFout` is een kleine hulpfunctie in `packages/model/test/hulp.ts`. Ze faalt de test als `fn` niet gooit.

- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/schema.test.ts`.** Verwacht: FAIL (imports bestaan niet).
- [ ] **Step 3: Implementeer** de schema's, `DocumentFout`, `parseDocument`, `nieuwId` en `nieuwDocument` zoals hierboven.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS. Draai ook `pnpm typecheck`.
- [ ] **Step 5: Commit:** `feat(model): documentschema, fouten en nieuwDocument`

---

### Task 3: Structuurinvarianten

**Files:**
- Create: `packages/model/src/structuur.ts`
- Test: `packages/model/test/structuur.test.ts`

**Interfaces:**
- Consumes: de types uit Task 2.
- Produces:
  - `TOEGELATEN_KINDEREN: Readonly<Record<NodeType, readonly NodeType[]>>`
  - `PUNT_TYPES = ["contactdoos", "lichtpunt", "schakelaar", "toestel"] as const`
  - `BEVEILIGING_TYPES = ["automaat", "zekering"] as const`
  - `type StructuurProbleem = { code: "ROOT_ONGELDIG" | "ONBEREIKBAAR" | "CYCLUS" | "OUDER_INCONSISTENT" | "DUBBEL_KIND" | "NIET_TOEGELATEN_KIND" | "ONBEKENDE_VERWIJZING"; nodeId: NodeId }`
  - `valideerStructuur(doc: InstallatieDocument): StructuurProbleem[]`

**Waarden voor `TOEGELATEN_KINDEREN`:**
- `aansluiting: ["teller"]`
- `teller` en `differentieel: ["differentieel", "automaat", "zekering", "verdeelbord", "leiding"]`
- `verdeelbord: ["differentieel", "automaat", "zekering", "leiding"]`
- `automaat` en `zekering: ["leiding", "verdeelbord", "differentieel"]`
- `leiding: [...PUNT_TYPES, "leiding", "verdeelbord", "differentieel"]`
- elk punttype: `[...PUNT_TYPES, "leiding"]`

**Controles:**
- De root bestaat, heeft `parentId: null` en het type `aansluiting`. Anders volgt `ROOT_ONGELDIG`.
- Elke node is bereikbaar vanaf de root. Anders volgt `ONBEREIKBAAR`.
- Er is geen cyclus. Anders volgt `CYCLUS`.
- Voor elk kind geldt `kind.parentId === ouder.id`. Anders volgt `OUDER_INCONSISTENT`.
- Een id staat in hooguit één lijst `kinderen`, en daar één keer. Anders volgt `DUBBEL_KIND`.
- Het type van elk kind staat in `TOEGELATEN_KINDEREN` van zijn ouder. Anders volgt `NIET_TOEGELATEN_KIND`.
- Elke `kinderen`-id, `plaatsingen[].nodeId` en `afwijkingen[].nodeId` bestaat. Anders volgt `ONBEKENDE_VERWIJZING`.

De doorloping is **iteratief**, met een expliciete stapel (Review Focus 1).

- [ ] **Step 1: Schrijf de falende tests.**
  - `nieuwDocument()` → `[]`.
  - Per code één document dat via een object-literal is gemanipuleerd, met verwachting `toContainEqual({ code, nodeId })`.
  - Een keten van 20.000 contactdozen, gebouwd via een literal, → `[]` zonder `RangeError`.
- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/structuur.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer `valideerStructuur`** en de constanten.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): structuurinvarianten`

---

### Task 4: Basisoperaties met patches

**Files:**
- Create: `packages/model/src/operaties.ts`
- Test: `packages/model/test/operaties.test.ts`

**Interfaces:**
- Consumes: `DocumentFout`, `TOEGELATEN_KINDEREN`, `nieuwId`, `NodeSchema`.
- Produces:
  - `type NodeInvoer = Node extends infer N ? (N extends Node ? Omit<N, "id" | "parentId" | "kinderen"> : never) : never` (distributief)
  - `type OperatieResultaat = { doc: InstallatieDocument; patches: Patch[]; inversePatches: Patch[] }` (`Patch` uit immer, opnieuw geëxporteerd)
  - `voegToe(doc, parentId: NodeId, invoer: NodeInvoer, index?: number): OperatieResultaat & { id: NodeId }`
  - `verwijder(doc, nodeId: NodeId): OperatieResultaat`
  - `verplaats(doc, nodeId: NodeId, nieuweParentId: NodeId, index?: number): OperatieResultaat`
  - `wijzigEigenschappen(doc, nodeId: NodeId, wijziging: Record<string, unknown>): OperatieResultaat`
  - `pasPatchesToe(doc, patches: Patch[]): InstallatieDocument`

**Gedrag:**
- **Algemeen:** alles via immer `produceWithPatches`, waarbij `enablePatches()` één keer per module wordt aangeroepen. Bij een fout wordt er gegooid voordat er iets verandert.
- **`voegToe`:**
  - een onbekende ouder geeft `ONBEKENDE_NODE`;
  - een type dat niet toegelaten is, geeft `NIET_TOEGELATEN_KIND`;
  - een `index` buiten `0..kinderen.length` geeft `ONGELDIGE_INDEX`;
  - zonder `index` komt het kind achteraan;
  - de nieuwe node wordt gevalideerd met `NodeSchema`, anders volgt `ONGELDIG_SCHEMA`.
- **`verwijder`:**
  - de root geeft `ROOT_NIET_WIJZIGBAAR`;
  - de hele subboom wordt verwijderd, samen met alle `plaatsingen` en `afwijkingen` waarvan het `nodeId` in die subboom ligt (Review Focus 2).
- **`verplaats`:**
  - een nieuwe ouder binnen de subboom van de node, of de node zelf, geeft `CYCLUS` (Review Focus 3);
  - daarnaast dezelfde controles op type en index als bij `voegToe`;
  - de root verplaatsen geeft `ROOT_NIET_WIJZIGBAAR`.
- **`wijzigEigenschappen`:**
  - een wijziging aan `id`, `type`, `parentId` of `kinderen` geeft `ONGELDIG_SCHEMA`;
  - het resultaat van de samenvoeging wordt gevalideerd met `NodeSchema`.

- [ ] **Step 1: Schrijf de falende tests**

```ts
test("voegToe plaatst kind op index en zet parentId", () => {
  const doc0 = nieuwDocument(); const teller = doc0.nodes[doc0.rootId]!.kinderen[0]!;
  const a = voegToe(doc0, teller, { type: "verdeelbord" });
  const b = voegToe(a.doc, teller, { type: "differentieel", gevoeligheid_mA: 300, nominaal_A: 40, polen: 2, klasse: "A" }, 0);
  expect(b.doc.nodes[teller]!.kinderen).toEqual([b.id, a.id]);
  expect(b.doc.nodes[b.id]!.parentId).toBe(teller);
  expect(valideerStructuur(b.doc)).toEqual([]);
});
test("contactdoos onder teller → NIET_TOEGELATEN_KIND, doc ongewijzigd", …);
test("verwijder ruimt subboom, plaatsingen en afwijkingen op", …);   // doc met plaatsing + afwijking op een kleinkind via literal
test("verplaats naar eigen nakomeling → CYCLUS", …);
test("inversePatches herstellen het origineel", () => {
  const r = voegToe(doc0, teller, { type: "verdeelbord" });
  expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc0);
});
test("wijzigEigenschappen kan type niet wijzigen", …);
test("wijzigEigenschappen valideert: nominaal_A -1 → ONGELDIG_SCHEMA", …);
```

- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/operaties.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de vijf functies volgens het gedrag hierboven.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): basisoperaties met immer-patches`

---

### Task 5: Sjablonen toepassen

**Files:**
- Create: `packages/model/src/sjablonen.ts`
- Test: `packages/model/test/sjablonen.test.ts`

**Interfaces:**
- Consumes: `NodeInvoer`, `OperatieResultaat`, de controles van `voegToe`.
- Produces:
  - `type SjabloonNode = NodeInvoer & { kinderen?: SjabloonNode[] }`
  - `type Sjabloon = { id: string; naam: string; boom: SjabloonNode }`
  - `pasSjabloonToe(doc, parentId: NodeId, sjabloon: Sjabloon, index?: number): OperatieResultaat & { id: NodeId }`, waarbij `id` de root van het ingevoegde sjabloon is.

**Gedrag:**
- Alles gebeurt in **één** `produceWithPatches`, zodat één undo-stap het hele sjabloon terugdraait.
- Elk niveau wordt gecontroleerd met `TOEGELATEN_KINDEREN` en `NodeSchema`.
- Bij een fout gooit de functie, en het document blijft ongewijzigd.
- Elke node krijgt een nieuwe `nieuwId()`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Het sjabloon "Stopcontacten keuken" (automaat 20 A → leiding 2,5 → 3 contactdozen in een keten, `ruimte: "keuken"`) onder een verdeelbord.
  - Verwacht: 5 nieuwe nodes, `valideerStructuur` geeft `[]`, en `pasPatchesToe(r.doc, r.inversePatches)` is gelijk aan het origineel.
  - Een sjabloon met een niet-toegelaten kind gooit `NIET_TOEGELATEN_KIND`, en het document blijft ongewijzigd.
- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/sjablonen.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer `pasSjabloonToe`.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): sjablonen toepassen als één operatie`

---

### Task 6: Operaties voor het situatieschema

**Files:**
- Create: `packages/model/src/situatie.ts`
- Test: `packages/model/test/situatie.test.ts`

**Interfaces:**
- Produces:
  - `PLAATSBARE_TYPES = [...PUNT_TYPES, "verdeelbord"] as const`
  - `voegPaginaToe(doc, titel: string): OperatieResultaat & { id: string }` (pagina zonder achtergrond, `plaatsingen: []`)
  - `zetAchtergrond(doc, paginaId: string, achtergrond: NonNullable<SituatiePagina["achtergrond"]>): OperatieResultaat`
  - `plaats(doc, paginaId: string, nodeId: NodeId, positie: { x: number; y: number; rotatie: number }): OperatieResultaat`
  - `verwijderPlaatsing(doc, nodeId: NodeId): OperatieResultaat`

**Gedrag:**
- **Eén plaatsing per node, over alle pagina's heen.** `plaats` verwijdert een bestaande plaatsing van die node, ook op een andere pagina, en voegt de nieuwe toe.
- `rotatie` wordt genormaliseerd naar `[0, 360)`.
- Een onbekende pagina geeft `ONBEKENDE_PAGINA`, een onbekende node `ONBEKENDE_NODE`, en een type buiten `PLAATSBARE_TYPES` geeft `NIET_PLAATSBAAR`.
- `verwijderPlaatsing` zonder bestaande plaatsing verandert niets en geeft lege patches.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een contactdoos plaatsen op pagina 1 en daarna op pagina 2 → alleen nog op pagina 2.
  - `rotatie: -15` → 345, en `rotatie: 375` → 15.
  - Een automaat plaatsen → `NIET_PLAATSBAAR`.
  - Een onbekende pagina → `ONBEKENDE_PAGINA`.
  - Undo via `inversePatches` herstelt het origineel.
- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/situatie.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de vier functies.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(model): operaties voor situatieschema`

---

### Task 7: Property-based invarianten

**Files:**
- Test: `packages/model/test/eigenschappen.test.ts`
- Modify: `packages/model/package.json` (devDependency `fast-check`)

**Interfaces:**
- Consumes: alle operaties uit Task 4–6, plus `valideerStructuur` en `parseDocument`.

**Test:**
- fast-check `fc.commands` of een generator voor reeksen van 1 tot 60 operaties. Elke operatie kiest willekeurig uit:
  - `voegToe` van een toegelaten type onder een bestaande node;
  - `verwijder` van een node die niet de root is;
  - `verplaats`;
  - `voegPaginaToe` of `plaats`.
- Gooit een operatie een `DocumentFout`, dan telt dat als een geldige weigering en blijft het document ongewijzigd. Een andere fout laat de test falen.
- Na elke stap geldt:
  - `valideerStructuur(doc)` is `[]`;
  - `parseDocument(structuredClone(doc))` gooit niet.
- Aan het einde geeft het toepassen van alle `inversePatches`, in omgekeerde volgorde, het startdocument terug.
- `numRuns: 200`.

- [ ] **Step 1: Schrijf de property-test.**
- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/eigenschappen.test.ts`.** Verwacht: PASS. Faalt de test, dan is er een bug in Task 3–6: los die daar op, met een regressietest in het betreffende testbestand, en draai opnieuw.
- [ ] **Step 3: Commit:** `test(model): property-based invarianten van operaties`

---

### Task 8: Migraties

**Files:**
- Create: `packages/model/src/migraties.ts`
- Test: `packages/model/test/migraties.test.ts`

**Interfaces:**
- Produces:
  - `type Migratie = (doc: Record<string, unknown>) => Record<string, unknown>`
  - `MIGRATIES: Readonly<Record<number, Migratie>>`: de sleutel `n` migreert van versie n naar n+1. Voorlopig is de map leeg.
  - `pasMigratiesToe(doc: Record<string, unknown>, migraties: Readonly<Record<number, Migratie>>, van: number, naar: number): Record<string, unknown>`
  - `migreer(invoer: unknown): InstallatieDocument`

**Gedrag van `migreer`:**
- Geen object, of een `schemaVersion` die geen geheel getal is → `ONGELDIG_SCHEMA`.
- `schemaVersion > SCHEMA_VERSIE` → `ONBEKENDE_SCHEMAVERSIE`.
- Anders `pasMigratiesToe` van de versie van het document naar `SCHEMA_VERSIE`, en daarna `parseDocument`.
- `pasMigratiesToe` gooit `ONBEKENDE_SCHEMAVERSIE` als er voor een tussenliggende stap geen migratie bestaat.

- [ ] **Step 1: Schrijf de falende tests.**
  - Een document met v1 komt ongewijzigd terug.
  - `schemaVersion: 2` geeft `ONBEKENDE_SCHEMAVERSIE`.
  - Zonder `schemaVersion` volgt `ONGELDIG_SCHEMA`.
  - `pasMigratiesToe` met nepmigraties `{1: d => ({...d, a: 1}), 2: d => ({...d, b: d.a + 1})}` van 1 naar 3 → `a: 1, b: 2, schemaVersion: 3`. Elke migratie zet `schemaVersion` zelf op n+1. Daarom bevat de test ook die nep-update.
  - Een ontbrekende stap geeft `ONBEKENDE_SCHEMAVERSIE`.
- [ ] **Step 2: Draai `pnpm vitest run packages/model/test/migraties.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** `pasMigratiesToe` en `migreer`.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS. Draai daarna `pnpm test && pnpm typecheck` voor het hele model-pakket.
- [ ] **Step 5: Commit:** `feat(model): migratiemechaniek`

---

### Task 9: Bouwer-DSL voor testinstallaties

**Files:**
- Create: `packages/arei/src/testing/bouwer.ts`, `packages/arei/src/testing/index.ts`
- Modify: `packages/arei/package.json` (`exports["./testing"] = "./src/testing/index.ts"`)
- Test: `packages/arei/test/bouwer.test.ts`

**Interfaces:**
- Consumes: `nieuwDocument`, `voegToe` en de types uit `@elentrik/model`.
- Produces (via `@elentrik/arei/testing`):
  - `installatie(opties?: { stroomtype?: Stroomtype }): InstallatieBouwer`
  - `InstallatieBouwer`:
    - `.differentieel(mA: number, inhoud: (d: VoedingBouwer) => void, opties?: { polen?: Polen }): this`
    - `.verdeelbord(inhoud: (b: BordBouwer) => void, naam?: string): this`
    - `.bouw(): { doc: InstallatieDocument; ids: Record<string, NodeId> }`
  - `VoedingBouwer` heeft `.differentieel(...)` en `.verdeelbord(...)` met dezelfde signatuur, en hangt alles onder de huidige differentieel.
  - `BordBouwer`:
    - `.kring(inhoud: (k: KringBouwer) => void): this`
    - `.differentieel(mA: number, inhoud: (b: BordBouwer) => void, opties?): this`, voor een differentieel binnen het bord dat kringen voedt.
  - `KringBouwer`, ketenbaar:
    - `.automaat(A, opties?: { polen?: Polen; curve?: "B" | "C" | "D" })`
    - `.zekering(A)`
    - `.leiding(mm2: number, opties?: { kabeltype?: string })`
    - `.contactdozen(n, opties?: { ruimte?: Ruimte })`
    - `.lichtpunten(n, opties?)`
    - `.schakelaar(opties?)`
    - `.toestel(soort: Toestelsoort, opties?)`
    - `.onderbord(inhoud: (b: BordBouwer) => void, naam?: string)`
    - `.als(naam: string)`: geeft de laatst aangemaakte node een naam in `ids`.

**Semantiek:**
- **Plaats in de boom:**
  - `automaat`/`zekering` komt onder het bord of de differentieel in het bord;
  - `leiding` komt onder de laatste beveiliging van de kring;
  - het eerste punt komt onder de laatste leiding, elk volgend punt onder het vorige punt (een keten);
  - `onderbord` komt onder de laatste leiding.
- **Standaardwaarden:**
  - `kabeltype: "XVB"`, `aantalGeleiders: 3`;
  - automaat `polen: 2`, `curve: "B"`;
  - differentieel `nominaal_A: 40`, `polen: 2`, `klasse: "A"`;
  - contactdoos `aantal: 1`, `randaarde: true`, `kinderbeveiliging: true`, `waterdicht: false`.
- **Uitvoering:** alles loopt via `voegToe`, dus de uitvoer is altijd structureel geldig.

- [ ] **Step 1: Schrijf de falende test**

```ts
test("bouwer maakt een geldige installatie met benoemde ids", () => {
  const { doc, ids } = installatie()
    .differentieel(300, d => d.verdeelbord(b => b
      .kring(k => k.automaat(16).als("kA").leiding(2.5).contactdozen(3, { ruimte: "keuken" }))
      .kring(k => k.automaat(16).leiding(1.5).lichtpunten(2))))
    .bouw();
  expect(valideerStructuur(doc)).toEqual([]);
  expect(doc.nodes[ids.kA!]!.type).toBe("automaat");
  expect(Object.values(doc.nodes).filter(n => n.type === "contactdoos")).toHaveLength(3);
});
```

- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/bouwer.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer de bouwer.**
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `test(arei): bouwer-DSL voor testinstallaties`

---

### Task 10: Analyse, deel 1: kringen, letters en nummering

**Files:**
- Create: `packages/arei/src/analyse/types.ts`, `packages/arei/src/analyse/kringen.ts`, `packages/arei/src/analyse/index.ts`
- Test: `packages/arei/test/analyse-kringen.test.ts`

**Interfaces:**
- Produces:
  - `type Kring = { id: NodeId; label: string; beveiligingId: NodeId; verdeelbordId: NodeId; puntIds: NodeId[]; leidingIds: NodeId[]; tellingen: { contactdozen: number; lichtpunten: number; schakelaars: number; toestellen: number }; ruimtes: Ruimte[]; minDoorsnede_mm2: number | null }`
    - `id` is gelijk aan `beveiligingId`;
    - `contactdozen` en `lichtpunten` zijn sommen van `aantal`.
  - `type Keten = { leidingId: NodeId | null; beveiligingId: NodeId | null; differentielen: NodeId[] }`, waarbij `differentielen` begint bij de dichtstbijzijnde.
  - `type Analyse = { kringen: Kring[]; kringVanNode: Record<NodeId, NodeId>; puntLabels: Record<NodeId, string>; ketens: Record<NodeId, Keten>; zonderKring: NodeId[]; tellerId: NodeId | null; algemeenDifferentieelId: NodeId | null; nietGeplaatst: NodeId[] }`
  - `analyseer(doc: InstallatieDocument): Analyse`. In deze task worden `kringen`, `kringVanNode`, `puntLabels` en `zonderKring` gevuld. De andere velden krijgen voorlopig lege of `null`-waarden.
  - `kringLetter(index: number): string`: bijectief base-26, met 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB".

**Algoritme (spec §5.1, met deze precisering):**
- Doorlopen in pre-order (diepte eerst, in de volgorde van `kinderen`), iteratief met een expliciete stapel (Review Focus 1).
- **Wat een kring is:** een `automaat` of `zekering` met een `verdeelbord` als voorouder start een kring. Tot de kring horen alle nakomelingen tot de volgende `automaat` of `zekering`. Een geneste beveiliging start dus een nieuwe kring.
- **Letters:**
  - kringen krijgen letters op volgorde, per **bord**;
  - een bord zonder kring als voorouder is een hoofdbord, en zijn kringen krijgen een label zonder prefix: "A", "B", …;
  - een bord binnen een kring is een onderbord;
  - het prefix van een onderbord is `verdeelbord.naam`, of als dat leeg of niet ingevuld is, het label van de kring waarin het onderbord hangt;
  - de kringen van een onderbord krijgen het label `${prefix}.${letter}`, bv. "C.A".
- **Puntlabels:** punten (`PUNT_TYPES`) krijgen per kring een nummer vanaf 1, in pre-order: `${kringLabel}${n}`, bv. "A1" of "C.A2".
- **Punten zonder kring:** punten zonder kringbeveiliging erboven komen in `zonderKring`, zonder label.

- [ ] **Step 1: Schrijf de falende tests.**
  - `kringLetter`: 0 → "A", 25 → "Z", 26 → "AA", 27 → "AB", 701 → "ZZ", 702 → "AAA".
  - 2 kringen → labels `["A", "B"]`, en de punten krijgen "A1", "A2", "B1".
  - 28 kringen → het 27e label is "AA" en het 28e "AB".
  - Een onderbord zonder naam in kring "C" met 2 kringen → "C.A" en "C.B".
  - Met `naam: "Garage"` → "Garage.A".
  - differentieel → leiding → contactdoos zonder automaat → de contactdoos staat in `zonderKring`.
  - Tellingen: 3 nodes `contactdozen` (elk `aantal: 1`) plus een contactdoos met `aantal: 2` → `tellingen.contactdozen === 5`.
  - Een keten van 5.000 contactdozen in één kring → `kringen[0].puntIds.length === 5000`, zonder `RangeError`.
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/analyse-kringen.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** `kringLetter` en `analyseer`, voor zover dat in deze task valt.
- [ ] **Step 4: Draai de test opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(arei): kringen afleiden met letters en puntnummering`

---

### Task 11: Analyse, deel 2: ketens, kringgegevens en algemeen differentieel

**Files:**
- Modify: `packages/arei/src/analyse/kringen.ts` (of een nieuw `packages/arei/src/analyse/ketens.ts`, aangeroepen vanuit `analyseer`)
- Test: `packages/arei/test/analyse-ketens.test.ts`

**Interfaces:**
- Produces: de velden `ketens`, `Kring.leidingIds`, `Kring.ruimtes`, `Kring.minDoorsnede_mm2`, `tellerId`, `algemeenDifferentieelId` en `nietGeplaatst` van `Analyse`, gevuld zoals in Task 10 gedefinieerd.

**Definities:**
- **`ketens`:** voor elk punt (`PUNT_TYPES`):
  - de dichtstbijzijnde `leiding` als voorouder;
  - de dichtstbijzijnde `automaat` of `zekering` als voorouder;
  - alle `differentieel`-voorouders, de dichtstbijzijnde eerst.
- **`Kring.leidingIds`:** alle `leiding`-nodes binnen de kring, tussen de beveiliging en de volgende beveiliging.
- **`Kring.minDoorsnede_mm2`:** het minimum van `doorsnede_mm2` over die leidingen, **met waarden 0 ("niet ingevuld") genegeerd**. Is er geen enkele leiding met een ingevulde doorsnede, dan is de waarde `null`.
- **`Kring.ruimtes`:** de unieke `ruimte`-waarden van de punten in de kring, in volgorde van eerste voorkomen.
- **`tellerId`:** de eerste node van type `teller`, of `null`.
- **`algemeenDifferentieelId`:** de **eerste** `differentieel` in pre-order die een voorouder is van **alle** kringbeveiligingen. Zijn er geen kringen of geen zo'n differentieel, dan is de waarde `null`.
- **`nietGeplaatst`:** de punten die in geen enkele `SituatiePagina.plaatsingen` voorkomen, in pre-order.

- [ ] **Step 1: Schrijf de falende tests.**
  - De keten van een contactdoos in een badkamer achter diff 300 → diff 30 → automaat → leiding geeft `differentielen = [id30, id300]` en de juiste `beveiligingId` en `leidingId`.
  - Een kring met leidingen van 2,5 en 1,5 → `minDoorsnede_mm2 === 1.5`.
  - Een kring met alleen een leiding met doorsnede 0 → `null`.
  - `algemeenDifferentieelId`: diff 300 bovenaan → dat id. Als een tweede bord rechtstreeks onder de teller hangt, buiten die differentieel, → `null`.
  - `nietGeplaatst`: na het plaatsen van één van de drie punten via `plaats` blijven er 2 over.
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/analyse-ketens.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer.**
- [ ] **Step 4: Draai de test opnieuw, en ook `analyse-kringen.test.ts`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(arei): ketens, kringgegevens en algemeen differentieel`

---

### Task 12: Regelmechaniek, berichten en registry

**Files:**
- Create: `packages/arei/src/types.ts`, `packages/arei/src/controleer.ts`, `packages/arei/src/berichten/nl.ts`, `packages/arei/src/berichten/fr.ts`, `packages/arei/src/berichten/index.ts`, `packages/arei/src/regelsets/index.ts`, `packages/arei/src/regelsets/arei-2020/index.ts` (regelset met `regels: []`, wordt uitgebreid in Task 13–15)
- Test: `packages/arei/test/controleer.test.ts`, `packages/arei/test/regelsets.test.ts`

**Interfaces:**
- Consumes: `analyseer`, `Analyse`.
- Produces:
  - `type Ernst = "fout" | "waarschuwing" | "info"`
  - `interface Regel { id: string; artikel: string; ernst: Ernst; nagekeken: boolean; berichtSleutels: readonly string[]; check(analyse: Analyse, doc: InstallatieDocument): Omit<Bevinding, "afgeweken">[] }`
  - `interface Regelset { id: string; versie: number; gepubliceerd: boolean; regels: readonly Regel[] }`
  - `interface Bevinding { regelId: string; ernst: Ernst; nodeIds: NodeId[]; berichtSleutel: string; parameters: Record<string, string | number>; afgeweken: boolean }`
  - `controleer(doc: InstallatieDocument, regelset: Regelset): Bevinding[]`
  - `REGELSETS: Readonly<Record<string, Regelset>>`, met de sleutel `"arei-2020@1"`
  - `haalRegelset(sleutel: string): Regelset`: gooit `Error("ONBEKENDE_REGELSET: <sleutel>")`.
  - `BERICHTEN: Readonly<Record<"nl" | "fr", Readonly<Record<string, string>>>>`
  - `formatteerBericht(b: Bevinding, taal: "nl" | "fr"): string`: vervangt `{naam}` door `parameters[naam]` en valt terug op de sleutel als die ontbreekt.

**Gedrag van `controleer`:**
- Roept één keer `analyseer(doc)` aan en daarna `check` van elke regel.
- **Afwijkingen:** `afgeweken` is `true` als er in `doc.afwijkingen` een afwijking bestaat met hetzelfde `regelId` en een `nodeId` uit `bevinding.nodeIds`.
- **Sortering:** eerst op ernst (fout, waarschuwing, info), dan op `regelId`, dan op `nodeIds[0]`.

**Waarborgen in `regelsets.test.ts`:**
- **Publicatie:** voor elke regelset in `REGELSETS` met `gepubliceerd: true` moet elke regel `nagekeken === true` en een niet-leeg `artikel` hebben.
- **Berichten:** elke `berichtSleutel` van elke regel in elke regelset bestaat in `BERICHTEN.nl` en in `BERICHTEN.fr`.

Beide tests slagen nu al met een lege regelset, maar ze bewaken Task 13–15.

- [ ] **Step 1: Schrijf de falende tests.**
  - `controleer` met een nepregelset met één regel die een `waarschuwing` en een `fout` teruggeeft → de fout staat eerst.
  - Een afwijking met hetzelfde `regelId` en `nodeId` → `afgeweken: true`, en een andere `nodeId` → `false`.
  - `formatteerBericht` met de sleutel `"test"` en de nl-tekst `"Kring {kring}: {aantal}"` → `"Kring A: 9"`. Injecteer de nepcatalogus via een optionele derde parameter `catalogus = BERICHTEN`.
  - `haalRegelset("x@9")` gooit een fout.
  - De twee waarborgtests.
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/controleer.test.ts packages/arei/test/regelsets.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de types, `controleer`, de berichten, de registry en de lege regelset `arei-2020@1` (`id: "arei-2020"`, `versie: 1`, `gepubliceerd: false`).
- [ ] **Step 4: Draai de tests opnieuw.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(arei): regelmechaniek, berichtcatalogus en regelset-registry`

---

### Task 13: Voorlopige parameters en regels 1–3

**Files:**
- Create: `packages/arei/src/regelsets/arei-2020/parameters.ts`, `packages/arei/src/regelsets/arei-2020/regels/algemeen-differentieel.ts`, `.../regels/natte-ruimte-differentieel.ts`, `.../regels/doorsnede-beveiliging.ts`
- Modify: `packages/arei/src/regelsets/arei-2020/index.ts`, `packages/arei/src/berichten/nl.ts`, `packages/arei/src/berichten/fr.ts`
- Test: `packages/arei/test/regels/regels-1-3.test.ts`

**Interfaces:**
- Produces:
  - `type Arei2020Parameters = typeof PARAMETERS_AREI_2020_V1`
  - per regel een fabrieksfunctie `maakRegelX(p: Arei2020Parameters): Regel`

**Waarden, exact overnemen en in commentaar markeren als `VOORLOPIG — niet nagekeken tegen AREI`:**

```ts
export const PARAMETERS_AREI_2020_V1 = {
  algemeenDifferentieelMax_mA: 300,
  natteRuimteDifferentieelMax_mA: 30,
  natteRuimtes: ["badkamer", "wasplaats"],
  toestellenAchterLaagGevoelig: ["wasmachine", "droogkast", "vaatwasser"],
  maxStroomPerDoorsnede: [[1.5, 16], [2.5, 20], [4, 25], [6, 32], [10, 40]],   // [mm², A]
  maxContactdozenPerKring: 8,
  minDoorsnedeContactdozen_mm2: 2.5,
  minDoorsnedeVerlichting_mm2: 1.5,
  toestellenEigenKring: ["kookplaat", "oven", "boiler", "laadpaal"],
  polenPerStroomtype: { "2x230V": 2, "3x230V": 3, "3N400V": 4 },
} as const;
```

**Regels:** alle regels hebben `nagekeken: false` en `artikel: ""`. De berichtteksten in nl en fr schrijf je zelf, met de vermelde parameters.

| # | id | ernst | berichtSleutels en parameters | Wanneer |
|---|---|---|---|---|
| 1 | `arei.algemeen-differentieel` | fout | `.ontbreekt` {} op `tellerId` (of `rootId`); `.te-gevoelig-ingesteld` {gevoeligheid, max} op de differentieel | `algemeenDifferentieelId === null` terwijl er ≥ 1 kring is; of zijn `gevoeligheid_mA > algemeenDifferentieelMax_mA` |
| 2 | `arei.natte-ruimte-differentieel` | fout | `.ontbreekt` {reden, max} op het punt; `reden` = de ruimte of de toestelsoort | punt met `ruimte` ∈ `natteRuimtes`, of een toestel met `soort` ∈ `toestellenAchterLaagGevoelig`, zonder differentieel in de keten met `gevoeligheid_mA <= natteRuimteDifferentieelMax_mA` |
| 3 | `arei.doorsnede-beveiliging` | fout | `.te-hoog` {nominaal, doorsnede, max} op de beveiliging; `.onbekende-doorsnede` (ernst `waarschuwing`) {doorsnede} | `minDoorsnede_mm2 !== null` en `nominaal_A` > de maximale stroom voor die doorsnede; staat de doorsnede niet in de tabel → `.onbekende-doorsnede`; `minDoorsnede_mm2 === null` → geen bevinding (Review Focus 4) |

- [ ] **Step 1: Schrijf de falende tests,** per regel met de bouwer, telkens alleen die regel in een eigen `Regelset`:
  - Regel 1:
    - diff 300 bovenaan → `[]`;
    - geen differentieel → `.ontbreekt`;
    - diff 500 → `.te-gevoelig-ingesteld` met `{ gevoeligheid: 500, max: 300 }`.
  - Regel 2:
    - contactdoos in een badkamer achter diff 300 + diff 30 → `[]`;
    - alleen diff 300 → `.ontbreekt` met `reden: "badkamer"`;
    - een wasmachine in de leefruimte zonder diff 30 → `reden: "wasmachine"`.
  - Regel 3:
    - automaat 16 A op 1,5 mm² → `[]`;
    - 20 A op 1,5 mm² → `.te-hoog` met `{ nominaal: 20, doorsnede: 1.5, max: 16 }`;
    - 16 A op 3 mm² → `.onbekende-doorsnede` met ernst `waarschuwing`;
    - een kring met alleen een leiding van 0 mm² → `[]`;
    - een kring zonder leiding → `[]`.
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/regels/regels-1-3.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de parameters, de drie regels en hun berichten (nl en fr), en voeg ze toe aan `arei-2020@1`.
- [ ] **Step 4: Draai `pnpm vitest run packages/arei`.** Verwacht: PASS, ook de waarborg voor berichten uit Task 12.
- [ ] **Step 5: Commit:** `feat(arei): voorlopige parameters en regels algemeen differentieel, natte ruimtes, doorsnede`

---

### Task 14: Regels 4–6

**Files:**
- Create: `.../regels/max-contactdozen.ts`, `.../regels/min-doorsnede.ts`, `.../regels/toestel-eigen-kring.ts`
- Modify: `packages/arei/src/regelsets/arei-2020/index.ts`, de berichten nl en fr
- Test: `packages/arei/test/regels/regels-4-6.test.ts`

**Interfaces:**
- Consumes: `Arei2020Parameters`, `Analyse`, `Regel`.
- Produces: `maakRegelMaxContactdozen`, `maakRegelMinDoorsnede`, `maakRegelToestelEigenKring`.

| # | id | ernst | berichtSleutels en parameters | Wanneer |
|---|---|---|---|---|
| 4 | `arei.kring.max-contactdozen` | fout | `.overschreden` {kring, aantal, max} op `beveiligingId` | `tellingen.contactdozen > maxContactdozenPerKring` |
| 5 | `arei.kring.min-doorsnede` | fout | `.contactdozen` {kring, doorsnede, min}; `.verlichting` {kring, doorsnede, min}, op `beveiligingId` | `minDoorsnede_mm2 !== null` en: de kring heeft contactdozen en de doorsnede < `minDoorsnedeContactdozen_mm2`; of de kring heeft lichtpunten maar geen contactdozen en de doorsnede < `minDoorsnedeVerlichting_mm2` |
| 6 | `arei.toestel.eigen-kring` | fout | `.gedeeld` {kring, toestel}, met `nodeIds` = [toestel, …andere punten van de kring] | de kring bevat een toestel met `soort` ∈ `toestellenEigenKring` én ≥ 1 ander punt |

- [ ] **Step 1: Schrijf de falende tests.**
  - Regel 4: 8 contactdozen → `[]`; 9 → `.overschreden` met `{ kring: "A", aantal: 9, max: 8 }`; één contactdoos met `aantal: 9` → ook `.overschreden`.
  - Regel 5: contactdozen op 1,5 → `.contactdozen`; lichtpunten op 1,5 → `[]`; lichtpunten op 1 → `.verlichting`.
  - Regel 6: een kookplaat alleen → `[]`; een kookplaat met een contactdoos → `.gedeeld` met beide ids; een wasmachine met een contactdoos → `[]` (niet in de lijst).
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/regels/regels-4-6.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de drie regels en hun berichten, en voeg ze toe aan `arei-2020@1`.
- [ ] **Step 4: Draai `pnpm vitest run packages/arei`.** Verwacht: PASS.
- [ ] **Step 5: Commit:** `feat(arei): regels max contactdozen, min doorsnede, eigen kring`

---

### Task 15: Regels 7–9, referentie-installaties en prestatie

**Files:**
- Create: `.../regels/polen-stroomtype.ts`, `.../regels/niet-geplaatst.ts`, `.../regels/leiding-onvolledig.ts`
- Modify: `packages/arei/src/regelsets/arei-2020/index.ts`, de berichten nl en fr, `packages/arei/src/index.ts` (publieke exports: `analyseer`, `controleer`, `haalRegelset`, `REGELSETS`, `formatteerBericht`, `BERICHTEN` en de types)
- Test: `packages/arei/test/regels/regels-7-9.test.ts`, `packages/arei/test/referenties.test.ts`, `packages/arei/test/prestatie.test.ts`

**Interfaces:**
- Produces: de volledige regelset `arei-2020@1` met 9 regels, in de volgorde 1–9, en `gepubliceerd: false`.

| # | id | ernst | berichtSleutels en parameters | Wanneer |
|---|---|---|---|---|
| 7 | `arei.polen.stroomtype` | fout | `.algemeen` {polen, verwacht, stroomtype} op het algemeen differentieel; `.te-veel` {polen, stroomtype} op de beveiliging | `polen` van het algemeen differentieel ≠ `polenPerStroomtype[stroomtype]`; of `stroomtype === "2x230V"` en een `automaat`/`differentieel` heeft `polen > 2` |
| 8 | `arei.situatie.niet-geplaatst` | info | `.punt` {label} | per id in `nietGeplaatst` (label uit `puntLabels`, of `"?"` als die ontbreekt) |
| 9 | `arei.leiding.onvolledig` | info | `.kabeltype` {}; `.doorsnede` {} op de leiding | `kabeltype.trim() === ""`; of `doorsnede_mm2 === 0` |

**Referentie-installaties** (`referenties.test.ts`), gebouwd met de bouwer, met de volledige regelset en zonder plaatsingen:

1. **Appartement** (`2x230V`): diff 300 → bord met deze kringen:
   - automaat 20 → leiding 2,5 → 6 contactdozen in de leefruimte;
   - automaat 16 → leiding 1,5 → 5 lichtpunten;
   - automaat 32 → leiding 6 → kookplaat in de keuken.

   Daarnaast diff 30 in het bord met twee kringen:
   - automaat 20 → leiding 2,5 → wasmachine in de wasplaats;
   - automaat 16 → leiding 2,5 → 2 contactdozen in de badkamer.

   **Verwacht:** nul bevindingen van ernst `fout` of `waarschuwing`; alleen info `arei.situatie.niet-geplaatst`, één per punt.
2. **Rijwoning:** het appartement, plus een kring met automaat 20 → leiding 2,5 → **9** contactdozen.

   **Verwacht:** precies één fout, `arei.kring.max-contactdozen` met `.overschreden`, op die kring.
3. **Woning met laadpaal en zonnepanelen** (`3N400V`): diff 300 met `polen: 4` → bord met:
   - de kringen van het appartement;
   - automaat 32 met `polen: 4` → leiding 10 → laadpaal;
   - automaat 20 → leiding 4 → omvormer.

   **Verwacht:** nul fouten en nul waarschuwingen.

**Prestatie** (`prestatie.test.ts`): een document met 200 kringen, elk een automaat, een leiding en 8 contactdozen, samen 2.000 nodes plus de voeding. Na 5 opwarmrondes is de mediaan van 20 runs van `controleer(doc, haalRegelset("arei-2020@1"))` minder dan 20 ms (spec §5.4). Meet met `performance.now()`.

- [ ] **Step 1: Schrijf de falende tests.**
  - Regel 7: `3N400V` met een algemeen differentieel van 2 polen → `.algemeen` met `{ polen: 2, verwacht: 4, stroomtype: "3N400V" }`; `2x230V` met een automaat van 4 polen → `.te-veel`; een correct aantal polen → `[]`.
  - Regel 8: 3 punten, waarvan 1 geplaatst → 2 bevindingen met labels.
  - Regel 9: `kabeltype: ""` → `.kabeltype`; `doorsnede_mm2: 0` → `.doorsnede`.
  - De referenties en de prestatie zoals hierboven.
- [ ] **Step 2: Draai `pnpm vitest run packages/arei/test/regels/regels-7-9.test.ts packages/arei/test/referenties.test.ts packages/arei/test/prestatie.test.ts`.** Verwacht: FAIL.
- [ ] **Step 3: Implementeer** de regels 7–9 met hun berichten, vul de regelset aan en werk de publieke exports bij. Faalt een referentie op een andere regel dan verwacht, analyseer dan eerst of de regel of de referentie fout is. Pas nooit de verwachting aan zonder dat te melden.
- [ ] **Step 4: Draai `pnpm test && pnpm typecheck`.** Verwacht: de hele suite PASS, typecheck zonder fouten.
- [ ] **Step 5: Commit:** `feat(arei): regels polen, plaatsing, leiding; referentie-installaties en prestatietest`
