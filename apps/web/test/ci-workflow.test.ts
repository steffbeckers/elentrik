// De CI-workflow en de pnpm-versie: elke GitHub Action staat vast op een commit-SHA (met de versie in
// commentaar), en pnpm heeft overal dezelfde versie: `packageManager` in de root-package.json, de
// Dockerfile en de workflow. Zo kan een verschoven tag of een verschil in versie niet ongemerkt binnenkomen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const lees = (...pad: string[]) => readFileSync(join(ROOT, ...pad), "utf8");

const workflow = lees(".github", "workflows", "web-image.yml");
const regels = workflow.split(/\r?\n/);
const gebruik = regels.flatMap((regel, i) => {
  const m = /^\s*-?\s*uses:\s*(\S+)(?:\s+#\s*(.*))?$/.exec(regel);
  return m ? [{ regel: i + 1, verwijzing: m[1]!, commentaar: m[2]?.trim() }] : [];
});

describe("GitHub Actions in web-image.yml", () => {
  test("de scan vindt de acties", () => {
    expect(gebruik.length).toBeGreaterThanOrEqual(6);
    expect(gebruik.length).toBe([...workflow.matchAll(/\buses:/g)].length);
  });

  test.each(gebruik.map((g) => [`r. ${g.regel}: ${g.verwijzing}`, g] as const))(
    "%s staat vast op een commit-SHA met de versie in commentaar",
    (_naam, g) => {
      expect(g.verwijzing, "een lokale of docker://-actie hoort hier niet").toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/);
      expect(g.commentaar, "mist de versie in commentaar, bv. # v7.0.1").toMatch(/^v\d+\.\d+\.\d+$/);
    },
  );

  test("het patroon weigert een tag, een korte SHA en een SHA zonder versie", () => {
    const geldig = /^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}$/;
    expect(geldig.test("actions/checkout@v7.0.1")).toBe(false);
    expect(geldig.test("actions/checkout@3d3c42e")).toBe(false);
    expect(geldig.test("actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1")).toBe(true);
  });
});

describe("pnpm-versie", () => {
  const versie = /^pnpm@(\d+\.\d+\.\d+)$/.exec(JSON.parse(lees("package.json")).packageManager ?? "")?.[1];

  test("de root-package.json heeft een exacte packageManager", () => {
    expect(versie, 'package.json: "packageManager": "pnpm@x.y.z"').toBeDefined();
  });

  test("de Dockerfile gebruikt dezelfde pnpm-versie", () => {
    const dockerfile = lees("apps", "web", "Dockerfile");
    expect([...dockerfile.matchAll(/corepack prepare pnpm@(\d+\.\d+\.\d+)/g)].map((m) => m[1])).toEqual([versie]);
  });

  test("de workflow zet geen eigen versie naast packageManager", () => {
    // pnpm/action-setup leest packageManager; een tweede `version:` zou een verschil kunnen verbergen of
    // de stap laten falen. Noemt de workflow toch een pnpm-versie, dan is dat dezelfde.
    const pnpmVersies = [...workflow.matchAll(/pnpm@(\d+\.\d+\.\d+)/g)].map((m) => m[1]);
    for (const v of pnpmVersies) expect(v).toBe(versie);
    expect(workflow).not.toMatch(/^\s*version:\s*\d/m);
  });
});
