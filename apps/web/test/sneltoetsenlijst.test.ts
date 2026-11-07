import { describe, expect, test } from "vitest";
import { sneltoets } from "../app/composables/sneltoetsen";
import { SNELTOETSEN, toetsNaam, type SneltoetsContext } from "../app/editor/sneltoetsenlijst";
import { situatieSneltoets } from "../app/situatie/sneltoetsen";

/** Alle toetsen die een editor kan zien, met en zonder Shift en Ctrl. */
const TOETSEN = [
  ..."abcdefghijklmnopqrstuvwxyz0123456789?/.,;-=+*[]",
  "Enter", "Escape", "Delete", "Backspace", "Tab", " ", "Home", "End", "PageUp", "PageDown",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "F1", "F2",
];
const COMBINATIES = [
  { shiftKey: false, ctrlKey: false },
  { shiftKey: true, ctrlKey: false },
  { shiftKey: false, ctrlKey: true },
  { shiftKey: true, ctrlKey: true },
];

function opgenomen(context: SneltoetsContext): Set<string> {
  return new Set(SNELTOETSEN.filter((s) => s.context === context).map((s) => s.toets));
}

describe("SNELTOETSEN", () => {
  test.each<[SneltoetsContext, (t: { key: string; shiftKey: boolean; ctrlKey: boolean }) => unknown]>([
    ["schema", (t) => sneltoets({ ...t, metaKey: false, doelIsInvoer: false })],
    ["situatie", (t) => situatieSneltoets({ ...t, metaKey: false, doelIsInvoer: false, doelIsKnop: false })],
  ])("elke toets die %s afhandelt, staat in de lijst", (context, afhandeling) => {
    const lijst = opgenomen(context);
    const ontbreekt: string[] = [];
    for (const key of TOETSEN) {
      for (const combinatie of COMBINATIES) {
        const toets = { key: combinatie.shiftKey && key.length === 1 ? key.toUpperCase() : key, ...combinatie };
        const actie = afhandeling(toets);
        if (actie === null) continue;
        const naam = toetsNaam(toets);
        // Shift dat niets verandert (C = Shift+C) valt onder de toets zonder Shift.
        const zonderShift = { ...toets, key, shiftKey: false };
        const gelijk = combinatie.shiftKey && JSON.stringify(afhandeling(zonderShift)) === JSON.stringify(actie);
        if (!lijst.has(naam) && !(gelijk && lijst.has(toetsNaam(zonderShift)))) ontbreekt.push(naam);
      }
    }
    expect(ontbreekt).toEqual([]);
  });

  test("de nieuwe toetsen staan erin", () => {
    expect(opgenomen("schema")).toContain("?");
    expect(opgenomen("schema")).toContain("Ctrl+D");
    expect(opgenomen("situatie")).toContain("?");
  });

  test("elke regel heeft een omschrijving onder editor.sneltoetsen", () => {
    for (const s of SNELTOETSEN) expect(s.omschrijvingSleutel).toMatch(/^editor\.sneltoetsen\./);
  });
});

describe("toetsNaam", () => {
  test.each([
    [{ key: "c", shiftKey: false, ctrlKey: false }, "C"],
    [{ key: "R", shiftKey: true, ctrlKey: false }, "Shift+R"],
    [{ key: "?", shiftKey: true, ctrlKey: false }, "?"],
    [{ key: "z", shiftKey: false, ctrlKey: true }, "Ctrl+Z"],
    [{ key: "Z", shiftKey: true, ctrlKey: true }, "Ctrl+Shift+Z"],
    [{ key: "z", shiftKey: false, ctrlKey: false, metaKey: true }, "Ctrl+Z"],
    [{ key: "Delete", shiftKey: true, ctrlKey: false }, "Shift+Delete"],
    [{ key: " ", shiftKey: false, ctrlKey: false }, "Space"],
  ])("%o heet %s", (toets, naam) => {
    expect(toetsNaam(toets)).toBe(naam);
  });
});
