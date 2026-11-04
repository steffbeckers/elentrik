---
version: 1
slug: "apps-web-app-pages-admin-index-vue"
primary_target: "apps/web/app/pages/admin/index.vue"
related_targets: ["apps/web/app/layouts/admin.vue","apps/web/app/components/admin"]
---

# Admin dashboard surface
Scope: /admin and its user, company, project, audit and support-editor routes. Mode: Operate. Audience: the independent Elentrik superuser resolving support cases. Approved written design: docs/superpowers/specs/2026-11-03-admin-dashboard-design.md. The user declined a browser mockup and explicitly approved implementation.

## Direction contract
THESIS: Find the right record, understand its state, correct it with evidence. Search and linked tables are the primary tools; metrics stay compact.
OWN-WORLD: Inherit the established Nuxt UI blue/slate palette, typography, Lucide icons, bordered tables and focused forms. Preserve light/dark themes.
STORY: Overview reveals attention items; search finds explicit targets; details explain access and related records; reasoned corrections appear in history.
FIRST VIEWPORT: Header with title, search, account and return-to-app; compact horizontal navigation; page title, reference time and linked counts; attention lists beneath. Details start with identity and named actions.
FORM: User-pinned written direction; no seed round or mockup. Desktop tables become horizontally scrollable on narrow screens, with wrapping filters and visible labels. Support editor retains its existing drawing surface and adds a persistent reason/session banner.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Constraints: three existing locales; no active-company selector in admin; ordinary customer flows preserved. No new raster assets or visual-world replacement. Independent finish review and incumbent-system documentation check required.
