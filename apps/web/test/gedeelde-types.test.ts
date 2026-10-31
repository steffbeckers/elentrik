// Gedeelde types en componenten (plan 12, Task 6), statisch bewaakt:
// - `Mij` (het antwoord van GET /api/mij) staat één keer, in shared/mij.ts, en server en client
//   importeren het daar;
// - `AdresVelden` heeft geen dode prop `verplicht` meer en de instellingen gebruiken het component.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const WEB = join(import.meta.dirname, "..");

function bestanden(map: string, eindigtOp: RegExp): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((d) => {
    if (d.name === "node_modules" || d.name.startsWith(".")) return [];
    const pad = join(map, d.name);
    return d.isDirectory() ? bestanden(pad, eindigtOp) : eindigtOp.test(d.name) ? [pad] : [];
  });
}

const lees = (relatief: string) => readFileSync(join(WEB, relatief), "utf8");

describe("Mij", () => {
  test("het type wordt op één plek gedefinieerd: shared/mij.ts", () => {
    const definities = ["app", "server", "shared", "test", "e2e"]
      .flatMap((map) => bestanden(join(WEB, map), /\.(ts|vue)$/))
      .filter((pad) => /\b(type|interface)\s+Mij\b/.test(readFileSync(pad, "utf8")))
      .map((pad) => pad.slice(WEB.length + 1).replaceAll("\\", "/"));
    expect(definities).toEqual(["shared/mij.ts"]);
  });

  test("de server en de client importeren het uit shared/mij", () => {
    expect(lees("server/organisaties/leden.ts")).toMatch(/import type \{[^}]*\bMij\b[^}]*\} from "\.\.\/\.\.\/shared\/mij"/);
    expect(lees("app/stores/sessie.ts")).toMatch(/import type \{[^}]*\bMij\b[^}]*\} from "\.\.\/\.\.\/shared\/mij"/);
    expect(lees("app/plugins/sessie.ts")).toMatch(/import type \{ Mij \} from "\.\.\/\.\.\/shared\/mij"/);
    expect(lees("app/sessie/ssr.ts")).toMatch(/import type \{ Mij \} from "\.\.\/\.\.\/shared\/mij"/);
  });
});

describe("AdresVelden", () => {
  test("geen dode prop `verplicht`", () => {
    const bron = lees("app/components/editor/AdresVelden.vue");
    expect(bron).not.toMatch(/verplicht/);
  });

  test("de instellingen gebruiken AdresVelden in plaats van eigen adresvelden", () => {
    const bron = lees("app/pages/instellingen.vue");
    expect(bron).toMatch(/<AdresVelden\b/);
    expect(bron).not.toMatch(/name="(straat|nummer|bus|postcode|gemeente|land)"/);
  });
});
