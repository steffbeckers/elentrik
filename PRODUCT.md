# Elentrik

<!-- impeccable:product-schema 1 -->

Product context confirmed with the user on 2026-11-01. Applies to the whole repository, including `apps/web`. Repository evidence below describes this checkout; it is not proof of production deployment.

## Platform

web

## Users

The primary users are small Belgian electrical installation businesses. Installers document electrical installations and prepare dossiers for inspection. Company owners also manage colleagues, company details, and subscriptions.

## Product Purpose

Help an installer turn a residential electrical installation into a complete inspection dossier: a single-line diagram, a layout plan, a circuit list, and AREI findings. The intended outcome is faster dossier preparation with less manual drawing and duplication. Faster than desktop alternatives is a product goal, not a measured performance claim.

## Positioning

A browser-based alternative to desktop drawing software, combining automatic single-line diagram layout, reusable circuit templates, and live AREI findings. Simplicity and affordability for small installation businesses are product aims; do not invent comparative pricing or superiority claims.

## Operating Context

- Projects belong to an organisation, with owner and member roles.
- The core workflow is: create a project, enter installation and customer details, build the electrical structure, place its points on an imported or drawn floor plan, review findings, and export a PDF dossier.
- Single-line diagram placement follows the electrical structure and automatic layout. The layout plan supports placing symbols on an imported PDF/image or an editable floor plan drawn with the embedded OpenPlan3D 2D editor.
- Editing includes keyboard shortcuts, undo/redo, automatic saving, local draft recovery, and explicit conflict handling. Local recovery does not imply full offline support or real-time collaboration.
- Interface language and dossier language are separate choices. Customer-entered text is not translated automatically.

## Capabilities and Constraints

Present in the codebase:

- Project management, authentication, organisations, invitations, company settings, and Stripe subscription integration.
- Single-line diagram editing, templates, symbol variants, layout plans, a derived circuit list, live findings, and motivated deviations.
- A derived materials list groups component quantities by specification. Optional route lengths supply cable metres (XVB) or conductor metres (VOB); missing lengths remain visibly incomplete. Totals exclude cutting waste and spare length, with no VOB colour breakdown.
- PDF dossier export with selectable sections and A4/A3 paper sizes.
- Dutch (`nl-BE`, default), Belgian French (`fr-BE`), and British English (`en-GB`). New user-facing text must cover all three languages.
- Shared model, analysis, symbols, layout, and rendering packages support consistent screen and export output.

Boundaries to preserve:

- The current AREI rule set is explicitly unpublished, with unreviewed rules and provisional parameters. Live findings must not be represented as certification, a complete regulatory assessment, or guaranteed inspection approval. Expert validation remains outstanding.
- Symbols must follow the AREI reference specified in the approved symbol design. Broader symbol coverage and user-supplied custom symbols are later scope, not existing promises.
- Original code, symbols, translations, and copy are required. Do not reuse material from competing software.
- Full offline operation, real-time collaboration, native mobile apps, DWG import, full architectural/3D modelling, competitor project import, priced materials lists, and external trade integrations are outside the recorded MVP scope.
- Billing depends on configuration; the code uses Stripe. The original MVP's Mollie proposal is superseded. Do not infer current commercial prices from the old plan.

## Brand Commitments

The product name is Elentrik. Preserve Belgian electrical terminology and the shared glossary in `docs/vertalingen.md`. Belgian French uses “vous”; English follows British usage. Technical labels on diagrams retain their Belgian notation across languages. User-facing wording should explain the user's task and outcome in the selected language.

## Evidence on Hand

- `docs/superpowers/specs/2026-10-17-elentrik-mvp-design.md`: original purpose, users, clean-room constraints, workflow, and scope. Historical proposals must be checked against newer decisions and code.
- `docs/superpowers/specs/2026-10-23-elentrik-abonnementen-design.md` and `apps/web/server/abonnementen/config.ts`: Stripe subscription direction and implementation.
- `docs/vertalingen.md`, `docs/lokaal-en-online.md`, and `apps/web/nuxt.config.ts`: terminology, language behaviour, and operating documentation.
- `docs/superpowers/specs/2026-10-30-elentrik-symbolen-arei-design.md`: approved symbol requirements and explicitly deferred additions.
- `apps/web/app/pages`, `apps/web/app/components`, and `apps/web/e2e`: current workflows, UI, and executable test scenarios. Test presence alone does not establish that tests pass.
- `packages/arei/src/regelsets/arei-2020`: current rule-set status and provisional parameters.
- `packages/symbols/test/__snapshots__` and `packages/render`: technical drawing fixtures and export implementation, not customer endorsements.

No verified customer testimonials, comparative timing results, inspection approvals, or market adoption evidence were established during initialization. Do not fabricate these.

## Product Principles

1. Reduce repeated work between the electrical model, diagrams, circuit list, and dossier.
2. Preserve electrical meaning and traceability across editing, translation, and export.
3. Make saving, recovery, conflicts, and access restrictions understandable without losing user work.
4. Keep common installer tasks quick; supplementary tools must not obstruct the core drawing workflow.
5. Separate implemented functionality, planned scope, provisional findings, and validated claims.

## Open Decisions

- A product-specific accessibility standard and supported device/input matrix have not been confirmed. Existing keyboard workflows and translated accessibility labels are evidence to preserve, not proof of conformance.
- Regulatory expert review and native-speaker review remain follow-up work in the recorded sources; this initialization does not establish their completion.
- No new visual direction is established by this product record.
