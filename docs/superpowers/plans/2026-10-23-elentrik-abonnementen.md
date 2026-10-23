# Abonnementen met Stripe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Organisaties krijgen een proefperiode van 30 dagen en daarna een maand- of jaarabonnement via Stripe. Zonder abonnement wordt de app alleen-lezen, en elke betaalde factuur gaat naar de boekhoudinbox.

**Architecture:**
- **Pure kern:** een pure toegangsbeslissing (`bepaalToegang`) en een keuze van het gevolgde abonnement (`kiesGevolgdAbonnement`).
- **Stripe-poort:** een kleine interface rond de Stripe-SDK, met een nep-implementatie voor de tests.
- **Server:** de server synchroniseert altijd vanuit Stripe (bron van waarheid) via de webhook en na Checkout. Wijzigende projectroutes vragen `vereisSchrijfrecht` (402).
- **Client:** leest de toegang uit `/api/mij`, toont `/abonnement` met banners, en zet de editor in een alleen-lezenmodus.

**Tech Stack:**
- Nuxt 4, h3, Drizzle 0.45 op PostgreSQL 16 (tests: PGlite);
- Better Auth 1.7.7 (organization-plugin);
- de npm-library `stripe` (nieuw, exact vastgepind);
- nodemailer 10, Pinia, Nuxt UI 4, Vitest en Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-elentrik-abonnementen-design.md` (goedgekeurd). §5b is bindend.

## Global Constraints

**Stripe en configuratie**
- **Stripe-library:** `stripe` op een exact vastgepinde versie, de laatste stabiele die minstens 14 dagen vóór 2026-10-23 uitkwam (`pnpm --filter @elentrik/web add stripe@<x.y.z> --save-exact`). De API-versie is vastgepind in de client. **Geen** `@better-auth/stripe`.
- **Env-namen:** `STRIPE_GEHEIME_SLEUTEL`, `STRIPE_WEBHOOK_GEHEIM`, `STRIPE_PRIJS_MAAND`, `STRIPE_PRIJS_JAAR`, `BOEKHOUDING_INBOX`, en alleen voor tests `STRIPE_API_BASIS`.
  - Ze staan zonder waarden in `.env.example`.
  - Ze worden nooit gelogd, nooit naar de client gestuurd en nooit gecommit. Hetzelfde geldt voor het e-mailadres in `BOEKHOUDING_INBOX`.
- **Abonnementen uit** (zonder `STRIPE_GEHEIME_SLEUTEL`): geen proefperiode, geen 402, en de pagina zegt "Betalen is nog niet ingesteld".

**Vaste waarden**
- **Proefperiode:** 30 dagen (`PROEF_DAGEN = 30`), alleen voor het eerste bedrijf dat iemand zelf aanmaakt (`user.proef_gebruikt`).
- **Achterstallige betaling:** schrijfrecht tot 14 dagen na de eerste `past_due` (`ACHTERSTALLIG_DAGEN = 14`).
- **Trial-marge:** `trial_end` alleen als `proef_einde` meer dan 48 uur in de toekomst ligt (`TRIAL_MARGE_UUR = 48`).
- **Prijzencache:** 10 minuten (`PRIJS_CACHE_MS = 600_000`).
- **Volgorde van het levendigste abonnement:** `active > trialing > past_due > unpaid > paused > incomplete > canceled > incomplete_expired`, met het nieuwste bij een gelijke status.

**Foutcodes en headers**
- **Foutcodes in `data.code`:** `ABONNEMENT_VEREIST` (402, met `data.reden`), `ABONNEMENT_BESTAAT` (409), `GEEN_KLANT` (409) en `ABONNEMENTEN_UIT` (409).
- **Wijzigende routes van eigenaars** sturen `x-elentrik-organisatie` mee (plan 6, R10) en lopen via `defineBeveiligdeHandler`.
- **De webhook** is `{ publiek: true }` en staat met naam in `PUBLIEKE_ROUTES` (`test/routes.ts`).

**Toegang en handhaving**
- **402 alleen op:**
  - `POST /api/projecten`;
  - `PUT /api/projecten/:id`;
  - `POST /api/projecten/:id/dupliceer`;
  - `POST /api/projecten/:id/bestanden`.
- **Nooit 402:** lezen, exports, verwijderen, bedrijfsgegevens en logo, de naam, leden, uitnodigingen, wisselen, `/api/abonnement/*` en de webhook.
- **Checkout:**
  - `mode: "subscription"`;
  - `automatic_tax: { enabled: true }`;
  - `tax_id_collection: { enabled: true }`, niet verplicht;
  - `billing_address_collection: "required"`;
  - `customer_update: { address: "auto", name: "auto" }`;
  - metadata `organisatieId` op de sessie en in `subscription_data`;
  - `success_url` = `${basis}/abonnement?terug={CHECKOUT_SESSION_ID}`, en `cancel_url` = `${basis}/abonnement`.

**Werkwijze en veiligheid**
- **Tests:** de automatische tests praten nooit met de echte Stripe-API en gebruiken nooit echte sleutels. De database `elentrik` en `apps/web/.data/bestanden` worden nooit geraakt (alleen migraties). E2E draait tegen `elentrik_e2e`.
- **UI-teksten:** in het Nederlands, via `i18n/locales/nl.json`.
- **Clean room:** geen code, symbolen of tekst van andere software.
- **Expliciete imports in servercode die Vitest importeert,** zoals de bestaande modules (ruling E1).
- **Commits:** ondertekend (1Password), met de afsluiting `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nooit `--no-gpg-sign`. Niet pushen.

## Review Focus

1. **Proefperiode verloopt tijdens het tekenen.** Autosave krijgt een 402. De wijzigingen blijven als lokaal concept staan, de editor gaat naar alleen-lezen, en er volgt geen herhaling en geen generieke foutmelding. Test: Task 7.
2. **Twee eigenaars klikken tegelijk op "Kies".** Er ontstaat precies één Stripe-klant, en de eerste open sessie vervalt. Test: Task 4.
3. **Het eerste webhook-event komt aan terwijl `stripe_abonnement_id` nog leeg is,** of events komen in de verkeerde volgorde. De synchronisatie vult de rij met het levendigste abonnement. Test: Task 5.
4. **De projectenlijst staat open terwijl de proef verloopt.** "Nieuw project" geeft een 402. De client toont de alleen-lezenmelding en ververst de sessie, in plaats van een generieke fout. Test: Task 6.
5. **Stripe is onbereikbaar bij het openen van `/abonnement`.** `prijzen: null`, de status blijft zichtbaar, en de kaarten tonen "Prijzen konden niet geladen worden". Test: Task 4 (API) en Task 6 (pagina).

---

### Task 1: Gegevens, proefperiode en toegangsbeslissing

**Files:**
- Create:
  - `apps/web/server/db/migraties/0007_abonnementen.sql`, plus de meta-snapshot via `pnpm --filter @elentrik/web db:generate`;
  - `apps/web/shared/abonnement.ts`;
  - `apps/web/server/abonnementen/toegang.ts`;
  - `apps/web/server/abonnementen/proef.ts`.
- Modify:
  - `apps/web/server/db/schema.ts`: de nieuwe tabellen en kolommen;
  - `apps/web/server/organisaties/registratie.ts`, rond r. 78: na de insert van de organisatie;
  - `apps/web/server/auth/index.ts`: `organizationHooks.afterCreateOrganization`, en `proefGebruikt` als `additionalFields` met `input: false`, zoals `laatsteOrganisatieId`.
- Test: `apps/web/test/abonnement-toegang.test.ts`, `apps/web/test/abonnement-proef.test.ts`.

**Interfaces:**
- Produces, in `shared/abonnement.ts`:
  ```ts
  export type Formule = "maand" | "jaar";
  export type AbonnementStatus = "trialing" | "active" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused";
  export type ToegangReden = "uit" | "vrijgesteld" | "actief" | "betaling-mislukt" | "proef" | "proef-voorbij" | "beeindigd";
  export type Toegang = { schrijven: boolean; reden: ToegangReden; proefEinde: string | null };
  export const ABONNEMENT_VEREIST = "ABONNEMENT_VEREIST";
  export const ABONNEMENT_BESTAAT = "ABONNEMENT_BESTAAT";
  export const GEEN_KLANT = "GEEN_KLANT";
  export const ABONNEMENTEN_UIT = "ABONNEMENTEN_UIT";
  ```
- Produces, in `server/abonnementen/toegang.ts`:
  - `PROEF_DAGEN = 30` en `ACHTERSTALLIG_DAGEN = 14`;
  - `bepaalToegang(i: { nu: Date; ingeschakeld: boolean; proefEinde: Date; vrijgesteld: boolean; abonnement: { status: AbonnementStatus; achterstalligSinds: Date | null } | null }): { schrijven: boolean; reden: ToegangReden }`;
  - `kiesGevolgdAbonnement<T extends { status: AbonnementStatus; aangemaakt: Date }>(lijst: T[]): { gevolgd: T | null; dubbel: boolean }`.
- Produces, in `server/db/index.ts`: `export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];` (bestaat nog niet).
- Produces, in `server/abonnementen/proef.ts`: `kenProefperiodeToe(db: Db | Tx, i: { organisatieId: string; gebruikerId: string; nu: Date }): Promise<Date>`.
  - Vergrendelt de gebruikersrij (`for update`).
  - Als `proefGebruikt` onwaar is: `proefEinde = nu + 30 dagen` en `proefGebruikt = true`. Anders: `proefEinde = nu`.
  - Schrijft `organization.proefEinde` en geeft het terug.
- Produces, in `schema.ts`:
  - `organization.proefEinde` (`proef_einde`, timestamptz, niet null, default `now() + interval '30 days'`);
  - `organization.vrijgesteld` (default false);
  - `user.proefGebruikt` (`proef_gebruikt`, default false);
  - tabel `abonnementen`, met de kolommen uit spec §4.1: `organisatieId` (uniek, FK), `stripeKlantId` (uniek), `stripeAbonnementId` (uniek, nullable), `status` (text, nullable), `formule` (text, nullable), `periodeEinde`, `opgezegdOpPeriodeEinde` (default false), `achterstalligSinds`, `openCheckoutSessie`, `aangemaakt` en `bijgewerkt`;
  - tabel `stripeEvents` (`stripe_events`: `id` als text-PK, `verwerkt`);
  - tabel `doorgestuurdeFacturen` (`doorgestuurde_facturen`: `stripeFactuurId` als text-PK, `nummer`, `verstuurd`).

- [ ] **Step 1: Schrijf de falende tests voor `bepaalToegang` en `kiesGevolgdAbonnement`**

In `test/abonnement-toegang.test.ts`, met `nu = new Date("2026-11-01T12:00:00Z")`:
- `ingeschakeld: false` → `{ schrijven: true, reden: "uit" }`, ook met een verlopen proef en `abonnement: canceled`.
- `vrijgesteld` → `{ true, "vrijgesteld" }`.
- `active` en `trialing` → `{ true, "actief" }`.
- `past_due` met `achterstalligSinds = nu − 14 d + 1 ms` → `{ true, "betaling-mislukt" }`. Met exact `nu − 14 d`, en met een verlopen proef → `{ false, "betaling-mislukt" }`.
- Geen abonnement en `proefEinde = nu + 1 ms` → `{ true, "proef" }`. Met `proefEinde = nu` → `{ false, "proef-voorbij" }`.
- `canceled`, `incomplete_expired`, `unpaid`, `incomplete` en `paused`, elk met een verlopen proef:
  - `unpaid` → `{ false, "betaling-mislukt" }`;
  - `incomplete` → `{ false, "proef-voorbij" }`;
  - de andere drie → `{ false, "beeindigd" }`.
- `incomplete` met een lopende proef → `{ true, "proef" }`.
- `kiesGevolgdAbonnement`:
  - `[canceled(nieuw), active(oud)]` → gevolgd is `active`, `dubbel: false`;
  - `[active(oud), active(nieuw)]` → het nieuwste, met `dubbel: true`;
  - `[past_due, trialing]` → `trialing`, met `dubbel: true` (beide levend);
  - `[]` → `{ gevolgd: null, dubbel: false }`.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-toegang.test.ts`
Expected: FAIL (de module bestaat niet).

- [ ] **Step 3: Implementeer `shared/abonnement.ts` en `server/abonnementen/toegang.ts`**

De regels in de volgorde van spec §4.2. "Levend" betekent `active`, `trialing` of `past_due`.

- [ ] **Step 4: Schrijf de falende tests voor de proefperiode en de migratie**

In `test/abonnement-proef.test.ts`, met PGlite (`maakTestDb`):
- `kenProefperiodeToe` voor een nieuwe gebruiker → `nu + 30 d`, en `proefGebruikt` is daarna true. Een tweede keer voor dezelfde gebruiker → `nu`.
- **Registratiepad:** `richtEersteOrganisatieIn` (registratie.ts) geeft de nieuwe organisatie `proefEinde ≈ nu + 30 d` (binnen 5 s).
- **Better Auth-pad:** dezelfde gebruiker maakt een tweede organisatie via `auth.api.createOrganization` → die krijgt `proefEinde ≈ nu`.
- **Uitnodiging:** een gebruiker die een uitnodiging aanvaardt, houdt `proefGebruikt = false`.
- **Migratie:** een organisatie die rechtstreeks in de tabel komt (zoals `maakTestOrganisatie`) krijgt de DB-default `≈ now() + 30 d`.
- **Kolommen:** de migratie maakt `abonnementen`, `stripe_events` en `doorgestuurde_facturen` aan, en `vrijgesteld` staat standaard op false.

- [ ] **Step 5: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-proef.test.ts`
Expected: FAIL.

- [ ] **Step 6: Implementeer het schema, de migratie, `kenProefperiodeToe` en de twee aanroepen**

De migratie bevat:
- `ADD COLUMN proef_einde timestamptz NOT NULL DEFAULT (now() + interval '30 days')`, wat bestaande rijen het migratiemoment + 30 d geeft;
- `UPDATE "user" SET proef_gebruikt = true WHERE id IN (SELECT user_id FROM member WHERE role = 'owner')`.

De aanroepen:
- **Registratiepad:** binnen de bestaande transactie van `richtEersteOrganisatieIn`.
- **Better Auth-pad:** in `afterCreateOrganization` met `{ organization.id, user.id }`.
- `user.proefGebruikt` krijgt `input: false`. Breid de bestaande weigering in de `before`-hook uit, zodat `/update-user` en `/sign-up/email` ook `proefGebruikt` weigeren, zoals `laatsteOrganisatieId`.

- [ ] **Step 7: Draai de tests en de bestaande suite**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-toegang.test.ts test/abonnement-proef.test.ts test/auth.test.ts test/overname.test.ts test/organisaties.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/server/db apps/web/shared/abonnement.ts apps/web/server/abonnementen apps/web/server/organisaties/registratie.ts apps/web/server/auth/index.ts apps/web/test/abonnement-toegang.test.ts apps/web/test/abonnement-proef.test.ts
git commit -m "feat(web): proefperiode per eerste eigen bedrijf en toegangsbeslissing voor abonnementen"
```

---

### Task 2: Configuratie en Stripe-poort

**Files:**
- Create: `apps/web/server/abonnementen/config.ts`, `apps/web/server/abonnementen/stripe.ts`, `apps/web/test/nep-stripe.ts` (nep-poort voor de Vitest-tests).
- Modify: `apps/web/package.json` (dependency `stripe`), `apps/web/.env.example`.
- Test: `apps/web/test/abonnement-config.test.ts`.

**Interfaces:**
- Consumes: `AbonnementStatus` (Task 1).
- Produces, in `config.ts`:
  ```ts
  export type AbonnementConfig =
    | { ingeschakeld: false }
    | { ingeschakeld: true; sleutel: string; webhookGeheim: string | null; prijzen: { maand: string; jaar: string }; boekhoudingInbox: string | null; apiBasis: URL | null };
  export function leesAbonnementConfig(env?: Record<string, string | undefined>): AbonnementConfig;
  export type Abonnementen = { config: AbonnementConfig; stripe: StripePoort | null };
  export function gebruikAbonnementen(): Abonnementen;      // eenmalig uit process.env
  export function zetAbonnementen(a: Abonnementen | undefined): void; // alleen voor tests
  ```
- Produces, in `stripe.ts`:
  ```ts
  export type StripeAbonnement = { id: string; klantId: string; status: AbonnementStatus; prijsId: string | null; periodeEinde: Date | null; opgezegdOpPeriodeEinde: boolean; aangemaakt: Date };
  export type StripeFactuur = { id: string; nummer: string | null; klantId: string; abonnementId: string | null; bedragBetaald: number; pdfUrl: string | null; reden: string | null };
  export type StripePrijs = { id: string; bedrag: number; munt: string; interval: "month" | "year" };
  export type StripeCheckout = { id: string; klantId: string | null; abonnementId: string | null };
  export interface StripePoort {
    maakKlant(i: { organisatieId: string; email: string; naam: string }): Promise<{ id: string }>;
    maakCheckout(i: { klantId: string; prijsId: string; organisatieId: string; trialEinde: Date | null; succesUrl: string; annuleerUrl: string }): Promise<{ id: string; url: string }>;
    haalCheckout(id: string): Promise<StripeCheckout | null>;
    laatCheckoutVervallen(id: string): Promise<void>;
    maakPortaal(i: { klantId: string; terugUrl: string }): Promise<{ url: string }>;
    abonnementenVanKlant(klantId: string): Promise<StripeAbonnement[]>;
    beeindigAbonnement(id: string): Promise<void>;
    haalFactuur(id: string): Promise<StripeFactuur | null>;
    factuurPdf(factuur: StripeFactuur): Promise<Uint8Array>;
    haalPrijs(id: string): Promise<StripePrijs>;
  }
  export function maakStripePoort(config: Extract<AbonnementConfig, { ingeschakeld: true }>): StripePoort;
  export type Gebeurtenis = { id: string; type: string; klantId: string | null; objectId: string | null; abonnementId: string | null; reden: string | null };
  /** Offline, met de SDK (`webhooks.constructEvent`). Gooit bij een ongeldige handtekening. */
  export function leesWebhook(rauw: string, handtekening: string, geheim: string): Gebeurtenis;
  ```
- Produces, in `test/nep-stripe.ts`:
  - `maakNepStripe(): StripePoort & { aanroepen: { methode: string; invoer: unknown }[]; abonnementen: Map<string, StripeAbonnement[]>; facturen: Map<string, StripeFactuur>; prijzen: Map<string, StripePrijs>; faalPrijzen: boolean }`;
  - het is een geheugenimplementatie, met id's als `cus_nep_1` en `cs_nep_1`, en Checkout-URL's als `https://checkout.nep/cs_nep_1`.

