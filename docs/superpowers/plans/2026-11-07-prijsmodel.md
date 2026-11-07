# Gratis versie, betalen per project en onderwijs: implementatieplan

> **Voor agents:** VERPLICHTE SUB-SKILL: gebruik superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans om dit plan taak per taak uit te voeren. De stappen gebruiken checkboxen (`- [ ]`).

**Doel:** de proefperiode van 30 dagen vervangen door een gratis versie met limieten per project en een watermerk, met betalen per project, een abonnement zonder limieten, een stempel per project en een onderwijsstatus.

**Architectuur:**

- De toegang wordt per project beslist. Twee pure functies in `server/abonnementen/toegang.ts` doen dat:
  - `bepaalBedrijfsniveau` beslist op het niveau van het bedrijf;
  - `bepaalProjecttoegang` combineert dat met de eigenschappen van het project (gekocht, gestempeld).
- De server dwingt alles af in de klantroutes. De export bepaalt het watermerk.
- Betalen per project hergebruikt de Stripe-poort, de webhook en de boekhouding.
- De editor bewaakt de limiet centraal in `pasToe`.

**Tech stack:** Nuxt 4, h3, Drizzle (PostgreSQL 16, PGlite in Vitest), Better Auth, Stripe-SDK via `StripePoort`, Vitest, Playwright, Nuxt UI.

**Spec:** `docs/superpowers/specs/2026-11-07-elentrik-prijsmodel-design.md`. Lees de spec vóór elke taak: dit plan verwijst ernaar met §-nummers en herhaalt ze niet.

## Globale randvoorwaarden

- **Standaardlimieten:** `GRATIS_MAX_KRINGEN` = 5 en `GRATIS_MAX_SITUATIESCHEMAS` = 1, uit env, als positieve gehele getallen. Een ongeldige waarde laat de start mislukken met de naam van de variabele.
- **Projectprijs:** `STRIPE_PRIJS_PROJECT` is optioneel. Zonder deze waarde is `prijzen.project` null. Vrijgeven geeft dan 409 `VRIJGEVEN_NIET_NODIG`, en de UI toont alleen de abonnementsknop.
- **Wat een kring is:** een node van het type `automaat` of `zekering`. Een situatieschema is elk element van `situatie.paginas`.
- **Foutcodes** in `data.code`: `PROJECT_ALLEEN_LEZEN`, `PROJECT_LIMIET` (beide 402), `PROJECT_AL_GEKOCHT` en `VRIJGEVEN_NIET_NODIG` (beide 409).
- **Watermerkteksten** (nl): "Gratis versie" / "Geen officieel dossier" en "Onderwijsversie" / "Geen officieel dossier". Fr en en zijn vrij te vertalen.
- **Zonder Stripe** (`ingeschakeld: false`) is er geen limiet, geen watermerk van een versie en geen stempel.
- **Testen:** Vitest gebruikt PGlite (`test/db.ts`) en de nep-Stripe (`test/nep-stripe.ts`). Tests raken nooit de database `elentrik` of `.data/bestanden`, en praten nooit met api.stripe.com.
- **Code:** expliciete imports in serverbestanden die Vitest rechtstreeks importeert (ruling E1).
- **Teksten:** UI-teksten komen in `apps/web/i18n/locales/{nl,fr,en}.json`, volgens `docs/vertalingen.md`.
- **Commits:** elke commit is gesigneerd en eindigt met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Tijdelijke bestanden alleen in `.superpowers/sdd/prijsmodel/tmp/`.
- **Commando's:**
  - unit- en API-tests: `pnpm vitest run <pad>` vanuit de root;
  - typecontrole: `pnpm --filter @elentrik/web typecheck`;
  - e2e: zoals in `e2e/abonnement.spec.ts`.

## Reviewfocus

Vijf gevallen die de spec impliceert, maar die geen taak vanzelf test. De bijbehorende test staat in de genoemde taak.

1. **Een gratis project dat al boven de limiet zit en kringen verliest.** Bewaren moet lukken zodra het resultaat binnen de limiet valt. Een wijziging die de telling niet verhoogt, mag ook boven de limiet. (Taak 1: `overschrijdtLimiet`; taak 4: PUT-test.)
2. **Twee tabbladen.** Tab A geeft het project vrij terwijl tab B nog een 402 `PROJECT_LIMIET` krijgt. Na het herladen moet B verder kunnen, zonder dat werk verloren gaat. (Taak 9: storetest op de 402-verwerking die het concept bewaart.)
3. **De webhook komt vóór de terugkeer, of de terugkeer vóór de webhook.** Beide volgordes geven precies één keer `gekocht_op` en geen dubbele aankoop. (Taak 6.)
4. **Een uitgestelde SEPA- of Bancontact-betaling** (`payment_status = unpaid` bij `completed`). Het project wordt pas vrij bij `async_payment_succeeded`, niet eerder. (Taak 6.)
5. **Een export in het Frans of Engels voor een gratis project.** Het watermerk staat in de taal van het dossier, niet in die van de gebruiker. (Taak 5.)

