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
test("doorplaatsen kiest volgende zonder terug te lopen", () => {
  expect(volgendPunt(groepen, "a1")).toEqual({ soort: "volgend", nodeId: "a2" });
  expect(volgendPunt(groepen, "a2")).toEqual({ soort: "volgend", nodeId: "a3" });
  expect(volgendPunt(groepen, "ontbreekt")).toEqual({ soort: "stop" });
});
test("doorplaatsen stopt aan het einde van de kring en gaat niet stil naar een ander onderdeel", () => {
  expect(volgendPunt(groepen, "a3")).toEqual({ soort: "kringKlaar", kringLabel: "A" });
  expect(volgendPunt(groepen, "b1")).toEqual({ soort: "kringKlaar", kringLabel: "B" });
  // Ook de groep van de verdeelborden of zonder kring loopt niet door naar een volgende groep.
  expect(volgendPunt([{ kringLabel: "A", nodeIds: ["a1"] }, { kringLabel: "__borden__", nodeIds: ["bord"] }], "a1"))
    .toEqual({ soort: "kringKlaar", kringLabel: "A" });
});