- [ ] **Step 1: Schrijf de falende tests**

In `test/abonnement-config.test.ts`:
- `leesAbonnementConfig({})` → `{ ingeschakeld: false }`.
- **Volledig:** sleutel, beide prijzen en geheim → ingeschakeld met die waarden. Een lege `BOEKHOUDING_INBOX` wordt `null`.
- **Ontbrekende prijs:** sleutel zonder `STRIPE_PRIJS_JAAR` → gooit "STRIPE_PRIJS_JAAR ontbreekt".
- **`STRIPE_API_BASIS`:**
  - `http://127.0.0.1:3199` met `sk_test_…` → `apiBasis` is gezet;
  - met `sk_live_…` → gooit;
  - met de host `example.com` → gooit.
- **`leesWebhook`:**
  - een payload getekend met `Stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test" })` → geeft de genormaliseerde `Gebeurtenis`. Voor een `invoice.paid`: `klantId`, `objectId` = het factuur-id, en `abonnementId` uit `parent.subscription_details.subscription`;
  - een verkeerd geheim → gooit.
- **Geheimen in fouten:** geen enkele foutmelding bevat de sleutel of het geheim (`expect(String(fout)).not.toContain("sk_test_geheim")`).

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-config.test.ts`
Expected: FAIL.

- [ ] **Step 3: Installeer `stripe` (exact) en implementeer `config.ts`, `stripe.ts` en `test/nep-stripe.ts`**

- `maakStripePoort` zet `host`, `port` en `protocol` uit `apiBasis` als die gezet is.
- `maakCheckout` voegt de vaste Checkout-parameters uit de Global Constraints toe, en `subscription_data.trial_end` (in seconden) als `trialEinde` gezet is.
- `abonnementenVanKlant` gebruikt `status: "all"`, en neemt `periodeEinde` van het eerste item (basil-API).
- `factuurPdf` downloadt `pdfUrl` met `fetch`.
- `.env.example` krijgt de zes namen, zonder waarden, met één regel uitleg per naam.

- [ ] **Step 4: Draai de tests en de typecheck**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-config.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml apps/web/.env.example apps/web/server/abonnementen apps/web/test/nep-stripe.ts apps/web/test/abonnement-config.test.ts
git commit -m "feat(web): Stripe-configuratie en -poort"
```