---

### Taak 1: limiet tellen in het model

**Bestanden:**
- Maak: `packages/model/src/limiet.ts`
- Wijzig: `packages/model/src/index.ts` (export)
- Test: `packages/model/test/limiet.test.ts`

**Interfaces:**
- Levert:
  - `export type Limieten = { kringen: number; situatieschemas: number }`
  - `export type Telling = Limieten`
  - `telVoorLimiet(doc: InstallatieDocument): Telling`
  - `overschrijdtLimiet(voor: Telling | null, na: Telling, limieten: Limieten): boolean`. Dit is waar als in `na` een soort boven de limiet zit en hoger is dan in `voor`. `voor = null` betekent een nieuw project; dan geldt elke soort boven de limiet.

- [ ] **Stap 1: schrijf de falende tests.**

```ts
test("telt automaten en zekeringen als kringen", () => {
  // doc met 3 automaten, 2 zekeringen, 1 differentieel en 2 situatiepagina's (waarvan 1 referentieblad)
  expect(telVoorLimiet(doc)).toEqual({ kringen: 5, situatieschemas: 2 });
});
test("nieuw project boven de limiet", () =>
  expect(overschrijdtLimiet(null, { kringen: 6, situatieschemas: 1 }, { kringen: 5, situatieschemas: 1 })).toBe(true));
test("binnen de limiet", () =>
  expect(overschrijdtLimiet(null, { kringen: 5, situatieschemas: 1 }, { kringen: 5, situatieschemas: 1 })).toBe(false));
test("boven de limiet maar dalend of gelijk is toegestaan", () => {
  const l = { kringen: 5, situatieschemas: 1 };
  expect(overschrijdtLimiet({ kringen: 8, situatieschemas: 1 }, { kringen: 7, situatieschemas: 1 }, l)).toBe(false);
  expect(overschrijdtLimiet({ kringen: 8, situatieschemas: 1 }, { kringen: 8, situatieschemas: 1 }, l)).toBe(false);
});
test("boven de limiet en stijgend is geweigerd", () =>
  expect(overschrijdtLimiet({ kringen: 5, situatieschemas: 1 }, { kringen: 5, situatieschemas: 2 }, { kringen: 5, situatieschemas: 1 })).toBe(true));
```

Bouw `doc` met de helpers uit `packages/model/test/hulp.ts`.

- [ ] **Stap 2:** `pnpm vitest run packages/model/test/limiet.test.ts`. Verwacht: FAIL (module bestaat niet).
- [ ] **Stap 3:** implementeer beide functies in `limiet.ts` en exporteer ze uit `index.ts`.
- [ ] **Stap 4:** dezelfde run. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(model): tel kringen en situatieschema's voor de gratis limiet`.

### Taak 2: databaseschema en migratie

**Bestanden:**
- Wijzig: `apps/web/server/db/schema.ts`
- Maak: `apps/web/server/db/migraties/0014_prijsmodel.sql`, plus snapshot en journal via `pnpm --filter @elentrik/web db:generate`, met de handmatige SQL hieronder toegevoegd
- Test: `apps/web/test/prijsmodel-migratie.test.ts`

**Interfaces:**
- Levert:
  - `projecten.gekochtOp` (`gekocht_op`, timestamptz, nullable);
  - `projecten.abonnementStempelOp` (`abonnement_stempel_op`, timestamptz, nullable);
  - `organization.onderwijs` (boolean, not null, standaard false);
  - een check-constraint `organization_vrijgesteld_of_onderwijs` (`NOT (vrijgesteld AND onderwijs)`);
  - de default van `organization.proef_einde` wordt `now()`;
  - een nieuwe tabel `projectaankopen` (Drizzle-naam `projectaankopen`) met de kolommen `id` (uuid pk), `organisatieId`, `projectId` (fk `projecten.id`), `checkoutSessie` (uniek), `status` (text: `open`, `betaald`, `vervallen` of `mislukt`), `aangemaakt` en `betaaldOp` (nullable);
  - een partiële unieke index `projectaankopen_open_uniek` op `project_id` waar `status = 'open'`.
- Handmatige SQL aan het einde van de migratie:
  - `UPDATE projecten SET abonnement_stempel_op = now() WHERE verwijderd IS NULL AND organisatie_id IS NOT NULL;`

- [ ] **Stap 1: schrijf de falende test.** Draai op een PGlite-testdatabase:
  - `"migratie stempelt bestaande projecten"`: maak een project via de migraties tot en met 0013, pas 0014 toe, en verwacht `abonnement_stempel_op` niet null. Volg het patroon dat de andere migratietests in `test/` gebruiken. Is er geen helper om tot een bepaalde migratie te migreren, controleer dan de UPDATE-zin rechtstreeks op een vers gemigreerde database met een ingevoegde rij en een herhaalde UPDATE.
  - `"vrijgesteld en onderwijs samen faalt"`: een insert of update met beide op true faalt op de constraint.
  - `"nieuwe organisatie heeft proef_einde ongeveer nu"`: het verschil is kleiner dan 1 minuut.
