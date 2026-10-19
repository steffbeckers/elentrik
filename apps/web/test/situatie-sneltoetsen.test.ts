import { describe, expect, test } from "vitest";
import { situatieSneltoets, type SituatieActie, type SituatieToets } from "../app/situatie/sneltoetsen";

function toets(key: string, rest: Partial<Omit<SituatieToets, "key">> = {}): SituatieToets {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, doelIsInvoer: false, doelIsKnop: false, ...rest };
}

describe("situatieSneltoets", () => {
  test.each<[string, SituatieToets, SituatieActie]>([
    ["r", toets("r"), { soort: "draai", richting: 1 }],
    ["Shift+R", toets("R", { shiftKey: true }), { soort: "draai", richting: -1 }],
    ["Shift+r", toets("r", { shiftKey: true }), { soort: "draai", richting: -1 }],
    ["R met caps lock", toets("R"), { soort: "draai", richting: 1 }],
    ["Delete", toets("Delete"), { soort: "haalVanPlan" }],
    ["Backspace", toets("Backspace"), { soort: "haalVanPlan" }],
    ["ArrowLeft", toets("ArrowLeft"), { soort: "schuif", dx: -10, dy: 0 }],
    ["ArrowRight", toets("ArrowRight"), { soort: "schuif", dx: 10, dy: 0 }],
    ["ArrowUp", toets("ArrowUp"), { soort: "schuif", dx: 0, dy: -10 }],
    ["ArrowDown", toets("ArrowDown"), { soort: "schuif", dx: 0, dy: 10 }],
    ["Shift+ArrowLeft", toets("ArrowLeft", { shiftKey: true }), { soort: "schuif", dx: -1, dy: 0 }],
    ["Shift+ArrowDown", toets("ArrowDown", { shiftKey: true }), { soort: "schuif", dx: 0, dy: 1 }],
    ["Escape", toets("Escape"), { soort: "annuleer" }],
    ["Ctrl+Z", toets("z", { ctrlKey: true }), { soort: "ongedaan" }],
    ["Meta+Z", toets("z", { metaKey: true }), { soort: "ongedaan" }],
    ["Ctrl+Y", toets("y", { ctrlKey: true }), { soort: "opnieuw" }],
    ["Ctrl+Shift+Z", toets("Z", { ctrlKey: true, shiftKey: true }), { soort: "opnieuw" }],
  ])("%s", (_naam, invoer, verwacht) => {
    expect(situatieSneltoets(invoer)).toEqual(verwacht);
  });

  test.each<[string, SituatieToets]>([
    ["c", toets("c")],
    ["l", toets("l")],
    ["z", toets("z")],
    ["Enter", toets("Enter")],
    ["Ctrl+R (herladen blijft bij de browser)", toets("r", { ctrlKey: true })],
    ["Ctrl+ArrowLeft", toets("ArrowLeft", { ctrlKey: true })],
    ["Ctrl+Delete", toets("Delete", { ctrlKey: true })],
  ])("geeft null: %s", (_naam, invoer) => {
    expect(situatieSneltoets(invoer)).toBeNull();
  });

  describe("in een invoerveld", () => {
    test.each<[string, SituatieToets]>([
      ["r", toets("r", { doelIsInvoer: true })],
      ["Delete", toets("Delete", { doelIsInvoer: true })],
      ["Backspace", toets("Backspace", { doelIsInvoer: true })],
      ["ArrowLeft", toets("ArrowLeft", { doelIsInvoer: true })],
      ["Escape", toets("Escape", { doelIsInvoer: true })],
    ])("geeft %s null", (_naam, invoer) => {
      expect(situatieSneltoets(invoer)).toBeNull();
    });

    test("Ctrl+Z en Ctrl+Y werken zoals in het eendraadschema", () => {
      expect(situatieSneltoets(toets("z", { ctrlKey: true, doelIsInvoer: true }))).toEqual({ soort: "ongedaan" });
      expect(situatieSneltoets(toets("y", { ctrlKey: true, doelIsInvoer: true }))).toEqual({ soort: "opnieuw" });
    });
  });

  describe("op een knop", () => {
    test.each<[string, SituatieToets]>([
      ["Enter", toets("Enter", { doelIsKnop: true })],
      ["spatie", toets(" ", { doelIsKnop: true })],
    ])("laat %s bij de knop", (_naam, invoer) => {
      expect(situatieSneltoets(invoer)).toBeNull();
    });

    test.each<[string, SituatieToets, SituatieActie]>([
      ["Delete", toets("Delete", { doelIsKnop: true }), { soort: "haalVanPlan" }],
      ["r", toets("r", { doelIsKnop: true }), { soort: "draai", richting: 1 }],
      ["ArrowUp", toets("ArrowUp", { doelIsKnop: true }), { soort: "schuif", dx: 0, dy: -10 }],
      ["Escape", toets("Escape", { doelIsKnop: true }), { soort: "annuleer" }],
    ])("behandelt %s", (_naam, invoer, verwacht) => {
      expect(situatieSneltoets(invoer)).toEqual(verwacht);
    });
  });
});
