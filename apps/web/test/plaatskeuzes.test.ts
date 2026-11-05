import { expect, test } from "vitest";
import { filterPlaatskeuzes, volgendPunt } from "../app/situatie/plaatskeuzes";

const groepen = [
  { kringLabel: "A", nodeIds: ["a1", "a2", "a3"] },
  { kringLabel: "B", nodeIds: ["b1"] },
];
const labels = new Map([["a1", "A1 · contactdoos · Keuken"], ["a2", "A2 · schakelaar"], ["a3", "A3 · contactdoos"], ["b1", "B1 · contactdoos"]]);
test("zoeken op code, type en omschrijving respecteert kring en volgorde", () => {
  expect(filterPlaatskeuzes(groepen, labels, "CONTACTDOOS", "A")).toEqual([{ kringLabel: "A", nodeIds: ["a1", "a3"] }]);
  expect(filterPlaatskeuzes(groepen, labels, "keuken", "")[0]?.nodeIds).toEqual(["a1"]);
  expect(filterPlaatskeuzes(groepen, labels, "B1", "A")).toEqual([]);
});
test("doorplaatsen kiest volgende zonder terug te lopen en stopt op het einde", () => {
  expect(volgendPunt(["a1", "a2", "a3"], "a1")).toBe("a2");
  expect(volgendPunt(["a1", "a2", "a3"], "a3")).toBeNull();
  expect(volgendPunt(["a1", "a2"], "ontbreekt")).toBeNull();
});
