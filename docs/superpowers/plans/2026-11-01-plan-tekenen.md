# Plan tekenen Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline.

**Goal:** Create and reopen editable OpenPlan3D floor plans inside the situation-plan workflow.
**Architecture:** Vendored 2D canvas in a same-origin iframe; versioned editable project data and raster frame in the model; PNG uploaded through existing API.
**Tech Stack:** Nuxt/Vue, Svelte 5, Vite, Zod, Vitest, Playwright.
**Spec:** docs/superpowers/specs/2026-11-01-plan-tekenen-design.md

## Global Constraints
- Preserve existing uploads, electrical nodes, export, undo, read-only and NL/FR/EN.
- No remote editor hosting or outbound project data.
- Keep third-party license and upstream revision.

## Review Focus
- Reopening and resizing a drawing must preserve symbol world positions.
- Upload failure, cancellation and concurrent document changes must not overwrite work.
- Invalid iframe messages must not mutate a document.
- Old documents must remain valid; replacing an uploaded background clears its drawing source.
- The embedded build must ship with production output and work after refresh.

## Tasks
- [x] 1. Model tests RED, add versioned drawing schema and atomic operation, verify GREEN including coordinate conversion and undo.
- [x] 2. Vendor the 2D dependency closure, add isolated build and localized shell, export a bounded PNG with stable world mapping. Build and browser-check wall/door/window editing.
- [x] 3. Add store methods, bridge validation tests RED/GREEN, guarded upload workflow, new/edit entry points and translations.
- [x] 4. Verify unit tests, typecheck, builds and real browser drawing/reopen/placement; independent review and documentation.

## Execution notes
- Existing managed checkout /workspace/elentrik on task branch work is clean and retained.
- Prior user selection of OpenPlan3D and explicit implementation request authorize this integration; no renewed approach approval is requested.

- Review: Ctrl+S before inline text blur lost the last edit; fixed with blur + Svelte tick before export. Browser regression added.
- Validation: full unit suite 3,198/3,198 and performance suite 5/5 pass. Workspace typecheck and final production build pass; the output contains the editor and MIT license.
- Chromium: drawing walls/door/window, Ctrl+S text, save/reload/reopen, coordinate preservation after extending, cancellation and PDF image export pass. Existing PNG/PDF upload and touch-drag scenarios also pass (3 browser tests).
- Browser regression: upstream fitted the view after the first new wall and moved subsequent drawing coordinates. Empty floors now start with the initial fit completed; existing plans still fit on opening. The browser test asserts the unchanged 100% zoom.
- Independent code/visual review found no remaining blockers. Desktop and 390px mobile screens were inspected; generated room names are localized in NL/FR/EN.

## PR integration
- Integrated develop at 8dd888d, preserving its editor layout, page formatting and translations.
- Extended coordinate conversion to preserve the newly introduced label offsets when the drawing resolution changes; regression test verified RED/GREEN.
- Aligned the embedded editor with Nuxt on Vite 8.3.4 using Svelte plugin 7.3.1 to avoid Nuxt resolving Vite 7 configuration types after a clean dependency install.
- Combined tree: 3,277 functional tests and 5 performance tests pass, along with workspace typecheck and production build.
- Chromium on the combined tree: drawing/reopen/coordinate/PDF flow and touch pass; the existing upload flow passes after adapting its completion assertions to the dossier checklist introduced on develop.