---

### Task 3: Synchronisatie, schrijfrecht (402) en toegang in /api/mij

**Files:**
- Create: `apps/web/server/abonnementen/repo.ts`, `apps/web/server/abonnementen/synchronisatie.ts`, `apps/web/server/abonnementen/handhaving.ts`.
- Modify:
  - `apps/web/server/api/projecten/index.post.ts`, `[id].put.ts`, `[id]/dupliceer.post.ts` en `[id]/bestanden.post.ts`: `vereisSchrijfrecht` na de lidmaatschapscontrole, vóór elke wijziging;
  - `apps/web/server/organisaties/leden.ts`: `mij()`;
  - `apps/web/app/stores/sessie.ts`: alleen de types `Organisatie` en `Mij` (de UI volgt in Task 6).
- Test: `apps/web/test/abonnement-handhaving.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces, in `repo.ts`:
  - `haalAbonnementRij(db, organisatieId)` → de rij of null;
  - `toegangVoor(db: Db, organisatieId: string, config: AbonnementConfig, nu?: Date): Promise<Toegang>` (leest `proefEinde`, `vrijgesteld` en de rij, en roept `bepaalToegang` aan).
- Produces, in `synchronisatie.ts`: `synchroniseerKlant(db: Db, stripe: StripePoort, klantId: string, nu?: Date): Promise<"bijgewerkt" | "onbekend">`.
  - Een onbekende klant (geen rij) geeft `"onbekend"`.
  - Anders kiest de functie het gevolgde abonnement met `kiesGevolgdAbonnement` en schrijft het weg: `status`, `formule` (afgeleid van `prijsId` t.o.v. `config.prijzen`), `periodeEinde`, `opgezegdOpPeriodeEinde`, `stripeAbonnementId` en `bijgewerkt`.
  - `achterstalligSinds` wordt `nu` bij de eerste `past_due` en blijft staan zolang die status duurt. Bij elke andere status wordt het `null`.
  - Bij `dubbel` volgt `console.warn("dubbel abonnement", { organisatieId })`.
- Produces, in `handhaving.ts`: `vereisSchrijfrecht(organisatieId: string): Promise<void>`. Zonder schrijfrecht gooit de functie `createError({ statusCode: 402, data: { code: ABONNEMENT_VEREIST, reden } })`.
- Produces, voor de types: `Mij.organisaties[i].toegang: Toegang` en `Mij.gebruiker.proefGebruikt: boolean`.

- [ ] **Step 1: Schrijf de falende tests**

In `test/abonnement-handhaving.test.ts`, met h3 en Better Auth op PGlite, zoals `toegang.test.ts`, en `zetAbonnementen({ config: ingeschakeld, stripe: maakNepStripe() })`:
- **402 bij een verlopen proef** (`proef_einde` in het verleden, geen rij): de vier 402-routes geven 402 met `data.code === "ABONNEMENT_VEREIST"` en `data.reden === "proef-voorbij"`, en de database is onveranderd (geen nieuw project, `versie` gelijk).
- **Geen 402** voor dezelfde organisatie op: `GET /api/projecten`, `GET /api/projecten/:id`, `POST /api/projecten/:id/exports`, `DELETE /api/projecten/:id`, `PUT /api/bedrijfsgegevens`, `PUT /api/organisaties/naam` en `POST /api/organisaties/uitnodigingen`.
- **`vrijgesteld = true`:** geen 402.
- **Uitgeschakeld** (`zetAbonnementen({ config: { ingeschakeld: false }, stripe: null })`): geen 402.
- **`/api/mij`:**
  - geeft per organisatie `toegang` met `{ schrijven: false, reden: "proef-voorbij", proefEinde: <ISO> }`;
  - geeft `gebruiker.proefGebruikt`;
  - bevat nergens `cus_` of `sub_`.
- **`synchroniseerKlant` met de nep-poort:**
  - **Volgorde:** de rij volgt het levendigste abonnement, ook als `abonnementen` een `canceled` als nieuwste bevat.
  - **`achterstalligSinds`:** wordt gezet bij `past_due`, blijft gelijk bij een tweede sync, en wordt `null` na `active`.
  - **Onbekende klant:** geeft `"onbekend"` en schrijft niets.
  - **Dubbel abonnement:** waarschuwt met alleen `organisatieId` (spy op `console.warn`).

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-handhaving.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer `repo.ts`, `synchronisatie.ts`, `handhaving.ts`, de vier routes en `mij()`**

- [ ] **Step 4: Draai de tests, de bestaande route- en toegangstests, en de typecheck**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-handhaving.test.ts test/toegang.test.ts test/routes-beveiligd.test.ts test/projecten-api.test.ts test/bestanden-api.test.ts && pnpm typecheck`
Expected: PASS. Abonnementen staan uit in de bestaande tests, dus hun verwachtingen veranderen niet.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server apps/web/app/stores/sessie.ts apps/web/test/abonnement-handhaving.test.ts
git commit -m "feat(web): alleen-lezen zonder abonnement (402) en toegang per organisatie in /api/mij"
```

---

### Task 4: Abonnement-API (status, checkout, portaal, synchroniseer)

**Files:**
- Create:
  - `apps/web/server/api/abonnement/index.get.ts`, `checkout.post.ts`, `portaal.post.ts` en `synchroniseer.post.ts`;
  - `apps/web/server/abonnementen/beheer.ts`: de logica achter de routes.
- Modify:
  - `apps/web/test/toegang.test.ts`: vier nieuwe rijen in `TABEL`. Zet in `beforeAll` `zetAbonnementen` met de nep-poort aan. Alle testorganisaties zitten binnen hun proef, dus de bestaande rijen blijven gelijk; controleer dat.
  - `apps/web/shared/abonnement.ts`: `AbonnementOverzicht`.
- Test: `apps/web/test/abonnement-api.test.ts`.

**Interfaces:**
- Consumes: Tasks 1–3, `vereisLid(event, { rol: "eigenaar" })`, `ACTIEVE_ORGANISATIE_HEADER` en `basisUrl()` uit `server/auth/oorsprong.ts`.
- Produces, in `shared/abonnement.ts`:
  ```ts
  export type Prijs = { bedrag: number; munt: string; interval: "month" | "year" };
  export type AbonnementOverzicht = {
    ingeschakeld: boolean; schrijven: boolean; reden: ToegangReden; proefEinde: string | null;
    status: AbonnementStatus | null; formule: Formule | null; periodeEinde: string | null; opgezegd: boolean;
    heeftKlant: boolean; prijzen: { maand: Prijs; jaar: Prijs } | null;
  };
  ```
- Produces, de routes:
  - **`GET /api/abonnement`:** elk lid; geeft `AbonnementOverzicht`, zonder Stripe-id's.
  - **`POST /api/abonnement/checkout`**, body `{ formule: Formule }` (Zod): alleen een eigenaar; geeft `{ url }`.
  - **`POST /api/abonnement/portaal`:** alleen een eigenaar; geeft `{ url }`, of 409 `GEEN_KLANT`.
  - **`POST /api/abonnement/synchroniseer`**, body `{ sessie: string }`: alleen een eigenaar; geeft `AbonnementOverzicht`, of 404 als de sessie bij een andere klant hoort.
  - **Uitgeschakeld:** de drie POST's geven 409 `ABONNEMENTEN_UIT`, en GET geeft `ingeschakeld: false`.
  - **`TRIAL_MARGE_UUR = 48` en `PRIJS_CACHE_MS = 600_000`** staan in `beheer.ts`.

- [ ] **Step 1: Schrijf de falende tests**

In `test/abonnement-api.test.ts`, met de nep-poort:
- **Rollen:** checkout, portaal en synchroniseer geven 403 voor een lid. Een andere organisatie ziet nooit A's klant; synchroniseer met A's sessie als B geeft 404.
- **`ABONNEMENT_BESTAAT`** (409) voor elk van `trialing`, `active`, `past_due`, `unpaid`, `incomplete` en `paused`. **Geen** 409 na `canceled` of `incomplete_expired`; dan komt er een nieuwe sessie voor dezelfde klant.
- **Gelijktijdig:** twee `Promise.all`-checkouts voor dezelfde organisatie geven samen één `maakKlant`-aanroep en hoogstens één open sessie in de rij. Een tweede checkout na de eerste roept `laatCheckoutVervallen` aan met de eerste sessie-id.
- **Trial-marge:**
  - `proef_einde = nu + 49 u` → `maakCheckout` krijgt `trialEinde = proef_einde`;
  - `nu + 47 u` → `trialEinde = null`;
  - een verlopen proef → `null`.
- **Checkout-aanroep:**
  - `prijsId` volgt de formule (`maand` → `STRIPE_PRIJS_MAAND`);
  - `organisatieId` wordt meegegeven;
  - `succesUrl` eindigt op `/abonnement?terug={CHECKOUT_SESSION_ID}`;
  - `annuleerUrl` eindigt op `/abonnement`.
- **Portaal:** zonder klant geeft het 409 `GEEN_KLANT`; met een klant krijgt `terugUrl` het pad `/abonnement`.
- **GET:**
  - een lid krijgt hetzelfde overzicht als een eigenaar;
  - `prijzen` heeft het bedrag in cent;
  - met `faalPrijzen = true` → `prijzen: null` en status 200;
  - twee GET's binnen 10 minuten geven één `haalPrijs`-aanroep per prijs (nep-klok of `vi.useFakeTimers`).
- **Uitgeschakeld:** de POST's geven 409 `ABONNEMENTEN_UIT`, en GET geeft `ingeschakeld: false`.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-api.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer `beheer.ts` en de vier routes, en voeg de vier rijen toe aan `TABEL`**

- **Advisory lock:** `pg_advisory_xact_lock(hashtext('abonnement:' || organisatieId))` in één transactie, rond "rij lezen, klant maken, oude sessie laten vervallen, nieuwe sessie maken en `openCheckoutSessie` bewaren".
- **Klant:** de klantnaam is de organisatienaam, en het e-mailadres dat van de eigenaar die klikt.

- [ ] **Step 4: Draai de tests**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-api.test.ts test/toegang.test.ts test/routes-beveiligd.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server apps/web/shared/abonnement.ts apps/web/test/abonnement-api.test.ts apps/web/test/toegang.test.ts
git commit -m "feat(web): abonnement nemen en beheren via Stripe Checkout en het klantenportaal"
```

