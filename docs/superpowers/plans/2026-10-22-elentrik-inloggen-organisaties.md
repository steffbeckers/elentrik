# Inloggen en organisaties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accounts with e-mail/password and magic link, organisations with the roles eigenaar and lid, e-mail invitations, switching between organisations, strict separation of organisations on every API route, and a one-time takeover of the existing local data.

**Architecture:**
- **Auth:** Better Auth with the organization and magic link plugins runs on the existing Drizzle/Postgres setup.
- **Route protection:** every route in `server/api` goes through one wrapper. The wrapper checks membership on every request.
- **E-mail:** sent over SMTP. Locally that is Mailpit; in tests an injected transport.
- **Playwright:** runs against a separate database `elentrik_e2e`, with its own file storage and port. The e2e tests never touch the real data.

**Tech Stack:** Nuxt 4, Nuxt UI 4, Pinia, Drizzle 0.45 and PostgreSQL 16 (PGlite in tests), Better Auth (new), nodemailer (new), Mailpit (Docker), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-22-elentrik-inloggen-organisaties-design.md`. Section 5b holds the decisions made after the builder check and is binding.

## Global Constraints

- **Local only:** everything listens on `127.0.0.1`. That covers the dev server (3000), the e2e server (3100), Postgres (5432), Gotenberg (3001) and Mailpit (SMTP 1025, UI 8025).
- **Clean room:** no code or text taken from other software.
- **Commits:**
  - Conventional Commits, signed via 1Password, never `--no-gpg-sign`.
  - Every commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Push explicitly with `git push -u origin HEAD:refs/heads/<branch>`. Never push to `main`.
- **Where to work:** the main checkout `D:\steffbeckers\elentrik`, branch `inloggen`, no worktree.
- **New dependencies:**
  - `better-auth` and `nodemailer`, plus `@types/nodemailer` as a devDependency;
  - each pinned to an exact version that was published at least two weeks earlier;
  - Better Auth stays on one major version.
- **Session and passwords:**
  - a session lasts 30 days and is renewed on use (`updateAge` 1 day);
  - passwords need at least 10 characters;
  - an invitation expires after 7 days;
  - a verification or magic link expires after 15 minutes (magic link) or 24 hours (e-mail confirmation).
- **Roles:** internally Better Auth's `owner` and `member`. In the API and UI they are always called `eigenaar` and `lid`. There is no `admin` role.
- **Responses:**
  - no session: 401;
  - something from an organisation you are not a member of: **404**;
  - a missing role: 403.
- **Secrets:**
  - `BETTER_AUTH_SECRET` comes from `.env`. It is never committed.
  - `.env.example` holds a placeholder.
  - Never log a password, token or link.
- **E-mail:** all mail texts are in Dutch and live in one module of pure template functions.
- **Ruling E1:** explicit imports in everything Vitest tests.
- **UI text:** in `nl.json`.
- **Tests:**
  - `pnpm test` and `pnpm typecheck` must be green;
  - Playwright runs against `elentrik_e2e` on port 3100, through its own webServer (`reuseExistingServer: false`);
  - Docker starts with `pnpm db:up`.

## Review Focus

1. **Access across organisations by guessing ids.** A project, file, export, snapshot or logo id from organisation B, requested by a user of organisation A, gives 404 on every route. Test: Task 4, the route table plus the cross-organisation tests.
2. **A new route without a guard.** A route file in `server/api` (outside `auth/`) that does not use the wrapper makes a test fail. Test: Task 4, the static route test.
3. **The session expires while drawing.** The work stays in the local draft, the status becomes "lokaal" with a re-login message, and after logging in again it is saved. Test: Task 7 (unit) and Task 8 (e2e).
4. **The last owner locks themselves out.** Removing, demoting or letting the last owner leave is refused, and the UI says why. Test: Task 5 (server) and Task 6 (UI).
5. **E2E or unit tests touch the real data.** Playwright uses `elentrik_e2e` and its own files directory. Test: Task 1 checks in global setup that `DATABASE_URL` ends in `/elentrik_e2e`, and aborts otherwise.

---

### Task 1: Infrastructure (Mailpit, e2e database, mail module)

**Files:**
- Modify:
  - `infra/docker-compose.yml`: a `mailpit` service on `axllent/mailpit` with an exact tag at least 2 weeks old, ports `127.0.0.1:1025:1025` and `127.0.0.1:8025:8025`.
  - `apps/web/.env.example`: add `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_VAN="Elentrik <noreply@elentrik.local>"`, `BETTER_AUTH_SECRET=<vervang-door-een-lange-willekeurige-waarde>` and `BETTER_AUTH_URL=http://127.0.0.1:3000`.
  - `apps/web/playwright.config.ts`:
    - port 3100 and `reuseExistingServer: false`;
    - `webServer.command` runs `nuxt dev --port 3100 --host 127.0.0.1`;
    - `webServer.env` sets `DATABASE_URL=postgres://elentrik:elentrik@127.0.0.1:5432/elentrik_e2e`, `ELENTRIK_BESTANDEN_DIR=.data/e2e-bestanden`, `BETTER_AUTH_URL=http://127.0.0.1:3100`, a fixed test `BETTER_AUTH_SECRET`, plus the SMTP variables and the Gotenberg URL;
    - `globalSetup` set.
  - Remove `apps/web/e2e/hulp/bedrijf.ts`, and its use in the specs, once Task 4 makes it unnecessary. In this task it stays.