- [ ] **Stap 2:** `pnpm vitest run apps/web/test/prijsmodel-migratie.test.ts`. Verwacht: FAIL.
- [ ] **Stap 3:** pas het schema aan, genereer de migratie en voeg de UPDATE toe.
- [ ] **Stap 4:** dezelfde run en `pnpm vitest run apps/web/test/db.test.ts`. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(db): kolommen en tabel voor het prijsmodel`.

### Taak 3: toegangsbeslissing per bedrijf en per project

**Bestanden:**
- Wijzig:
  - `apps/web/shared/abonnement.ts`
  - `apps/web/server/abonnementen/toegang.ts`
  - `apps/web/server/abonnementen/config.ts`
  - `apps/web/server/abonnementen/repo.ts`
  - `apps/web/server/admin/toegangsweergave.ts`
  - `apps/web/shared/admin/toegang.ts`
- Verwijder: `apps/web/server/abonnementen/proef.ts` en `apps/web/test/abonnement-proef.test.ts`
- Wijzig: `apps/web/server/organisaties/registratie.ts`, `apps/web/server/auth/index.ts`. Geen `kenProefperiodeToe` meer; zet `proefEinde = nu` expliciet bij het aanmaken. Laat `proefGebruikt` en de blokkade op invoer ervan staan.
- Test: `apps/web/test/abonnement-toegang.test.ts`, `apps/web/test/abonnement-config.test.ts`, `apps/web/test/admin-toegangsweergave.test.ts`

**Interfaces:**
- Levert, in `shared/abonnement.ts`:
  - `type Bedrijfsniveau = "uit" | "vrijgesteld" | "onderwijs" | "abonnement" | "gratis"`;
  - `ToegangReden` wordt `"uit" | "vrijgesteld" | "onderwijs" | "actief" | "betaling-mislukt" | "proef" | "gratis" | "beeindigd"`. `proef-voorbij` verdwijnt en wordt `gratis`;
  - `Toegang` wordt `{ niveau: Bedrijfsniveau; reden: ToegangReden; proefEinde: string | null; achterstalligTot: string | null }`. `schrijven` verdwijnt;
  - `type Watermerk = "gratis" | "onderwijs" | null`;
  - `type Projecttoegang = { bewerken: boolean; limiet: boolean; watermerk: Watermerk; gekocht: boolean; gestempeld: boolean }`;
  - `AbonnementOverzicht`: `schrijven` verdwijnt, `niveau: Bedrijfsniveau` komt erbij, en `prijzen` wordt `{ maand: Prijs; jaar: Prijs; project: Prijs | null } | null`;
  - de foutcodes uit de globale randvoorwaarden als constanten.
- Levert, in `toegang.ts`:
  - `ToegangInvoer` krijgt `onderwijs: boolean`;
  - `bepaalBedrijfsniveau(i: ToegangInvoer): { niveau: Bedrijfsniveau; reden: ToegangReden }` vervangt `bepaalToegang`. Volg §4.3 van de spec. Bij `gratis` is de reden `betaling-mislukt` (`past_due` ouder dan 14 dagen, of `unpaid`), `beeindigd` (`canceled`, `incomplete_expired` of `paused`), of anders `gratis`;
  - `bepaalProjecttoegang(niveau: Bedrijfsniveau, p: { gekocht: boolean; gestempeld: boolean }): Projecttoegang`, volgens de tabel in §4.3, met gekocht of gestempeld vóór onderwijs;
  - `PROEF_DAGEN` verdwijnt.
- Levert, in `config.ts`:
  - `AbonnementConfig` (ingeschakeld) krijgt `prijzen: { maand: string; jaar: string; project: string | null }` en `limieten: Limieten`;
  - `leesLimieten(env): Limieten` wordt ook gebruikt als abonnementen uit staan. De limieten staan dan wel in de config, maar worden niet toegepast.
- Levert, in `repo.ts`:
  - `toegangVoor(db, organisatieId, config, nu?) → Toegang` (nieuwe vorm);
  - `projecttoegangVoor(db, projectId, config, nu?) → { toegang: Projecttoegang; niveau: Bedrijfsniveau; organisatieId: string } | null`. Leest `gekocht_op` en `abonnement_stempel_op`.
- Levert, in `toegangsweergave.ts`:
  - `AdminToegangGroep` wordt `"uit" | "vrijgesteld" | "onderwijs" | "abonnement" | "betalingsgratie" | "proef" | "gratis"`;
  - `toegangGroepSql` volgt `bepaalBedrijfsniveau`. De pariteitstest moet blijven slagen.

- [ ] **Stap 1: herschrijf de tests.** Herschrijf `abonnement-toegang.test.ts` als tabeltests voor `bepaalBedrijfsniveau`:
  - uit;
  - vrijgesteld;
  - onderwijs;
  - active en trialing;
  - `past_due` op 13 en op 15 dagen;
  - lopende en voorbije proef;
  - canceled.

  Voeg voor elk van de 9 rijen uit de tabel in §4.3 een test van `bepaalProjecttoegang` toe, bijvoorbeeld:

  ```ts
  expect(bepaalProjecttoegang("onderwijs", { gekocht: false, gestempeld: true }))
    .toEqual({ bewerken: false, limiet: false, watermerk: null, gekocht: false, gestempeld: true });
  expect(bepaalProjecttoegang("gratis", { gekocht: false, gestempeld: false }))
    .toEqual({ bewerken: true, limiet: true, watermerk: "gratis", gekocht: false, gestempeld: false });
  ```

  Voeg in `abonnement-config.test.ts` toe:
  - `"limieten standaard 5 en 1"`;
  - `"GRATIS_MAX_KRINGEN=abc faalt met de naam"`;
  - `"STRIPE_PRIJS_PROJECT optioneel"`.
- [ ] **Stap 2:** `pnpm vitest run apps/web/test/abonnement-toegang.test.ts apps/web/test/abonnement-config.test.ts apps/web/test/admin-toegangsweergave.test.ts`. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer de wijzigingen. Pas de aanroepers op de server aan, zodat `pnpm --filter @elentrik/web typecheck` alleen nog fouten geeft in de client en in de routes die taak 4 vervangt (`vereisSchrijfrecht`).
- [ ] **Stap 4:** dezelfde run. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(abonnement): toegang per bedrijfsniveau en per project`.