---

### Task 5: Webhook en doorsturen naar de boekhouding

**Files:**
- Create: `apps/web/server/api/stripe/webhook.post.ts`, `apps/web/server/abonnementen/webhook.ts`, `apps/web/server/abonnementen/boekhouding.ts`.
- Modify:
  - `apps/web/server/mail/verzend.ts`: `Mail` krijgt `bijlagen?: { naam: string; inhoud: Uint8Array; type: string }[]`, en `SmtpBericht` krijgt de `attachments` van nodemailer;
  - `apps/web/test/routes.ts`: `PUBLIEKE_ROUTES` krijgt `"stripe/webhook.post.ts"`;
  - `apps/web/test/toegang.test.ts`: een rij `"POST /api/stripe/webhook"` met `publiek: true`, die zonder handtekening 400 geeft voor elke actor.
- Test: `apps/web/test/abonnement-webhook.test.ts`, en een uitbreiding van `apps/web/test/mail-verzend.test.ts` voor de bijlagen.

**Interfaces:**
- Consumes: `leesWebhook` en `Gebeurtenis` (Task 2), `synchroniseerKlant` (Task 3) en `gebruikVerzender` (bestaand).
- Produces, in `webhook.ts`: `verwerkGebeurtenis(db: Db, stripe: StripePoort, config, g: Gebeurtenis): Promise<void>`.
  - **Synchronisatie** bij `checkout.session.completed`, `customer.subscription.created`, `.updated` en `.deleted`, en `invoice.paid` en `invoice.payment_failed`.
  - **Mislukte eerste betaling:** bij `checkout.session.async_payment_failed`, en bij `invoice.payment_failed` met `reden === "subscription_create"`, eerst `beeindigAbonnement(abonnementId)` en dan synchroniseren.
  - **Doorsturen:** bij `invoice.paid` ook `stuurFactuurDoor`.
  - Een onbekend type wordt genegeerd.
