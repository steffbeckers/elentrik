// Geen hardgecodeerde tekst in de interface (plan 8, Task 5). Een statische scan van app/:
// - in elke `<template>` van een `.vue` geen tekstknoop en geen attribuut `label`, `title`,
//   `placeholder`, `aria-label`, `description` of `alt` met letters, tenzij via `$t(`/`t(` of een
//   binding (`:label="..."`);
// - in `.ts` en in `<script>` van een `.vue` geen toast- of meldingtitel als letterlijke tekst
//   (`title: "..."`, `description: "..."`);
// - geen vaste locale `"nl-BE"` voor `Intl`: getallen, bedragen en datums volgen de taal (R4).
// Wat letterlijk mag, staat in `UITZONDERINGEN`: merknamen, eenheden en symbolen.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..");
const APP = join(WEB, "app");

/**
 * Woorden die in elke taal dezelfde zijn en dus letterlijk in een template mogen staan.
 * - merknamen: Elentrik, Stripe;
 * - eenheden: mm, mm², px, A, mA, kA, W, V, MB.
 */
const UITZONDERINGEN: ReadonlySet<string> = new Set(["Elentrik", "Stripe", "mm", "mm²", "px", "A", "mA", "kA", "W", "V", "MB"]);

/** Attributen die tekst voor de gebruiker dragen. */
const TEKSTATTRIBUTEN = ["label", "title", "placeholder", "aria-label", "description", "alt"];

function bestanden(map: string, extensie: string): string[] {
  return readdirSync(map, { withFileTypes: true, recursive: true })
    .filter((d) => d.isFile() && d.name.endsWith(extensie))
    .map((d) => join(d.parentPath, d.name))
    .sort();
}

function pad(bestand: string): string {
  return relative(WEB, bestand).replaceAll("\\", "/");
}

/** De woorden met letters die geen uitzondering zijn. */
function woordenMetLetters(tekst: string): string[] {
  return (tekst.match(/[\p{L}\p{N}²]*\p{L}[\p{L}\p{N}²]*/gu) ?? []).filter((w) => !UITZONDERINGEN.has(w));
}

/** De template van een SFC: van de eerste `<template>` tot de laatste `</template>`. */
function templateVan(bron: string): string {
  const begin = bron.search(/<template[\s>]/);
  const einde = bron.lastIndexOf("</template>");
  if (begin < 0 || einde < 0) return "";
  return bron.slice(begin, einde);
}

