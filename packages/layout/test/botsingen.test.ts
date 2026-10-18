import { describe, expect, test } from "vitest";
import { analyseer } from "@elentrik/arei";
import {
  referentieAppartement,
  referentieMetOnderbord,
  referentieRijwoning,
  referentieWoning,
} from "@elentrik/arei/testing";
import { valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { maakStrook, tekstBreedte, type SchemaElement } from "../src/index";

const referenties: ReadonlyArray<readonly [string, () => InstallatieDocument]> = [
  ["appartement", referentieAppartement],
  ["rijwoning", referentieRijwoning],
  ["woning", referentieWoning],
  ["met onderbord", referentieMetOnderbord],
];

/** Geschat vak van een symbool of tekst, met de kolom van zijn anker. */
type Vak = { beschrijving: string; kolom: number; links: number; rechts: number; boven: number; onder: number };

/**
 * Vakken van alle symbolen en teksten. Een tekst hoort bij het symbool dat er in de strook direct
 * voor staat (per node: eerst het symbool, dan de teksten), dus bij de kolom van die node.
 */
function vakken(elementen: SchemaElement[], kolomVan: Record<string, number>): Vak[] {
  const resultaat: Vak[] = [];
  let kolom = -1;
  for (const e of elementen) {
    if (e.soort === "symbool") {
      kolom = kolomVan[e.nodeId]!;
      const { breedte, hoogte } = e.symbool.maat;
      resultaat.push({ beschrijving: `symbool ${e.nodeId}`, kolom, links: e.x, rechts: e.x + breedte, boven: e.y, onder: e.y + hoogte });
    } else if (e.soort === "tekst") {
      const w = tekstBreedte(e.tekst, e.grootte);
      const links = e.anker === "start" ? e.x : e.anker === "end" ? e.x - w : e.x - w / 2;
      resultaat.push({ beschrijving: `tekst "${e.tekst}"`, kolom, links, rechts: links + w, boven: e.y - e.grootte, onder: e.y });
    }
  }
  return resultaat;
}

const overlappen = (a: Vak, b: Vak): boolean =>
  a.links < b.rechts - 1e-9 && b.links < a.rechts - 1e-9 && a.boven < b.onder - 1e-9 && b.boven < a.onder - 1e-9;

describe.each(referenties)("referentie %s: geen botsingen tussen kolommen", (_naam, bouw) => {
  const doc = bouw();
  const strook = maakStrook(doc);

  test("het document is structureel geldig", () => {
    expect(valideerStructuur(doc)).toEqual([]);
  });

  test("geschatte vakken in verschillende kolommen overlappen niet", () => {
    const alle = vakken(strook.elementen, strook.kolomVan);
    const botsingen: string[] = [];
    for (let i = 0; i < alle.length; i++) {
      for (let j = i + 1; j < alle.length; j++) {
        const a = alle[i]!;
        const b = alle[j]!;
        if (a.kolom !== b.kolom && overlappen(a, b)) botsingen.push(`${a.beschrijving} × ${b.beschrijving}`);
      }
    }
    expect(botsingen).toEqual([]);
  });

  test("elk vak valt binnen zijn eigen kolom", () => {
    for (const vak of vakken(strook.elementen, strook.kolomVan)) {
      expect(vak.links, vak.beschrijving).toBeGreaterThanOrEqual(strook.kolomGrenzen[vak.kolom]! - 1e-9);
      expect(vak.rechts, vak.beschrijving).toBeLessThanOrEqual(strook.kolomGrenzen[vak.kolom + 1]! + 1e-9);
    }
  });
});

test("de referentie met onderbord heeft de labels die de kolommen verbreden", () => {
  const doc = referentieMetOnderbord();
  const analyse = analyseer(doc);
  expect(analyse.kringen.map((k) => k.label)).toEqual(["A", "B", "C", "Garage.A", "Garage.B"]);
  expect(Object.values(analyse.puntLabels)).toContain("Garage.A3");
  expect(Object.values(analyse.puntLabels).filter((l) => l.startsWith("B"))).toHaveLength(8);
});