### Taak 4: handhaving en stempel in de projectroutes

**Bestanden:**
- Wijzig:
  - `apps/web/server/abonnementen/handhaving.ts`
  - `apps/web/server/api/projecten/[id].put.ts`
  - `apps/web/server/api/projecten/index.post.ts`
  - `apps/web/server/api/projecten/uit-document.post.ts`
  - `apps/web/server/api/projecten/[id]/dupliceer.post.ts`
  - `apps/web/server/api/projecten/[id]/bestanden.post.ts`
  - `apps/web/server/projecten/repo.ts`
- Test: `apps/web/test/abonnement-handhaving.test.ts`

**Interfaces:**
- Gebruikt: `projecttoegangVoor`, `toegangVoor` (taak 3), `telVoorLimiet` en `overschrijdtLimiet` (taak 1).
- Levert, in `handhaving.ts`:
  - `vereisProjectBewerking(projectId: string, nieuw?: InstallatieDocument, huidig?: InstallatieDocument): Promise<{ stempel: boolean }>`. Gooit 402 `PROJECT_ALLEEN_LEZEN` of 402 `PROJECT_LIMIET`, met `data: { code, telling, limieten }`. `stempel` is waar als het niveau `abonnement` is;
  - `vereisNieuwProject(organisatieId: string, doc: InstallatieDocument): Promise<{ stempel: boolean }>`. Gooit 402 `PROJECT_LIMIET` bij niveau `gratis` en `overschrijdtLimiet(null, …)`;
  - `vereisSchrijfrecht` verdwijnt.
- Levert, in `projecten/repo.ts`:
  - `bewaarProject`, `maakProject`, `dupliceerProject` en `maakProjectUitDocument` krijgen een laatste optionele parameter `opties?: { stempel?: Date }`. Is die gezet, dan krijgt `abonnement_stempel_op` die waarde (alleen als het veld leeg is) in dezelfde schrijfactie;
  - een kopie zet nooit `gekocht_op`.
- De beheerroute `server/api/admin/projecten/[id]/document.put.ts` blijft ongewijzigd: geen controle en geen stempel.

- [ ] **Stap 1: herschrijf de 402-tests.** Neem in `abonnement-handhaving.test.ts` de bestaande 402-tests en herschrijf ze naar:
  - `"gratis: zesde kring via PUT geeft 402 PROJECT_LIMIET en niets verandert"`;
  - `"gratis project boven de limiet mag bewaren als het aantal kringen daalt"`;
  - `"gratis: nieuw project via uit-document met 6 kringen geeft 402"`;
  - `"dupliceren van een gekocht project geeft een project zonder gekocht_op en zonder stempel (zonder abonnement)"`;
  - `"bewaren tijdens abonnement zet abonnement_stempel_op één keer"` (twee keer bewaren: het tijdstip verandert niet);
  - `"gestempeld project na einde abonnement: PUT 402 PROJECT_ALLEEN_LEZEN, export 201"`;
  - `"onderwijs: 8 kringen bewaren lukt en stempelt niet"`;
  - `"beheercorrectie bewaart boven de limiet zonder stempel"`;
  - `"abonnementen uit: geen limiet en geen stempel"`.