- Create:
  - `apps/web/e2e/global-setup.ts`
  - `apps/web/e2e/hulp/mailpit.ts`
  - `apps/web/server/mail/verzend.ts`
  - `apps/web/server/mail/sjablonen.ts`
- Test: `apps/web/test/mail-sjablonen.test.ts`, `apps/web/test/mail-verzend.test.ts`

**Interfaces:**
- Produces:
  - `type Mail = { aan: string; onderwerp: string; tekst: string; html: string }`.
  - `maakVerzender(transport?: { sendMail(m): Promise<unknown> }): { verstuur(mail: Mail): Promise<void> }`, plus `gebruikVerzender()` and `zetVerzender(v)` for tests. Without an injected transport, it uses nodemailer SMTP from the env.
  - Templates, all pure, returning a `Mail`:
    - `bevestigMail({ naam, link })`
    - `magicLinkMail({ link })`
    - `herstelMail({ naam, link })`
    - `uitnodigingMail({ uitnodiger, organisatie, rol, link })`
  - Every value is HTML-escaped in `html`. The link appears in the text and as a button.
  - `globalSetup`:
    1. Abort if `DATABASE_URL` does not end in `/elentrik_e2e`.
    2. Create the database if it is missing: connect to `postgres` as the `elentrik` superuser and run `CREATE DATABASE elentrik_e2e`.
    3. Run all Drizzle migrations on it.
    4. Empty all tables with `TRUNCATE … CASCADE`.
    5. Empty `.data/e2e-bestanden`.
    6. Delete all messages in Mailpit (`DELETE /api/v1/messages`).
  - `e2e/hulp/mailpit.ts`: `laatsteMailAan(adres, { na?: Date }): Promise<{ onderwerp; tekst; html }>`, and `linkUit(mail): string` (the first `http://127.0.0.1:3100/...` link).

