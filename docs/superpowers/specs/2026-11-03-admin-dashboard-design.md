# SB-5: Elentrik administration and support

Status: proposed design, awaiting approval. No implementation is described as shipped.

## Intent and agreed scope

Give selected Elentrik administrators an overview of users, companies, subscriptions, and projects, with enough context to investigate customer questions and correct data without direct database edits.

Sources:

- [SB-5](https://linear.app/steffbeckers/issue/SB-5/admin-dashboard), created 2026-11-03; description read on 2026-11-03. It calls for a restricted `/admin` area and identifies future bug reports as a later extension.
- The user confirmed in this conversation that overview and insights should be accompanied by updates to user names, company details, and projects when needed, and welcomed audit history.
- The user chose a written design without a browser mockup.
- `PRODUCT.md` supplies product, language, and scope constraints. The code references below describe this checkout, not production deployment.

The user confirmed the functional scope. Details explicitly marked as design decisions below are proposals, not previously agreed business rules.

## Approaches

1. Overview and simple record corrections only: smaller, but insufficient for the requested project support.
2. An administration area with dedicated access controls and the existing project editor in support mode: provides the requested corrections while preserving document validation, drawing behaviour, recovery, and version conflicts. **Selected direction based on the user's expanded scope; the implementation details below are proposed.**
3. Impersonating customers or creating a separate project editor: adds identity ambiguity or duplicates complex editor behaviour. Neither is needed for the stated outcome.

This is a substantial feature spanning permissions, administrative queries and edits, editor integration, migrations, and audit history. Build it in reviewable stages, but acceptance requires working project corrections as well as the overview.

## 1. Permissions and entry

Design decision: add an independent `superuser` boolean to the user record, default false. Existing company roles remain `owner` and `member`; company ownership grants no system administration rights.

- Keep Better Auth for sign-in. Read the authoritative superuser flag from the database on every admin API request; never accept it from a client or an ordinary profile update.
- `/api/mij` exposes whether the current user is a superuser so the user menu can show **Administration**. The flag is presentation data, not proof of permission for subsequent requests.
- Protect every `/admin` page and `/api/admin` endpoint. Signed-out requests require sign-in; authenticated non-superusers receive a forbidden response with no record content.
- Superusers can use `/admin` without belonging to a customer organisation or having an active organisation. Customer pages retain their existing membership rules.
- Dedicated admin endpoints reuse session, expected-user, CSRF, validation, and error-handling primitives. Do not introduce a global superuser bypass into ordinary customer routes.
- Use explicit target user, organisation, and project IDs. Switching the active company in another tab cannot change which record an admin request edits.
- Bootstrap and revoke superusers through an operator-only documented database procedure using an existing, verified account's exact user ID. No self-service promotion or role-management screen in this release. Registration and normal Better Auth update paths must not accept the flag.
- Revocation rejects the next admin request, including an already-open editor's next save. The UI clears protected query caches on sign-out or account change.

## 2. Overview and insights

`/admin` opens an operational overview. Values come from stored records; a failed query shows an error, never a fabricated zero.

Show:

- Total users, companies, and non-deleted projects, each linking to its list.
- New users and companies in the last 30 days; projects changed in the last 30 days, labelled as changes rather than unique user engagement.
- Companies grouped by effective access: exempt, in the local trial, active subscription access (including Stripe `trialing`), payment grace, and read-only, following existing subscription/access logic. These groups are mutually exclusive under that logic. An active-access group is not evidence of a completed payment.
- Lists for attention: trials ending in the next seven days, recorded payment problems, and companies whose access is read-only. Link to the relevant company detail.
- Recently changed projects and recent administrator corrections.

Design decisions:

- Evaluate all time windows against one server-provided reference time per response; rolling day windows use UTC. Display dates in the administrator's selected locale.
- Show when the overview was fetched. Subscription detail shows its recorded synchronisation time and identifies it as recorded Stripe data.
- When billing is disabled, show that state explicitly and omit payment-derived attention groups. Do not imply that every company has a paid subscription.
- No revenue, last-login, customer satisfaction, or live usage claims: the current data does not establish those metrics. Use aggregation queries and bounded result sets, not loading all project documents.

## 3. Lists, details, and corrections

All lists use server-side search, filters, stable ordering with an ID tie-breaker, and bounded pagination (default 25, maximum 100 rows). Search/filter state lives in the URL. Detail screens connect related records so support can move from user to company to project without repeating searches.

### Users

List name, email, creation date, and company count. Search name and email. Detail shows verification state and company memberships, with links to those companies.

Allow changing the display name. Keep email and authentication state visible but read-only in this release; changing login identity, passwords, verification, or account ownership is a separate workflow. A name change uses normal validation and refreshes any currently affected client session display.

### Companies

List company name, owner information, member count, project count, and effective access/subscription state. Search company name and owner email; filter by effective access and recorded subscription status.

Detail includes:

- Organisation display name and installer/company details using the existing `Partij` fields and validation.
- Members and their roles, linked to user details.
- Projects, linked to project details.
- Trial end, exemption state, recorded Stripe status and plan, period end, cancellation state, synchronisation time, and Stripe identifiers when present.
- Audit history for this company and its project corrections.

Allow changing the organisation display name and textual installer/company details. Preserve the current logo. Existing dossier snapshots and completed exports remain historical; subsequent operations use the corrected details according to existing application behaviour.

Subscription information is observational in this release, with external Stripe Dashboard links for records that have a Stripe ID and a known test/live environment. Do not construct a misleading link if that environment is unavailable. Trial, exemption, plan, payment, and cancellation changes are outside the selected correction scope.

### Projects

List project name, customer name, company, version, creation time, and last modification time. Search project/customer/company name and filter by company. Default to non-deleted projects; a deleted-record filter shows metadata and audit history without enabling edits.

Detail shows the company, project/customer information, version, existing export metadata, and audit history. Provide **Open project** for an initial read-only view and **Correct project** to start support editing.

Corrections include project name, customer/installation data, electrical structure, diagram properties, and layout-plan contents through the existing editor. This is full document correction, not merely renaming. Existing validation and provisional AREI wording continue to apply.

## 4. Support project editor

Design decision: extract a reusable editor view from `app/pages/projecten/[id].vue`, with explicit customer and admin contexts. The admin route is `/admin/projecten/:id/bewerken`. Share drawing and editing logic, with a context-specific API adapter for documents, files, export history, and navigation.

- Opening a project starts read-only. **Correct project** asks for a short support reason and creates a server-owned correction session tied to the administrator, authenticated session, project, and organisation. It expires after at most eight hours or on explicit completion; no reason is sent in URL query strings.
- Show a persistent support banner naming the company and project, the administrator's mode, and the correction reason. The return link leads to the project's admin detail.
- Keep autosave and its visible save status. All successful saves carry the correction-session ID; the server verifies its actor, sign-in session, project, expiry, and current superuser permission. A new reason starts a new correction session.
- Group consecutive autosaves under that correction session in history, while retaining each committed version's evidence. Completing the correction waits for the pending save; expiry or revocation stops further saves and explains why.
- Preserve optimistic concurrency (`If-Match` and the project version), document schema validation, request limits, and plan-file ownership checks. A concurrent customer/admin edit returns a conflict; never silently overwrite it.
- On conflict, offer loading the latest server version or downloading the local work for recovery. The customer editor's duplication/new-project recovery actions are not exposed in support mode because they could create records in an unintended organisation.
- Local drafts are scoped to administrator ID, project ID, and admin/customer mode. Recovering a support draft requires a fresh valid correction session before saving. Sign-in as a different user never resumes it automatically.
- Support corrections can save for a company whose subscription currently blocks customer writes. This exception belongs only to the dedicated admin endpoints; it does not change the company's subscription or customer access. Storage quotas and upload validation still apply.
- Reading existing plans and exports, and uploading/replacing plan backgrounds used by a correction, use dedicated admin file routes. File authorization derives its project/company from the database, not from a supplied organisation ID. Existing logo access needed for display is similarly scoped.
- Support mode does not expose creating, duplicating, deleting, restoring, transferring projects, or generating new exports. Existing exports can be inspected/downloaded. Controls and keyboard shortcuts must both obey these capabilities, and unsupported operations have no admin endpoint.

## 5. Audit history

Audit history covers successful administrative mutations from this feature, not a retroactive log of customer activity or all reads.

Each entry records server time, actor ID and a display-name snapshot, target type and ID, associated company/project where applicable, action, reason, and before/after values. Do not log authentication tokens, passwords, verification tokens, or billing secrets. Render entered values as text.

- Name/company forms require a short reason and explicit save. Only changed fields appear in the before/after view. No-op submissions do not create change entries.
- Project changes retain immutable before and after document revisions with project names and version numbers. The history list shows a concise summary; a detail view compares changed fields/paths and can expose the retained document versions to superusers. Avoid dumping entire documents into list responses.
- Record support plan uploads with their file metadata and correction-session ID; document saves identify which uploaded plans become referenced. File bytes stay in the existing storage layer. Preserve referenced revision files from cleanup so an audit record does not claim restorable evidence whose files were silently discarded.
- Commit each database mutation and its audit entry in one transaction. Audit insertion failure rolls back the mutation. For uploads, use the existing file cleanup approach if the database transaction fails; unused physical-file remnants are not successful customer-data changes.
- Project revision capture and save happen under the same project lock/version check. User/company forms submit the values or revision token they loaded; compare against locked current values and return a conflict if the edited record changed meanwhile.
- A client-generated mutation ID, scoped to the actor and operation, makes a retried successful admin request return its original result without a second mutation or audit entry. Reuse with a different payload is rejected. This also protects autosave retries after a lost response.
- History is available globally and filtered by entity, actor, date, and action; it uses bounded pagination. All views require current superuser permission.
- Audit records are append-only through the application, with no edit/delete API. Database operators remain technically able to modify them; this is not a claim of cryptographic tamper resistance.
- Keep history and revisions until an explicit retention policy is introduced. No automated rollback is offered: a later correction creates another audited version. Index lookup fields and fetch large revision payloads only on demand.
- Integrate retained revisions with `server/bestanden/opruimen.ts`: its current project purge and orphan-file cleanup must recognise audit references. A deleted project with retained revision files stays as a deleted, non-editable record until those references can be released under a future explicit retention policy. Audit targets and actor snapshots must also survive removal of the original user/entity record without cascading away history. Retained files continue to count under existing storage accounting; do not silently promise unlimited recovery storage.

## 6. Interface direction

Mode: Operate. Extend the established Nuxt UI interface, including its blue primary colour, slate neutrals, existing typography, Lucide icons, translated forms, tables, and light/dark behaviour. No product-wide redesign or new UI framework.

Use a dedicated admin shell with navigation for Overview, Users, Companies, Projects, and Audit history. On narrow screens, use compact navigation and preserve accessible search/filter controls. Keep the active company selector out of the admin shell because admin targets are explicit; retain the user menu and a clear return to the customer app.

The overview begins with a heading and reference time, a compact row of linked counts, and attention lists with direct routes to affected companies. Searchable lists carry the primary work; details use a clear identity heading followed by record information, related records, and history. Editing begins from a named action and shows a focused form with reason, save, cancel, and pending/error feedback.

Provide loading, empty, no-results, forbidden, unavailable, stale-edit/conflict, and success states. Do not clear unsaved form data on a failed save. Keyboard navigation, labelled controls, visible focus, narrow-screen layouts, and all three languages (`nl-BE`, `fr-BE`, `en-GB`) are required. Use the existing glossary and date-formatting conventions.

## 7. Implementation boundaries and evidence

Build within the existing Nuxt/Vue, Better Auth, Drizzle/PostgreSQL, and shared model packages. No new service or external analytics dependency is required.

Relevant existing seams:

- `server/db/schema.ts`: users, organisations, memberships, project versions, files, snapshots, and subscription data; new migrations add superuser status, correction sessions, and audit/revision storage.
- `server/utils/toegang.ts`, `server/api/mij.get.ts`, `server/organisaties/leden.ts`, `shared/mij.ts`, `app/sessie/bestemming.ts`: session checks, current-user presentation, and organisation-free admin entry.
- `server/abonnementen/repo.ts`, `toegang.ts`, and `beheer.ts`: effective access and recorded subscription data; preserve their semantics in overview grouping.
- `server/utils/bedrijf.ts` and `server/bedrijf/repo.ts`: validated company text updates and logo preservation.
- `server/projecten/repo.ts`, especially `bewaarProject`: transaction, row lock, document validation, version conflict, and plan-reference checks to reuse without weakening customer access.
- `app/pages/projecten/[id].vue`, `useProjectenApi`, `useBestandenApi`, `useExportsApi`, autosave and draft recovery: shared editor behaviour with explicit support capabilities and transport.
- Existing API, access-control, PGlite, translation, autosave, and Playwright tests provide verification patterns.

## 8. Acceptance and verification

1. Anonymous and ordinary users cannot obtain any admin data or perform admin actions by calling endpoints directly. Owners are not superusers. Forged flags, wrong correction targets, expired sessions, account changes, and revoked superuser rights are rejected.
2. A superuser without a customer membership can browse/search all four record types, follow relations, and see correct counts/attention groups, including billing-disabled, empty, and error states.
3. A user-name or company-detail correction persists valid data and its actor/reason/before/after evidence atomically. Concurrent updates are rejected, and a retry cannot repeat a successful action.
4. A superuser can correct and save actual project contents and layout plans, including for a read-only customer subscription. Customer membership/billing restrictions remain unchanged.
5. Concurrent customer/support saves yield a version conflict. Invalid documents and cross-project file references remain rejected. Draft recovery and changed-login handling never move data into another account or company.
6. Every successful support save/upload has audit evidence; failed transactions have no committed change entry. History remains available after renaming entities, and lists do not expose large or sensitive payloads.
7. Normal customer editing, uploads, recovery, exports, and organisation switching continue to work after extracting the shared editor.
8. Focused database/API tests cover permission and transactional boundaries; editor tests cover routing/capabilities and conflict/recovery cases; browser checks cover the admin workflow and a representative normal customer workflow. Type checks, translation checks, and relevant existing suites pass. Inspect the dashboard at desktop and narrow widths in the existing theme.

## Builder discretion

The builder may choose component decomposition, concrete table/index names, query strategy, pagination implementation, diff presentation, and validation limits consistent with existing conventions. These choices must preserve the behaviours above. Broader account management, billing mutations, bug-report intake, audit retention policy, and automatic rollback require a later scope decision.