- Produces, in `boekhouding.ts`: `stuurFactuurDoor(db, stripe, inbox: string | null, factuurId: string): Promise<"verstuurd" | "overgeslagen">`.
  - **Overgeslagen** als de inbox ontbreekt, als `bedragBetaald === 0`, of als het factuur-id al in `doorgestuurde_facturen` staat.
  - **Mail:** onderwerp `Stripe-factuur ${nummer}`, bijlage `${nummer}.pdf` (`application/pdf`), en een korte tekst met het bedrag. Het factuur-id wordt pas na het verzenden vastgelegd.
- Produces, de route `POST /api/stripe/webhook`:
  - leest de body rauw (`readRawBody(event, "utf8")`) en `stripe-signature`;
  - `leesWebhook` gooit → 400;
  - event-id al in `stripe_events` → 200;
  - anders `verwerkGebeurtenis`, daarna een insert in `stripe_events` en 200;
  - een fout tijdens het verwerken → 500, zonder insert;
  - uitgeschakeld → 404.

- [ ] **Step 1: Schrijf de falende tests**

In `test/abonnement-webhook.test.ts`. De payloads zijn echte Stripe-vormen (minimaal), getekend met `generateTestHeaderString`:
- **Handtekening:** ongeldig of ontbrekend → 400, er verandert niets, en de body komt niet in de logs.
- **Herhaald event:** hetzelfde event-id twee keer → één synchronisatie (tel de `abonnementenVanKlant`-aanroepen).
- **Lege rij:** `customer.subscription.updated` terwijl `stripe_abonnement_id` nog leeg is → de rij krijgt het abonnement en de status.
- **Volgorde:** `.deleted` van een oud abonnement na het nieuwe `active` → de rij blijft het actieve volgen, en `toegangVoor` geeft schrijven.
- **Mislukte eerste betaling:**
  - `checkout.session.async_payment_failed` → `beeindigAbonnement` is aangeroepen en de rij is gesynchroniseerd;
  - hetzelfde voor `invoice.payment_failed` met `billing_reason: "subscription_create"`;
  - **niet** voor `"subscription_cycle"`.