- [ ] **Step 1: Write failing tests.**
  - Templates: Dutch subject lines. Escaping: an organisation name `<b>&` appears escaped in `html`. The link is present in both `tekst` and `html`.
  - Sender: with a fake transport, `verstuur` passes on `from`, `to`, `subject`, `text` and `html`. If the transport throws, the error propagates and is not swallowed.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Start the Mailpit container. Run the existing Playwright suite against the new e2e database: all existing specs must stay green. They do not use login yet.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` and Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `chore: mailpit, aparte e2e-database en mailmodule`

### Task 2: Set up Better Auth

**Files:**
- Create:
  - `apps/web/server/auth/index.ts`: the Better Auth instance, with `gebruikAuth()` and `zetAuth()` for tests.
  - `apps/web/server/api/auth/[...all].ts`: forwards to `auth.handler`.
  - `apps/web/app/composables/useAuthClient.ts`: `createAuthClient` from `better-auth/vue` with the organization and magic link client plugins.
- Modify: `apps/web/server/db/schema.ts` (the Better Auth tables), plus a migration via `db:generate`; `apps/web/package.json`.
- Test: `apps/web/test/auth.test.ts`

**Interfaces:**
- Produces a Better Auth configuration with:
  - `emailAndPassword`: `enabled`, `minPasswordLength: 10`, `requireEmailVerification: true`. `sendResetPassword` uses `herstelMail`.
  - `emailVerification`: `sendOnSignUp: true`, `autoSignInAfterVerification: true`, using `bevestigMail`.
  - `magicLink`: `disableSignUp: true` and `expiresIn: 15 * 60`. It sends `magicLinkMail`. It never reveals whether an address exists: the API always answers 200.
  - `organization`:
    - `creatorRole: "owner"`, `invitationExpiresIn: 7 * 24 * 3600`;
    - `sendInvitationEmail` sends `uitnodigingMail` with link `${BETTER_AUTH_URL}/uitnodiging/<id>`;
    - only the roles `owner` and `member` are used.
  - `session`: `expiresIn: 30 * 24 * 3600`, `updateAge: 24 * 3600`.
  - `rateLimit`: enabled, also in dev (`enabled: true`). The default limits are fine.
  - `user.additionalFields`: `wachtendeBedrijfsnaam` (string, optional, `input: true`). Registration stores the company name here until the first verified login. Task 3 uses it.
  - Database: the Drizzle adapter on `gebruikDb()`. Table and column names follow Better Auth's defaults, in a separate section of `schema.ts`.

- [ ] **Step 1: Write failing tests** (PGlite, an injected mail sender that collects mails):
  - registration followed by login without confirmation is refused;
  - the confirmation link from the collected mail lets the user log in;
  - a 9-character password is refused;
  - a magic link for an unknown address creates no account and sends no mail, but the response is the same as for a known address;
  - a magic link for a known address sends a mail, and following the link creates a session;
  - "wachtwoord vergeten" sends `herstelMail`, and resetting with the token works;
  - a session lasts 30 days: check `expiresAt` against `nu`.
  - Use Better Auth's server API (`auth.api.*`) with fake headers. Do not start an HTTP server.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Generate the migration and apply it locally, both to `elentrik` and through Playwright's global setup.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` and Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): better auth met e-mail, wachtwoord, magic link en organisaties`

### Task 3: Organisation data model and takeover

**Files:**
- Modify: `apps/web/server/db/schema.ts`, plus a migration:
  - `projecten.organisatie_id`: nullable, references the organisation, with an index.
  - `bestanden.organisatie_id`: nullable, for logos.
  - `bedrijfsinstellingen` gets a primary key on `organisatie_id`. The existing row with `id = 1` stays as a legacy row (`organisatie_id` null) until the takeover. Choose a schema that allows this: for example a separate legacy key, or a nullable `organisatie_id` with a unique index. Document the choice.
- Create: `apps/web/server/organisaties/overname.ts` and `apps/web/server/organisaties/registratie.ts`.
- Test: `apps/web/test/overname.test.ts`

**Interfaces:**
- Produces:
  - `neemBestaandeGegevensOver(db, organisatieId): Promise<{ projecten: number; bedrijfsgegevens: boolean }>`:
    - one transaction;
    - links all projects with `organisatie_id is null`, and the legacy company data, including the logo file row (gets `organisatie_id`), to this organisation;
    - idempotent: a second call returns `{0, false}`.
  - `richtEersteOrganisatieIn(db, gebruiker): Promise<string | null>`:
    - if the user has no organisation and does have a `wachtendeBedrijfsnaam`, it creates the organisation with that name, with the user as `owner`, and makes it the active organisation of the session;
    - it fills `installateur.naam` with that name, if that is still empty;
    - it clears `wachtendeBedrijfsnaam`;
    - it calls `neemBestaandeGegevensOver` if there are still projects without an organisation;
    - all in one transaction.
    - It is called from Better Auth's `databaseHooks.session.create.after`, i.e. on every login. It is cheap when there is nothing to do.
  - A user who arrives through an invitation has no `wachtendeBedrijfsnaam`, so no organisation is created.

- [ ] **Step 1: Write failing tests:**
  - with 3 projects without an organisation and a legacy row, the first verified login of a user with `wachtendeBedrijfsnaam` gives an organisation holding 3 projects and the company data;
  - a second user who registers afterwards gets an empty organisation;
  - the takeover is idempotent;
  - a user without `wachtendeBedrijfsnaam` (an invitee) gets no organisation;
  - `installateur.naam` is filled in only when empty;
  - if the takeover fails in the middle (inject an error), nothing is taken over and no organisation is created.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Apply the migration locally. The existing data in `elentrik` stays untouched until the user registers.
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): organisatie bij eerste aanmelding en overname van bestaande gegevens`

### Task 4: Access control on every route, plus the e2e login helper

**Files:**
- Create:
  - `apps/web/server/utils/toegang.ts`
  - `apps/web/e2e/hulp/inloggen.ts`