/** De `<script>`-blokken van een SFC. */
function scriptVan(bron: string): string {
  return [...bron.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
}

type Vondst = { regel: number; tekst: string };

/** Het regelnummer (1-gebaseerd) van een positie in een tekst. */
function regelVan(tekst: string, positie: number): number {
  return tekst.slice(0, positie).split("\n").length;
}

/**
 * Tekstknopen en tekstattributen met letters in een template. Een eenvoudige tokenizer: een tag loopt
 * tot de eerste `>` buiten aanhalingstekens, zodat `v-if="a > b"` geen tekst wordt. Commentaar telt
 * niet; `{{ ... }}` is een binding en telt ook niet.
 */
function scanTemplate(template: string): Vondst[] {
  const bron = template.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, " "));
  const vondsten: Vondst[] = [];
  let i = 0;
  while (i < bron.length) {
    if (bron[i] === "<") {
      let j = i + 1;
      let quote: string | null = null;
      while (j < bron.length) {
        const c = bron[j]!;
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === ">") break;
        j++;
      }
      const tag = bron.slice(i + 1, j);
      if (!tag.startsWith("/")) {
        for (const m of tag.matchAll(/(?:^|\s)([\w:.@#-]+)\s*=\s*("[^"]*"|'[^']*')/g)) {
          const naam = m[1]!;
          if (!TEKSTATTRIBUTEN.includes(naam)) continue; // `:label` en `v-bind:label` zijn bindingen
          const waarde = m[2]!.slice(1, -1);
          if (woordenMetLetters(waarde).length > 0) {
            vondsten.push({ regel: regelVan(bron, i + 1 + (m.index ?? 0)), tekst: `${naam}="${waarde}"` });
          }
        }
      }
      i = j + 1;
      continue;
    }
    const volgende = bron.indexOf("<", i);
    const eind = volgende < 0 ? bron.length : volgende;
    const tekst = bron.slice(i, eind).replace(/\{\{[\s\S]*?\}\}/g, " ");
    if (woordenMetLetters(tekst).length > 0) vondsten.push({ regel: regelVan(bron, i), tekst: tekst.trim() });
    i = eind;
  }
  return vondsten;
}

/** `title: "..."` of `description: "..."` met letters: een letterlijke toast- of meldingtekst. */
function scanMeldingen(script: string): Vondst[] {
  return [...script.matchAll(/\b(title|description)\s*:\s*(["'`])((?:(?!\2).)*)\2/g)]
    .filter((m) => woordenMetLetters(m[3]!).length > 0)
    .map((m) => ({ regel: regelVan(script, m.index), tekst: m[0] }));
}

const VUE = bestanden(APP, ".vue");
const TS = bestanden(APP, ".ts");

describe("geen hardgecodeerde tekst in app/", () => {
  test("de scan vindt de bestanden", () => {
    expect(VUE.length).toBeGreaterThan(30);
    expect(TS.length).toBeGreaterThan(30);
  });

  test("de tokenizer vindt tekst en letterlijke attributen, en laat bindingen en uitzonderingen staan", () => {
    const vondsten = scanTemplate(`<template>
      <UButton label="Bewaren" :label="$t('x')" />
      <p v-if="a > b">{{ $t("y") }} mm</p>
      <span>Annuleren</span>
      <!-- Commentaar telt niet -->
      <img alt="Logo" /> <b>Elentrik</b>
    </template>`);
    expect(vondsten.map((v) => v.tekst)).toEqual(['label="Bewaren"', "Annuleren", 'alt="Logo"']);
    expect(scanMeldingen(`toast.add({ title: "Bewaard", description: t("x") }); a = { title: "" };`)).toEqual([
      { regel: 1, tekst: 'title: "Bewaard"' },
    ]);
  });

  test("elke template vertaalt haar teksten", () => {
    const fouten = VUE.flatMap((bestand) =>
      scanTemplate(templateVan(readFileSync(bestand, "utf8"))).map((v) => `${pad(bestand)} (template r. ${v.regel}): ${v.tekst}`),
    );
    expect(fouten).toEqual([]);
  });

  test("geen letterlijke toast- of meldingtitel in .ts en in <script>", () => {
    const fouten = [
      ...TS.map((bestand) => [bestand, readFileSync(bestand, "utf8")] as const),
      ...VUE.map((bestand) => [bestand, scriptVan(readFileSync(bestand, "utf8"))] as const),
    ].flatMap(([bestand, bron]) => scanMeldingen(bron).map((v) => `${pad(bestand)} (r. ${v.regel}): ${v.tekst}`));
    expect(fouten).toEqual([]);
  });

  test("AREI-berichten en de teksten van de kringenlijst volgen de taal: geen vaste `\"nl\"` en geen `NL` uit @elentrik/render", () => {
    const fouten = [...TS, ...VUE].flatMap((bestand) =>
      readFileSync(bestand, "utf8")
        .split("\n")
        .flatMap((regel, i) =>
          /formatteerBericht\([^)]*,\s*["'`]\w+["'`]\s*\)|import\s*\{[^}]*\bNL\b[^}]*\}\s*from\s*["']@elentrik\/render["']/.test(regel)
            ? [`${pad(bestand)}:${i + 1}: ${regel.trim()}`]
            : [],
        ),
    );
    expect(fouten).toEqual([]);
  });

  test("app/ importeert de vertaalbestanden niet: @nuxtjs/i18n compileert ze tot berichtmodules", () => {
    const fouten = [...TS, ...VUE].flatMap((bestand) =>
      readFileSync(bestand, "utf8")
        .split("\n")
        .flatMap((regel, i) => (/from\s+["'][^"']*i18n\/locales\//.test(regel) ? [`${pad(bestand)}:${i + 1}: ${regel.trim()}`] : [])),
    );
    expect(fouten).toEqual([]);
  });

  test("geen vaste locale nl-BE: Intl volgt de taal (via LOCALES uit shared/taal)", () => {
    const fouten = [...TS, ...VUE].flatMap((bestand) =>
      readFileSync(bestand, "utf8")
        .split("\n")
        .flatMap((regel, i) => (/["'`]nl-BE["'`]/.test(regel) ? [`${pad(bestand)}:${i + 1}: ${regel.trim()}`] : [])),
    );
    expect(fouten).toEqual([]);
  });
});