- **Doorsturen:**
  - `invoice.paid` (bedrag > 0, inbox gezet) → één mail aan de inbox, met één PDF-bijlage en onderwerp `Stripe-factuur ELK-0001`;
  - een tweede event voor dezelfde factuur → geen tweede mail;
  - `amount_paid: 0` → geen mail;
  - inbox `null` → geen mail.
- **Mailfout:** de verzender gooit → 500, het event staat niet in `stripe_events`, en een nieuwe poging verstuurt wel.
- **Onbekend:** een onbekende klant of een onbekend type → 200.
- **CSRF:** een verzoek zonder `Origin` en zonder `Sec-Fetch-Site` passeert `eisEigenSite`. Een verzoek met `Origin: https://evil.example` geeft 403. Dat volgt plan 6 en is vastgepind.
- **Geen gevoelige gegevens in logs:** spy op `console.*`. Het inboxadres, `whsec_` en `sk_` komen nergens voor.

In `mail-verzend.test.ts`: een `Mail` met bijlagen geeft `attachments: [{ filename, content, contentType }]` aan het transport.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-webhook.test.ts test/mail-verzend.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer de bijlagen in `verzend.ts`, `boekhouding.ts`, `webhook.ts` en de route, en werk `routes.ts` en `TABEL` bij**