- Modify:
  - all route files in `apps/web/server/api/` (except `auth/`);
  - `server/projecten/repo.ts`, `server/exports/repo.ts`, `server/bestanden/repo.ts` and `server/bedrijf/repo.ts` (an organisation parameter);
  - all existing e2e specs (log in through the helper; remove `e2e/hulp/bedrijf.ts`).
- Test:
  - `apps/web/test/toegang.test.ts`
  - `apps/web/test/routes-beveiligd.test.ts`
  - the existing repo tests, updated

**Interfaces:**
- Produces:
  - `type Context = { gebruiker: { id: string; naam: string; email: string }; organisatieId: string; rol: "eigenaar" | "lid" }`.
  - `vereisSessie(event)` returns `{ gebruiker, actieveOrganisatieId }`. Without a session it throws 401.
  - `vereisLid(event, { organisatieId?, rol? })` returns `Context`:
    - the default `organisatieId` is the active organisation;
    - it checks membership in the database on **every** call;
    - not a member gives 404, a missing role gives 403.
  - `vereisProjecttoegang(event, projectId)` returns `Context & { project }`. It looks up the project's organisation and then checks membership. An unknown project, or no membership, gives 404.
  - `defineBeveiligdeHandler(handler)`: a wrapper that every route uses. It ensures at least that a session exists.
  - Repo functions:
    - `lijstProjecten(db, organisatieId)`;
    - `maakProject(db, organisatieId, …)`;
    - `haalProject` / `bewaarProject` / `verwijderProject` / `dupliceerProject` get an `organisatieId` parameter and filter on it.
  - `GET /api/bestanden/:id`: the file is accessible only if its project, or for a logo its `organisatie_id`, belongs to an organisation of the user. Otherwise 404.
  - Company details: GET for a `lid`, PUT and logo for `eigenaar` only.
  - `e2e/hulp/inloggen.ts`:
    - `maakTestgebruiker(request, { naam, email, bedrijf })` registers through the API, confirms through the Mailpit link and logs in. It returns `storageState`.
    - `gebruikTestgebruiker(test)` registers once per spec file in `beforeAll` and sets `test.use({ storageState })`.

- [ ] **Step 1: Write failing tests:**
  - **Static test** (`routes-beveiligd.test.ts`): every file under `server/api/` except `auth/**` contains `defineBeveiligdeHandler(`. Without it, the test fails with the path.
  - **Route table** (`toegang.test.ts`, PGlite, two organisations A and B with user a in A and user b in B):
    - for every route and method there is a row with the expected status: no session gives 401, user b on A's resources gives 404, and a lid writing the company details gets 403;
    - the routes are called through the handler functions with a fake H3 event and session, or through `$fetch` on a test Nitro instance. Choose one approach and use it consistently.
  - Repo tests: `lijstProjecten` shows only the organisation's own projects.
  - Duplicating a project stays within the same organisation.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Adjust all existing e2e specs to the login helper. Each spec file uses its own test user and organisation, so no state is shared.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` and the full Playwright suite. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): toegang per organisatie op elke route`

### Task 5: Organisation and member API

**Files:**
- Create:
  - `apps/web/server/api/mij.get.ts`
  - `apps/web/server/api/organisaties/actief.post.ts`
  - `apps/web/server/organisaties/leden.ts`, plus thin routes under `apps/web/server/api/organisaties/leden/*` and `…/uitnodigingen/*`
- Test: `apps/web/test/organisaties.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/mij` returns `{ gebruiker: { id, naam, email }, organisaties: { id, naam, rol }[], actieveOrganisatieId: string | null }`. The `rol` is translated to `eigenaar` or `lid`.
  - `POST /api/organisaties/actief` with `{ organisatieId }` checks membership (404 otherwise) and sets the active organisation in the session.
  - Renaming the organisation: eigenaar only. The name must have 1–80 characters after trimming. A lid gets 403.
  - Member management (eigenaar only, except leaving):
    - list members with their role;
    - change a role;
    - remove a member;
    - list, create and revoke invitations;
    - leave the organisation yourself.
  - Rule: **the last eigenaar can never** be removed, demoted to lid or leave. The server answers 409 with the code `LAATSTE_EIGENAAR`.
  - Accepting an invitation is allowed only when the account e-mail matches the invitation and is confirmed. An invitation can be used once and expires after 7 days; otherwise the server answers 410.
  - Registering through an invitation link: the e-mail counts as confirmed (the link came through that address). No organisation of their own is created, and the invitation is accepted at once.
  - Use Better Auth's organization API underneath. Add the rules above with hooks or in the wrapper routes, wherever Better Auth does not already guarantee them. A test proves each rule.