- [ ] **Stap 2:** `pnpm vitest run apps/web/test/abonnement-handhaving.test.ts`. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer de controles in de routes, ná `vereisProjecttoegang` en vóór het bewaren. De PUT leest het huidige document via `haalProject` voor de vergelijking `voor`/`na`. De upload van bestanden roept `vereisProjectBewerking(projectId)` aan zonder document.
- [ ] **Stap 4:** dezelfde run, en `pnpm vitest run apps/web/test/projecten-api.test.ts apps/web/test/dupliceren.test.ts`, of de bestaande projectroutetests als die anders heten. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(projecten): limiet, alleen-lezen en stempel per project`.

### Taak 5: watermerk in de export

**Bestanden:**
- Wijzig:
  - `packages/render/src/teksten/*` (de `TEKSTEN`-structuur per taal)
  - `apps/web/server/exports/repo.ts`
  - `apps/web/server/api/projecten/[id]/exports.post.ts`
- Test: `packages/render/test/` (de bestaande print-test van het watermerk) en `apps/web/test/exports-api.test.ts`

**Interfaces:**
- Gebruikt: `projecttoegangVoor` (taak 3).
- Levert:
  - `TEKSTEN[taal].watermerkGratis` en `TEKSTEN[taal].watermerkOnderwijs`, elk `{ titel: string; ondertitel: string }`;
  - `ExportDeps` krijgt `watermerk?: Watermerk`. De route geeft het mee uit `projecttoegangVoor`. In `maakExport` geldt: `watermerk === "gratis"` of `"onderwijs"` geeft de bijbehorende tekst, anders het watermerk van staging of geen.

- [ ] **Stap 1: schrijf de falende tests.**
  - `"gratis project: pdf-html bevat 'Gratis versie'"`;
  - `"gratis project met dossiertaal fr: watermerk in het Frans"`;
  - `"gestempeld project na einde abonnement: geen watermerk"`;
  - `"onderwijs: 'Onderwijsversie'"`;
  - `"staging en gratis: alleen het gratis watermerk"`.

  Lees de HTML die naar de nep-`maakPdf` gaat (de `vi.mock` in de test vangt de invoer op).
- [ ] **Stap 2:** run de twee testbestanden. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer.
- [ ] **Stap 4:** run opnieuw. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(export): watermerk voor de gratis versie en onderwijs`.

### Taak 6: betalen per project op de server

**Bestanden:**
- Wijzig:
  - `apps/web/server/abonnementen/stripe.ts`
  - `apps/web/server/abonnementen/webhook.ts`
  - `apps/web/server/abonnementen/beheer.ts` (prijzen met `project`)
  - `apps/web/test/nep-stripe.ts`
- Maak:
  - `apps/web/server/abonnementen/projectaankoop.ts`
  - `apps/web/server/api/projecten/[id]/vrijgeven.post.ts`
  - `apps/web/server/api/projecten/[id]/vrijgave/synchroniseer.post.ts`
- Test: `apps/web/test/projectaankoop.test.ts`

**Interfaces:**
- In `StripePoort`:
  - `maakProjectCheckout(i: { klantId: string; prijsId: string; organisatieId: string; projectId: string; succesUrl: string; annuleerUrl: string; locale: Taal }): Promise<{ id: string; url: string }>`. Modus `payment`, `automatic_tax`, `billing_address_collection: "required"`, `tax_id_collection`, `customer_update { address: "auto", name: "auto" }`, `invoice_creation.enabled = true`, metadata `{ organisatieId, projectId, soort: "project" }`;
  - `StripeCheckout` krijgt `metadata: Record<string, string>` en `betaalstatus: "paid" | "unpaid" | "no_payment_required" | null`;
  - `Gebeurtenis` krijgt `metadata: Record<string, string>` en `betaalstatus`, voor `checkout.session`.
- In `projectaankoop.ts`:
  - `startProjectaankoop(db, stripe, config, i: { organisatieId: string; projectId: string; eigenaarEmail: string; locale: Taal }, nu?): Promise<{ url: string }>`. Gebruikt een advisory lock `projectaankoop:<projectId>`. Weigert met 409 `PROJECT_AL_GEKOCHT`, of met 409 `VRIJGEVEN_NIET_NODIG` als het niveau niet `gratis` is of `prijzen.project` null is. Maakt de klant aan via dezelfde weg als `startCheckout`: zoek of maak de klant en voeg een rij `abonnementen` toe. Laat een open sessie eerst vervallen. Maakt de sessie aan en voegt een rij `open` toe;
  - `verwerkProjectsessie(db, sessie: { id: string; metadata: Record<string, string>; betaalstatus: … }, uitkomst: "betaald" | "mislukt" | "vervallen", nu?)`. Is idempotent. Bij `betaald` zet ze de aankoop en `projecten.gekocht_op` (alleen als die leeg is), in één transactie.
- In `webhook.ts`: de events voor checkout-sessies met `metadata.soort === "project"` gaan naar `verwerkProjectsessie`, vóór `synchroniseerKlant`:
  - `completed` met betaalstatus `paid`, of `async_payment_succeeded`: betaald;
  - `async_payment_failed`: mislukt;
  - `expired`: vervallen.

  Voeg `checkout.session.async_payment_succeeded` en `checkout.session.expired` toe aan de verwerkte types. `invoice.paid` blijft doorsturen naar de boekhouding.
- De routes, beide met `vereisLid(event, { rol: "eigenaar" })` en `vereisProjecttoegang`:
  - `POST /api/projecten/[id]/vrijgeven`, met `succesUrl` `/projecten/{id}?vrijgave={CHECKOUT_SESSION_ID}` en `annuleerUrl` `/projecten/{id}`;
  - `POST /api/projecten/[id]/vrijgave/synchroniseer { sessie }`. Haalt de sessie op; past ze niet bij de organisatie of het project, dan volgt 404. Anders `verwerkProjectsessie` volgens de betaalstatus.
- `GET /api/abonnement` geeft `prijzen.project` mee via `haalPrijs`, met dezelfde cache. `interval` mag voor een eenmalige prijs `"month"` zijn. Voeg daarom `interval: "month" | "year" | "eenmalig"` toe aan `Prijs`.

- [ ] **Stap 1: schrijf de falende tests.**
  - `"eigenaar start vrijgave: checkout in modus payment met metadata"`;
  - `"lid krijgt 403"`;
  - `"al gekocht: 409 PROJECT_AL_GEKOCHT"`;
  - `"tijdens abonnement: 409 VRIJGEVEN_NIET_NODIG"`;
  - `"onderwijs: 409 VRIJGEVEN_NIET_NODIG"`;
  - `"tweede start laat de eerste sessie vervallen"`;
  - `"webhook completed+paid zet gekocht_op"`;
  - `"webhook completed+unpaid zet niets, async_payment_succeeded daarna wel"`;
  - `"synchroniseer vóór webhook en webhook erna: één keer gekocht_op, aankoop betaald"`;
  - `"synchroniseer met sessie van ander project: 404"`;
  - `"invoice.paid van een projectaankoop gaat naar de boekhouding"`.
- [ ] **Stap 2:** `pnpm vitest run apps/web/test/projectaankoop.test.ts apps/web/test/abonnement-webhook.test.ts`. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer, en breid de nep-Stripe uit met `maakProjectCheckout` en een helper om een sessie op betaald te zetten.
- [ ] **Stap 4:** dezelfde run, en `pnpm vitest run apps/web/test/abonnement-api.test.ts`. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(abonnement): een project vrijgeven met een eenmalige betaling`.

### Taak 7: projecttoegang in de API-antwoorden

**Bestanden:**
- Wijzig:
  - `apps/web/shared/projecten.ts`
  - `apps/web/server/api/projecten/[id].get.ts`
  - `apps/web/server/projecten/repo.ts` (`lijstProjecten`)
  - `apps/web/server/api/projecten/index.get.ts`
- Test: de bestaande projecten-API-test

**Interfaces:**
- Levert:
  - `Project` krijgt `toegang: Projecttoegang` en `limieten: Limieten | null` (null als abonnementen uit staan);
  - `ProjectInLijst` krijgt `label: "gratis" | "vrijgegeven" | "alleen-lezen" | null`. De regel: alleen bij niveau `gratis`. `bewerken` onwaar geeft `alleen-lezen`; gekocht geeft `vrijgegeven`; anders `gratis`.

- [ ] **Stap 1: schrijf de falende tests.**
  - `"GET project geeft toegang en limieten"`;
  - `"lijst: labels gratis, vrijgegeven en alleen-lezen bij gratis bedrijf; null bij abonnement"`.
- [ ] **Stap 2:** run. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer.
- [ ] **Stap 4:** run. Verwacht: PASS.
- [ ] **Stap 5:** commit `feat(projecten): toegang en label per project in de API`.

### Taak 8: sessie, banner en abonnementspagina

**Bestanden:**
- Wijzig:
  - `apps/web/app/stores/sessie.ts`
  - `apps/web/app/abonnement/weergave.ts`
  - `apps/web/app/components/AbonnementBanner.vue`
  - de pagina `/abonnement` (`apps/web/app/pages/abonnement.vue` of de bestaande component)
  - `apps/web/app/pages/index.vue`
  - `apps/web/app/composables/useAlleenLezen.ts`
  - de drie locales
- Test: `apps/web/test/abonnement-weergave.test.ts`, `apps/web/test/abonnement-client.test.ts`

**Interfaces:**
- Gebruikt: `Toegang` en `AbonnementOverzicht` (taak 3), `prijzen.project` (taak 6).
- Levert:
  - `bannerVoor(toegang, rol, nu)`: de soort `alleen-lezen` verdwijnt. `proef` verschijnt alleen bij reden `proef` (de overgang); `betaling` blijft;
  - `paginaWeergave` geeft `blokken: { gratis: { kringen: number; situatieschemas: number }; project: { prijs: { excl: string; incl: string } } | null; kaarten: … }` en `melding: "lid" | "uit" | "prijzen" | "onderwijs" | null`;
  - `behandelSchrijfweigering` herkent `PROJECT_ALLEEN_LEZEN` en `PROJECT_LIMIET` in plaats van `ABONNEMENT_VEREIST`, en geeft `"limiet" | "alleen-lezen" | false` terug;
  - op `index.vue` is een nieuw project altijd mogelijk (`kanSchrijven` verdwijnt).

- [ ] **Stap 1: herschrijf de tests.** Herschrijf `abonnement-weergave.test.ts`:
  - `"geen alleen-lezenbanner meer bij gratis"`;
  - `"proefbanner alleen tijdens de overgangsproef"`;
  - `"pagina toont projectblok met prijs"`;
  - `"onderwijs: melding onderwijs zonder kaarten"`;
  - `"schrijfweigering PROJECT_LIMIET geeft 'limiet'"`.
- [ ] **Stap 2:** run. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer, met de teksten in nl, fr en en. Gebruik de formuleringen uit §1 en §4.7 van de spec.
- [ ] **Stap 4:** run. `pnpm --filter @elentrik/web typecheck` mag nu alleen nog fouten geven in de editor en het beheerscherm.
- [ ] **Stap 5:** commit `feat(abonnement): pagina en banner voor gratis, per project en abonnement`.

### Taak 9: editor — limiet, teller, venster, alleen-lezen en vrijgave

**Bestanden:**
- Wijzig:
  - `apps/web/app/stores/editor.ts`
  - `apps/web/app/components/editor/ProjectEditor.vue`
  - `apps/web/app/components/editor/AfdrukVoorbeeld.vue`
  - de projectlijst (`apps/web/app/pages/index.vue`, of de lijstcomponent die `ProjectInLijst` toont)
- Maak:
  - `apps/web/app/components/editor/LimietDialoog.vue`
  - `apps/web/app/components/editor/LimietTeller.vue`
- Test: `apps/web/test/editor-store.test.ts`, `apps/web/test/editor-alleen-lezen.test.ts`

**Interfaces:**
- Gebruikt: `Project.toegang` en `Project.limieten` (taak 7), `overschrijdtLimiet` (taak 1), `behandelSchrijfweigering` (taak 8), en de routes uit taak 6.
- Levert, in de store:
  - `zetLimiet(limieten: Limieten | null)`;
  - `limietGeweigerd: Ref<Telling | null>`. Gezet wanneer `pasToe` een resultaat weigert omdat `overschrijdtLimiet(telVoorLimiet(huidig), telVoorLimiet(resultaat.doc), limieten)` waar is. Het document en de undo-stapel blijven dan ongewijzigd;
  - `wisLimietGeweigerd()`.

  Zo gaan ook `pasToeMetBehoud` en alle aanroepen vanuit de situatiestore via de controle.
- Levert, in `ProjectEditor.vue`:
  - **Alleen-lezen** is `!project.toegang.bewerken || autosave.alleenLezen`. De organisatiecontrole via `sessie.organisaties[].toegang.schrijven` verdwijnt.
  - **Een 402 `PROJECT_LIMIET`** bij het bewaren: de wijziging blijft een lokaal concept (zoals nu bij een 402), en `LimietDialoog` gaat open.
  - **Het limietvenster:**
    - voor een eigenaar: de knoppen "Dit project vrijgeven" (vóór de doorverwijzing eerst de autosave laten doorlopen, dan `POST /vrijgeven`) en "Een abonnement nemen";
    - voor een lid: de tekst uit §4.7, zonder knoppen;
    - zonder `prijzen.project`: alleen de abonnementsknop.
  - **De balk** voor een gestempeld project dat niet bewerkbaar is, met de tekst uit §4.7, en voor een eigenaar de knoppen.
  - **Met `?vrijgave=<id>` in de URL:** synchroniseren, het project opnieuw laden, de query wissen en een toast "Dit project is vrijgegeven" tonen.
- `LimietTeller` toont "x van y kringen" en "x van y situatieschema's" zolang `toegang.limiet` waar is.
- `AfdrukVoorbeeld` geeft `watermerk: TEKSTEN[taal].watermerkGratis` of `watermerkOnderwijs` mee volgens `project.toegang.watermerk`.
- De projectlijst toont `label` als `UBadge`.

- [ ] **Stap 1: schrijf de falende storetests.**
  - `"pasToe weigert zesde kring bij limiet en zet limietGeweigerd"`;
  - `"sjabloon dat over de limiet gaat wordt niet toegepast, undo-stapel ongewijzigd"`;
  - `"tweede situatiepagina via situatiestore geweigerd"`;
  - `"kring verwijderen boven de limiet mag"`;
  - `"zonder limieten (null) geen controle"`;
  - `"402 PROJECT_LIMIET bij bewaren bewaart concept en opent venster"` (reviewfocus 2).
- [ ] **Stap 2:** run. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer de store, de componenten en de teksten in nl, fr en en.
- [ ] **Stap 4:** run, en `pnpm --filter @elentrik/web typecheck`. Verwacht: PASS, behalve in het beheerscherm (taak 10).
- [ ] **Stap 5:** commit `feat(editor): gratis limiet, vrijgeven en alleen-lezen per project`.

### Taak 10: beheerscherm

**Bestanden:**
- Wijzig:
  - `apps/web/server/admin/bedrijfsrechten.ts`
  - `apps/web/app/components/admin/AdminToegang.vue`
  - `apps/web/app/components/admin/AdminRecords.vue`
  - `apps/web/app/composables/useAdminApi.ts`
  - de beheerweergave van een project (de bestaande projectdetailcomponent onder `app/components/admin/`)
  - de locales
- Maak: `apps/web/server/api/admin/organisaties/[id]/onderwijs.put.ts`
- Test: `apps/web/test/admin-bedrijfsrechten.test.ts`, `apps/web/test/admin-projecten.test.ts`

**Interfaces:**
- Levert:
  - `zetOnderwijs(db, actor, id, invoer)`, naar het voorbeeld van `zetVrijstelling`: dezelfde invoer met `verwacht` en `stripeBevestigd`, een auditregel van het soort `organisatie_onderwijs`, en 409 als het bedrijf vrijgesteld is;
  - `zetVrijstelling` weigert met 409 als het bedrijf onderwijs heeft;
  - de beheerdetails van een project geven `gekochtOp`, `abonnementStempelOp` en de lijst `projectaankopen` mee;
  - de groepen in de filter volgen `AdminToegangGroep` uit taak 3. De knop "Proef verlengen" krijgt het label "Tijdelijke volledige toegang".

- [ ] **Stap 1: schrijf de falende tests.**
  - `"onderwijs aanzetten schrijft audit en wijzigt niveau"`;
  - `"onderwijs op vrijgesteld bedrijf: 409"`;
  - `"vrijstelling op onderwijsbedrijf: 409"`;
  - `"projectdetails tonen gekocht en stempel"`.
- [ ] **Stap 2:** run. Verwacht: FAIL.
- [ ] **Stap 3:** implementeer.
- [ ] **Stap 4:** run, en `pnpm --filter @elentrik/web typecheck`. Verwacht: PASS zonder fouten.
- [ ] **Stap 5:** commit `feat(admin): onderwijsstatus en projectaankopen`.

### Taak 11: e2e, configuratie en documentatie

**Bestanden:**
- Maak: `apps/web/e2e/prijsmodel.spec.ts`
- Wijzig:
  - `apps/web/e2e/abonnement.spec.ts` (proef- en alleen-lezenverwachtingen)
  - `apps/web/e2e/hulp/database.ts` (helpers `zetOnderwijs`, `stempelProject`)
  - `.env.example`
  - de deploydocumentatie onder `deploy/nas/` die de Stripe-variabelen opsomt
  - `docs/backlog/2026-11-07-proefperiode-en-gratis-versie.md` (A, B en C als gepland markeren)

**Interfaces:**
- Gebruikt: alles hierboven. De lokale nep-Stripe van de e2e, zoals in `abonnement.spec.ts`.
- Levert: de nieuwe env-variabelen zonder waarden in `.env.example`: `STRIPE_PRIJS_PROJECT`, `GRATIS_MAX_KRINGEN`, `GRATIS_MAX_SITUATIESCHEMAS`.

- [ ] **Stap 1: schrijf de scenario's.**
  - `"gratis: vijf kringen, zesde opent venster, vrijgeven via nep-Stripe, zesde kring toevoegen lukt, export zonder watermerk"`;
  - `"lid ziet venster zonder betaalknop"`;
  - `"gestempeld project na einde abonnement: alleen-lezenbalk, export zonder watermerk"`;
  - `"onderwijs: acht kringen, export met Onderwijsversie"`.

  Controleer het watermerk via de HTML die de exportroute naar Gotenberg stuurt, of via de PDF-tekst als de e2e-omgeving Gotenberg draait. Volg wat `export.spec.ts` doet.
- [ ] **Stap 2:** run de e2e voor `prijsmodel.spec.ts` en `abonnement.spec.ts`. Verwacht: FAIL vóór de aanpassingen aan de hulpcode en de oude verwachtingen.
- [ ] **Stap 3:** werk de hulpcode, `.env.example` en de documentatie bij.
- [ ] **Stap 4:** de volledige verificatie:
  - `pnpm test`;
  - `pnpm --filter @elentrik/web typecheck`;
  - de e2e van `prijsmodel.spec.ts`, `abonnement.spec.ts`, `export.spec.ts` en `admin-dashboard.spec.ts`.

  Verwacht: alles groen.
- [ ] **Stap 5:** commit `test(e2e): prijsmodel; docs: nieuwe omgevingsvariabelen`.
