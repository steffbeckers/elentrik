import { describe, expect, test } from "vitest";
import { moetNegeren, sneltoets, type Actie, type NegeerToets } from "../app/composables/sneltoetsen";

type Toets = Parameters<typeof sneltoets>[0];

function toets(key: string, rest: Partial<Omit<Toets, "key">> = {}): Toets {
  return { key, shiftKey: false, ctrlKey: false, metaKey: false, doelIsInvoer: false, ...rest };
}

describe("sneltoets", () => {
  test.each<[string, Toets, Actie | null]>([
    ["c", toets("c"), { soort: "kies", onderdeel: "contactdoos" }],
    ["l", toets("l"), { soort: "kies", onderdeel: "lichtpunt" }],
    ["s", toets("s"), { soort: "kies", onderdeel: "schakelaar" }],
    ["t", toets("t"), { soort: "kies", onderdeel: "toestel" }],
    ["d", toets("d"), { soort: "kies", onderdeel: "differentieel" }],
    ["z", toets("z"), { soort: "kies", onderdeel: "zekering" }],
    ["b", toets("b"), { soort: "kies", onderdeel: "onderbord" }],
    ["hoofdletter C (caps lock of shift)", toets("C", { shiftKey: true }), { soort: "kies", onderdeel: "contactdoos" }],
    ["Enter", toets("Enter"), { soort: "toevoegen" }],
    ["Delete", toets("Delete"), { soort: "verwijder", heleTak: false }],
    ["Backspace", toets("Backspace"), { soort: "verwijder", heleTak: false }],
    ["Shift+Delete", toets("Delete", { shiftKey: true }), { soort: "verwijder", heleTak: true }],
    ["Shift+Backspace", toets("Backspace", { shiftKey: true }), { soort: "verwijder", heleTak: true }],
    ["Ctrl+Z", toets("z", { ctrlKey: true }), { soort: "ongedaan" }],
    ["Meta+Z", toets("z", { metaKey: true }), { soort: "ongedaan" }],
    ["Ctrl+Y", toets("y", { ctrlKey: true }), { soort: "opnieuw" }],
    ["Meta+Y", toets("y", { metaKey: true }), { soort: "opnieuw" }],
    ["Ctrl+Shift+Z", toets("Z", { ctrlKey: true, shiftKey: true }), { soort: "opnieuw" }],
    ["Meta+Shift+Z", toets("z", { metaKey: true, shiftKey: true }), { soort: "opnieuw" }],
    ["ArrowUp", toets("ArrowUp"), { soort: "navigeer", richting: "op" }],
    ["ArrowDown", toets("ArrowDown"), { soort: "navigeer", richting: "neer" }],
    ["ArrowLeft", toets("ArrowLeft"), { soort: "navigeer", richting: "links" }],
    ["ArrowRight", toets("ArrowRight"), { soort: "navigeer", richting: "rechts" }],
    ["Escape", toets("Escape"), { soort: "wisSelectie" }],
  ])("%s", (_naam, invoer, verwacht) => {
    expect(sneltoets(invoer)).toEqual(verwacht);
  });

  test.each<[string, Toets]>([
    ["onbekende toets", toets("q")],
    ["Ctrl+C is geen onderdeel", toets("c", { ctrlKey: true })],
    ["Meta+L is geen onderdeel", toets("l", { metaKey: true })],
    ["Ctrl+Enter", toets("Enter", { ctrlKey: true })],
    ["Ctrl+ArrowUp", toets("ArrowUp", { ctrlKey: true })],
    ["Shift+Y is geen opnieuw", toets("y", { shiftKey: true })],
  ])("geeft null: %s", (_naam, invoer) => {
    expect(sneltoets(invoer)).toBeNull();
  });

  describe("in een invoerveld", () => {
    test.each<[string, Toets]>([
      ["c", toets("c", { doelIsInvoer: true })],
      ["Enter", toets("Enter", { doelIsInvoer: true })],
      ["Delete", toets("Delete", { doelIsInvoer: true })],
      ["Backspace", toets("Backspace", { doelIsInvoer: true })],
      ["ArrowLeft", toets("ArrowLeft", { doelIsInvoer: true })],
      ["Escape", toets("Escape", { doelIsInvoer: true })],
    ])("geeft %s null", (_naam, invoer) => {
      expect(sneltoets(invoer)).toBeNull();
    });

    test("Ctrl+Z geeft ongedaan, Ctrl+Y en Ctrl+Shift+Z geven opnieuw", () => {
      expect(sneltoets(toets("z", { ctrlKey: true, doelIsInvoer: true }))).toEqual({ soort: "ongedaan" });
      expect(sneltoets(toets("y", { ctrlKey: true, doelIsInvoer: true }))).toEqual({ soort: "opnieuw" });
      expect(sneltoets(toets("Z", { ctrlKey: true, shiftKey: true, doelIsInvoer: true }))).toEqual({
        soort: "opnieuw",
      });
    });
  });

  describe("herhaalde toetsen", () => {
    test.each<[string, Toets]>([
      ["Enter", toets("Enter", { herhaald: true })],
      ["Delete", toets("Delete", { herhaald: true })],
      ["Shift+Backspace", toets("Backspace", { shiftKey: true, herhaald: true })],
    ])("geeft %s null", (_naam, invoer) => {
      expect(sneltoets(invoer)).toBeNull();
    });

    test("navigatie en ongedaan blijven herhalen", () => {
      expect(sneltoets(toets("ArrowUp", { herhaald: true }))).toEqual({ soort: "navigeer", richting: "op" });
      expect(sneltoets(toets("z", { ctrlKey: true, herhaald: true }))).toEqual({ soort: "ongedaan" });
    });
  });
});

describe("moetNegeren", () => {
  const vrij: NegeerToets = {
    defaultPrevented: false,
    isComposing: false,
    altKey: false,
    doelInWidget: false,
    overlayOpen: false,
  };

  test("een gewone toets wordt niet genegeerd", () => {
    expect(moetNegeren(vrij)).toBe(false);
  });

  test.each<[string, Partial<NegeerToets>]>([
    ["al afgehandeld (defaultPrevented)", { defaultPrevented: true }],
    ["IME-samenstelling", { isComposing: true }],
    ["Alt ingedrukt", { altKey: true }],
    ["doel in een widget (menu, dialoog, lijst, tabbladen)", { doelInWidget: true }],
    ["een overlay staat open", { overlayOpen: true }],
  ])("negeert: %s", (_naam, afwijking) => {
    expect(moetNegeren({ ...vrij, ...afwijking })).toBe(true);
  });
});