- [ ] **Step 1: Write failing tests:**
  - `GET /api/mij` uses the Dutch roles;
  - switching to an organisation you are not a member of gives 404;
  - a lid changing roles gives 403;
  - the last eigenaar demoting themselves, being removed or leaving gives 409 `LAATSTE_EIGENAAR`, while the same action with two eigenaars works;
  - a removed member loses access immediately: the next project request gives 404;
  - an invitation for `a@x` accepted by `b@x` is refused;
  - an expired invitation gives 410, and a second use gives 410;
  - registering through an invitation gives no organisation of their own and makes the user a member right away.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): leden, uitnodigingen en wisselen van organisatie`

### Task 6: Login pages, middleware and organisation UI

**Files:**
- Create:
  - `apps/web/app/pages/inloggen.vue`, `registreren.vue`, `wachtwoord-vergeten.vue`, `wachtwoord-herstellen.vue`, `uitnodiging/[id].vue`, `organisatie.vue` and `geen-organisatie.vue`
  - `apps/web/app/middleware/aangemeld.global.ts`
  - `apps/web/app/stores/sessie.ts`
  - `apps/web/app/components/OrganisatieKeuze.vue`, `GebruikerMenu.vue`
- Modify:
  - `apps/web/app/pages/index.vue` (top bar)
  - `apps/web/app/components/editor/EditorBovenbalk.vue` (organisation choice and user menu)
  - `apps/web/app/pages/instellingen.vue` (read-only for a lid)
  - `apps/web/i18n/locales/nl.json`
- Test: `apps/web/test/sessie-store.test.ts`, `apps/web/test/aangemeld-middleware.test.ts`, plus a pure redirect function

**Interfaces:**
- Produces:
  - `useSessieStore()` with `gebruiker`, `organisaties`, `actieveOrganisatie`, `rol`, `laad()`, `wissel(organisatieId)` and `uitloggen()`.
  - `wissel` and `uitloggen` call a `voorVertrek` callback that the editor page registers (Task 7) before they continue.
  - Middleware:
    - public pages are `/inloggen`, `/registreren`, `/wachtwoord-vergeten`, `/wachtwoord-herstellen` and `/uitnodiging/*`;
    - without a session it redirects to `/inloggen?terug=<path>`, and `terug` must be a local path, never an external URL;
    - a logged-in user without an organisation goes to `/geen-organisatie`.
  - The pure function `bestemming(route, sessie): string | null` holds the logic, and the middleware calls it.
  - Pages:
    - **`/registreren`:** naam, e-mail, wachtwoord (min. 10), bedrijfsnaam. It sends `wachtendeBedrijfsnaam` and then shows "Bevestig je e-mailadres via de link die we stuurden."
    - **`/inloggen`:** e-mail and wachtwoord, or "Stuur me een inloglink". The neutral notice is "Als dit adres bekend is, ontvang je een link." An unconfirmed account shows a notice with "Bevestigingsmail opnieuw sturen".
    - **`/uitnodiging/[id]`:** it shows the organisation and the role.
      - Logged in with the right address: an "Aanvaarden" button.
      - Not logged in: a choice between logging in or registering. That registration has no bedrijfsnaam field, and the e-mail is fixed.
      - Wrong address: an explanation.
    - **`/organisatie`:**
      - members with their role, and invitations with their expiry date;
      - inviting, changing roles, removing and revoking are visible to an eigenaar only;
      - "Organisatie verlaten" for everyone;
      - error code `LAATSTE_EIGENAAR` shows "Er moet minstens één eigenaar blijven.".
    - **`/geen-organisatie`:** "Maak een nieuw bedrijf aan" (a name) or "Vraag een collega om een uitnodiging".
    - **Top bar:** `OrganisatieKeuze` (dropdown, testid `organisatie-keuze`) and `GebruikerMenu` (naam, "Mijn organisatie", "Bedrijfsgegevens", "Uitloggen").

- [ ] **Step 1: Write failing tests:**
  - `bestemming`: without a session it gives `/inloggen?terug=…`, a public page gives `null`, and a session without an organisation gives `/geen-organisatie`;
  - `terug=https://evil` is ignored;
  - the session store: `wissel` calls `voorVertrek` before the switch, and stops if `voorVertrek` returns `false`.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Check every page by hand in the browser at desktop and phone widths.
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` and Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): inlogpagina's, organisatiekeuze en ledenbeheer`

### Task 7: Editor integration

**Files:**
- Modify:
  - `apps/web/app/composables/concepten.ts` (key per user)
  - `apps/web/app/composables/useAutosave.ts` (a 401 path)
  - `apps/web/app/pages/projecten/[id].vue`
  - `apps/web/app/stores/editor.ts` (`door` = user name)
  - `apps/web/app/components/editor/EditorBovenbalk.vue`
  - `nl.json`
- Test: `apps/web/test/concepten.test.ts`, `apps/web/test/autosave.test.ts`, `apps/web/test/editor-store.test.ts`

**Interfaces:**
- Produces:
  - Draft key `concept:<userId>:<projectId>:<instantie>`. The functions get a `userId` parameter.
  - `nieuwsteConcept(projectId, userId)` offers only that user's own drafts, plus legacy drafts without a user. The legacy keys `concept:<projectId>` and `concept:<projectId>:<instantie>` are recognised by the absence of a user part. They are offered only once, to the first logged-in user who opens that project.
  - Autosave: a 401 from the PUT gives status `lokaal` with `afgemeld: true` and no retry loop. The draft stays.
  - The editor then shows the banner "Je bent afgemeld. Log opnieuw in om op te slaan." with a "Opnieuw inloggen" button. That opens `/inloggen?terug=<huidige pagina>` in a new tab. After returning (window focus), "Opnieuw proberen" saves.
  - Opening a project from another organisation the user is a member of (the GET answers with the organisation): `sessie.wissel` to that organisation, plus the toast "Je werkt nu in {organisatie}.". The GET of the project returns the `organisatieId`.
  - `voorVertrek` for the editor page: `await nuOpslaan()`. If the status is still not `opgeslagen` afterwards, a confirmation follows: "Er zijn wijzigingen die nog niet op de server staan. Ze blijven lokaal bewaard voor dit account. Toch doorgaan?".
  - `zetAfwijking`: `door` is the name of the logged-in user. The TODO is removed.

- [ ] **Step 1: Write failing tests:**
  - drafts of user A are never offered to user B;
  - a legacy draft is offered once;
  - autosave on a 401 gives `lokaal` and `afgemeld`, with no retry timer;
  - after a successful `nuOpslaan`, `afgemeld` clears;
  - `zetAfwijking` uses the user name.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test`, `pnpm typecheck` and Playwright. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): editor met aanmelding, concepten per gebruiker`

### Task 8: End-to-end flows

**Files:**
- Create: `apps/web/e2e/aanmelden.spec.ts`, `apps/web/e2e/organisaties.spec.ts`

- [ ] **Step 1: Write the specs.** Mails come from Mailpit through `e2e/hulp/mailpit.ts`.
  1. **Registration and takeover:**
     - in the global setup database, seed 2 projects without an organisation and a legacy company data row, directly through `postgres`, before this spec;
     - register "Bedrijf A", confirm through the mail and log in;
     - the 2 projects are in the list and the company data is present.
  2. **Login methods:**
     - log out and log in with the password;
     - log out and request a login link, follow the link: logged in;
     - a login link for an unknown address shows the same neutral notice and no mail arrives.
  3. **Invitation:**
     - the eigenaar of A invites `collega@…` as lid;
     - the colleague registers through the link without a company name field;
     - they see A's projects and can edit one;
     - `/instellingen` is read-only for them.
  4. **Separation and switching:**
     - user B with "Bedrijf B" does not see A's projects;
     - B navigates directly to `/projecten/<id van A>` and gets "Project niet gevonden";
     - a user who is a member of A and of B switches through `organisatie-keuze`, and the lists switch with them.
  5. **Last owner:** the eigenaar demoting themselves, or leaving, shows "Er moet minstens één eigenaar blijven.".
  6. **Session expires while drawing (Review Focus 3):**
     - delete the session of the logged-in user through the DB;
     - make a change and wait for autosave: the banner "Je bent afgemeld" appears;
     - log in again in a new tab (or the same context), return and click "Opnieuw proberen": the status becomes "Opgeslagen" and the change is on the server.
- [ ] **Step 2: Run** the full Playwright suite twice. Expected: PASS. A failing step is a bug in Tasks 1–7: fix it there, with a regression test.
- [ ] **Step 3: Run** `pnpm test` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 4: Commit** `test(web): end-to-end aanmelden en organisaties`