- [ ] **Step 4: Draai de tests**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-webhook.test.ts test/mail-verzend.test.ts test/toegang.test.ts test/routes-beveiligd.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/server apps/web/test
git commit -m "feat(web): Stripe-webhook, mislukte eerste betaling en facturen naar de boekhouding"
```

---

### Task 6: Abonnementspagina, banners en registratieteksten

**Files:**
- Create:
  - `apps/web/app/pages/abonnement.vue`;
  - `apps/web/app/components/AbonnementBanner.vue`;
  - `apps/web/app/composables/useAbonnementApi.ts`;
  - `apps/web/app/abonnement/weergave.ts`: pure helpers voor de pagina en de banner.
- Modify:
  - `apps/web/app/stores/sessie.ts`: computed `toegang` (van de actieve organisatie; zonder organisatie `{ schrijven: true, reden: "uit", proefEinde: null }`) en `proefGebruikt`;
  - `apps/web/app/components/GebruikerMenu.vue`: een link "Abonnement";
  - `apps/web/app/pages/index.vue`, `instellingen.vue` en `organisatie.vue`: `<AbonnementBanner />` onder `AppBovenbalk`;
  - `apps/web/app/pages/index.vue`: "Nieuw project" en "Dupliceren" verborgen zonder schrijfrecht. Een 402 op aanmaken of dupliceren ververst de sessie (`sessie.laad`) en toont de alleen-lezenmelding in plaats van een generieke fout;
  - `apps/web/app/pages/registreren.vue` en `apps/web/app/components/NieuwBedrijfFormulier.vue`: het label "Naam van je bedrijf of je eigen naam". Bij `proefGebruikt` toont "Nieuw bedrijf" ook: "Dit bedrijf heeft geen gratis proefperiode; je kiest meteen een abonnement.";
  - `apps/web/i18n/locales/nl.json`: alle nieuwe teksten.
- Test: `apps/web/test/abonnement-weergave.test.ts` en `apps/web/test/abonnement-client.test.ts`.

**Interfaces:**
- Consumes: `AbonnementOverzicht`, `Toegang` en de foutcodes (Tasks 1 en 4), en de API (Task 4).
- Produces, in `app/abonnement/weergave.ts`:
  - `prijsTekst(p: Prijs): { excl: string; incl: string }`, met `Intl.NumberFormat("nl-BE", { style: "currency", currency })`. `incl` is het bedrag × 1,21, afgerond op een cent. Voorbeeld: `3000` cent → `{ excl: "€ 30,00", incl: "€ 36,30" }`, met de spaties die `nl-BE` geeft.
  - `jaarKorting(maand: Prijs, jaar: Prijs): number`: het afgeronde percentage `round((1 − jaar / (12 × maand)) × 100)`. Voorbeeld: maand 3000, jaar 30000 → 17.
  - `bannerVoor(toegang: Toegang, rol: Rol | null, nu: Date): { soort: "proef" | "betaling" | "alleen-lezen"; dagen?: number; knop: boolean } | null`:
    - `proef`: alleen voor een eigenaar, als de proef nog hoogstens 7 dagen loopt (`dagen` naar boven afgerond);
    - `betaling`: voor een eigenaar, bij `schrijven` en `reden === "betaling-mislukt"`;
    - `alleen-lezen`: voor iedereen, zonder schrijfrecht; `knop` alleen voor een eigenaar;
    - anders `null`.
  - `statusTekstSleutel(o: AbonnementOverzicht): string`: de i18n-sleutel voor de statusregel.
- Produces, in `useAbonnementApi()`: `{ haal(): Promise<AbonnementOverzicht>; checkout(formule): Promise<{ url }>; portaal(): Promise<{ url }>; synchroniseer(sessie): Promise<AbonnementOverzicht> }`. De POST's sturen `x-elentrik-organisatie`, zoals `useOrganisatieApi`.

**De pagina `/abonnement`** volgt spec §4.3:
- **Eigenaar zonder lopend abonnement:** de kaarten Maandelijks en Jaarlijks, met `prijsTekst`. Jaarlijks heeft de badge "−N %"; elke kaart een knop "Kies", die naar `{ url }` navigeert.
- **Eigenaar met een abonnement:** "Abonnement beheren". Bij `past_due` of `unpaid` heet die knop "Betaling regelen".
- **Lid:** de zin uit de spec.
- **Terug uit Checkout** (`?terug=`): eerst synchroniseren, dan `terug` uit de URL halen (`router.replace`).
- **`prijzen: null`:** "Prijzen konden niet geladen worden", zonder knoppen.
- **Uitgeschakeld:** "Betalen is nog niet ingesteld."
- **409 `ABONNEMENT_BESTAAT`** op "Kies": opnieuw laden en de beheerknop tonen.

- [ ] **Step 1: Schrijf de falende tests**

In `test/abonnement-weergave.test.ts`:
- `prijsTekst` en `jaarKorting` met de voorbeelden hierboven.
- **`bannerVoor`:**
  - `proef` op dag 7 wel en op dag 8 niet;
  - `proef` nooit voor een lid;
  - `betaling` alleen voor een eigenaar;
  - `alleen-lezen` voor een lid zonder knop, en voor een eigenaar met knop;
  - `reden: "uit"` → `null`.

In `test/abonnement-client.test.ts`, met componenttests zoals de bestaande clienttests:
- de pagina toont voor een eigenaar twee kaarten met "−17 %";
- een lid ziet geen knoppen;
- `?terug=cs_1` roept `synchroniseer("cs_1")` aan;
- `prijzen: null` toont de melding;
- een 402 op "Nieuw project" roept `sessie.laad` aan en toont de alleen-lezentekst.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-weergave.test.ts test/abonnement-client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer de helpers, de composable, de pagina, de banner, de store-uitbreiding, de menulink, de projectenlijst, de registratieteksten en `nl.json`**

- [ ] **Step 4: Draai de tests en de typecheck**

Run: `pnpm --filter @elentrik/web exec vitest run test/abonnement-weergave.test.ts test/abonnement-client.test.ts test/sessie-store.test.ts test/organisatie-client.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/i18n apps/web/test
git commit -m "feat(web): abonnementspagina, banners en alleen-lezen in de projectenlijst"
```

---

### Task 7: Alleen-lezenmodus in de editor en 402 tijdens autosave

**Files:**
- Modify:
  - `apps/web/app/stores/editor.ts`: `alleenLezen` en `zetAlleenLezen(waarde: boolean)`. In alleen-lezen doen `pasToe`, `ongedaanMaken`, het opnieuw-uitvoeren, `wijzigVeld`, `wijzigProjectgegevens` en elke andere functie die het document of de undo-stapel wijzigt niets;
  - `apps/web/app/stores/situatie.ts`: dezelfde guard op elke wijzigende functie (plaatsen, verschuiven, van plan halen, plan toevoegen);
  - `apps/web/app/composables/useAutosave.ts`: de status `"alleen-lezen"` toegevoegd aan `AutosaveStatus`;
  - `apps/web/app/pages/projecten/[id].vue` en de editorcomponenten (palet, rail-knoppen, eigenschappenpaneel, situatie-items, bovenbalk): uitgeschakeld bij `alleenLezen`, plus `<AbonnementBanner />`;
  - `apps/web/i18n/locales/nl.json`.
- Test: `apps/web/test/editor-alleen-lezen.test.ts`, en uitbreidingen van `apps/web/test/autosave.test.ts` en `apps/web/test/situatie-store.test.ts`.

**Interfaces:**
- Consumes: `sessie.organisaties[].toegang` (Task 3/6) en `ABONNEMENT_VEREIST` (Task 1).
- Produces:
  - **De editor zet `alleenLezen`** als de organisatie van het project (`project.organisatieId`) in `sessie.organisaties` `toegang.schrijven === false` heeft. Na `sessie.laad` werkt hij dat bij.
  - **Autosave bij een 402 met `data.code === ABONNEMENT_VEREIST`:**
    - `status = "alleen-lezen"`;
    - het concept blijft lokaal bewaard (zoals bij `afgemeld`);
    - `kanBewaren` wordt false, zonder nieuwe poging;
    - `waarschuwBijVerlaten("alleen-lezen") === true`;
    - de pagina roept `sessie.laad()` aan en zet de editor op alleen-lezen.

- [ ] **Step 1: Schrijf de falende tests**

`editor-alleen-lezen.test.ts`:
- met `zetAlleenLezen(true)` laten een toevoeg-operatie, `wijzigVeld`, `ongedaanMaken` en een sjabloon het document en de undo-stapel ongewijzigd;
- de wijzigende sneltoetsen uit `sneltoetsen.ts` (verwijderen, plakken, ongedaan maken) doen niets;
- de niet-wijzigende (selectie, zoom) werken nog;
- `zetAlleenLezen(false)` herstelt alles.

`situatie-store.test.ts`: plaatsen en verschuiven doen niets in alleen-lezen.

`autosave.test.ts`, bij een 402 `ABONNEMENT_VEREIST`:
- de status wordt `"alleen-lezen"`;
- het concept staat in de conceptopslag;
- na de 2 s-timer volgt geen nieuwe PUT;
- `waarschuwBijVerlaten` is true.

Een 402 zonder die code volgt het bestaande `fout`-pad.

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

Run: `pnpm --filter @elentrik/web exec vitest run test/editor-alleen-lezen.test.ts test/autosave.test.ts test/situatie-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer de guards, de autosave-status, de koppeling in `[id].vue` en het uitschakelen in de UI, met de teksten**

- [ ] **Step 4: Draai de tests, de volledige suite en de typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app apps/web/i18n apps/web/test
git commit -m "feat(web): alleen-lezenmodus in de editor en het situatieschema zonder abonnement"
```

---

### Task 8: E2E met een nep-Stripe, en de documentatie

**Files:**
- Create: `apps/web/e2e/hulp/nep-stripe.ts`, `apps/web/e2e/abonnement.spec.ts`.
- Modify:
  - `apps/web/e2e/omgeving.ts`: `E2E_STRIPE_POORT = 3199`, `E2E_STRIPE_URL`, en vaste testwaarden `sk_test_e2e`, `whsec_e2e`, `price_e2e_maand` en `price_e2e_jaar`;
  - `apps/web/e2e/global-setup.ts`: de nep-Stripe starten en bij de teardown stoppen;
  - `apps/web/playwright.config.ts`: in de `webServer.env` de vier Stripe-waarden, `STRIPE_API_BASIS` = `E2E_STRIPE_URL` en `BOEKHOUDING_INBOX: ""`. Zet daar ook `SMTP_GEBRUIKER`, `SMTP_WACHTWOORD` en `SMTP_BEVEILIGD` op `""` (een opvolgpunt van plan 6);
  - `apps/web/e2e/hulp/database.ts`: `zetProefEinde(organisatieId, datum)` en `zetVrijgesteld(organisatieId)`;
  - de bestaande specs die een **tweede eigen** organisatie maken en erin schrijven (o.a. `verlaten.spec.ts` en `organisaties.spec.ts`): die organisatie krijgt `zetVrijgesteld`, of de test verwacht alleen-lezen als dat zijn bedoeling is;
  - `docs/lokaal-en-online.md`: de sectie "Abonnementen en Stripe", met de env-variabelen, `stripe listen`, de dashboard-checklist uit spec §4.5, de handmatige test uit spec §5 en `vrijgesteld` voor het eigen bedrijf.

**Interfaces:**
- Consumes: alle eerdere taken.
- Produces, in `nep-stripe.ts`: `startNepStripe(poort: number): Promise<{ stop(): Promise<void> }>`. Een `node:http`-server op 127.0.0.1 die genoeg van de Stripe-REST-API beantwoordt voor de SDK-aanroepen van de poort:
  - `GET /v1/prices/:id`;
  - `POST /v1/customers`;
  - `POST /v1/checkout/sessions`, met `url` `http://127.0.0.1:3199/checkout/<id>`;
  - `GET /v1/checkout/sessions/:id` en `POST /v1/checkout/sessions/:id/expire`;
  - `GET /v1/subscriptions`, die een lege lijst geeft;
  - `POST /v1/billing_portal/sessions`;
  - `GET /checkout/:id`, een eenvoudige HTML-pagina "Nep-Checkout".

**De guard:** `STRIPE_API_BASIS` werkt alleen met `sk_test_` en 127.0.0.1 of localhost. Dat dwingt Task 2 al af; er komt geen andere test-hook in de productiecode.

- [ ] **Step 1: Schrijf de falende spec `e2e/abonnement.spec.ts`**

1. **Verlopen proef:**
   - registreer een eigenaar (bestaande hulp) en zet `zetProefEinde(org, gisteren)`;
   - de projectenlijst toont de alleen-lezenbanner en geen "Nieuw project";
   - een geseed project opent, en een poging om een kring toe te voegen verandert niets (de knop is uitgeschakeld);
   - exporteren lukt (de bestaande exporthulp).
2. **Formules:** een eigenaar binnen de proef opent `/abonnement` en ziet twee kaarten met bedragen en "−N %". "Kies" bij Jaarlijks navigeert naar `/checkout/` op de nep-Stripe.
3. **Lid:** een lid ziet op `/abonnement` geen knoppen.

- [ ] **Step 2: Draai de spec en controleer dat hij faalt**

Run: `cd apps/web && npx playwright test e2e/abonnement.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementeer de nep-Stripe, de omgeving, de setup, de config, de hulpfuncties en de aanpassingen in de bestaande specs, en schrijf de documentatie**

- [ ] **Step 4: Draai de volledige Playwright-suite twee keer, en de unit-suite**

Run: `cd apps/web && npx playwright test && npx playwright test && cd ../.. && pnpm test && pnpm typecheck`
Expected: alles PASS, twee keer na elkaar.

- [ ] **Step 5: Commit**

```bash
git add apps/web/e2e apps/web/playwright.config.ts docs/lokaal-en-online.md
git commit -m "test(web): end-to-end abonnementen met een nep-Stripe, en documentatie voor Stripe"
```
