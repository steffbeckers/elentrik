import { describe, expect, test } from "vitest";
import {
  doelSoort,
  moetNegeren,
  spatieSchuift,
  sneltoets,
  type Actie,
  type DoelElement,
  type DoelSoort,
  type NegeerToets,
} from "../app/composables/sneltoetsen";

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

  describe("symbolenvenster (a)", () => {
    test("a opent het symbolenvenster", () => {
      expect(sneltoets(toets("a"))).toEqual({ soort: "symbolen" });
    });

    test("ook in alleen-lezen: bekijken mag", () => {
      expect(sneltoets(toets("a", { alleenLezen: true }))).toEqual({ soort: "symbolen" });
    });

    test("niet in een invoerveld", () => {
      expect(sneltoets(toets("a", { doelIsInvoer: true }))).toBeNull();
    });

    test("niet met Ctrl", () => {
      expect(sneltoets(toets("a", { ctrlKey: true }))).toBeNull();
    });
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

  describe("op een knop", () => {
    test.each<[string, Toets, Actie]>([
      ["Delete", toets("Delete", { doelIsKnop: true }), { soort: "verwijder", heleTak: false }],
      ["Shift+Delete", toets("Delete", { doelIsKnop: true, shiftKey: true }), { soort: "verwijder", heleTak: true }],
      ["c", toets("c", { doelIsKnop: true }), { soort: "kies", onderdeel: "contactdoos" }],
      ["ArrowUp", toets("ArrowUp", { doelIsKnop: true }), { soort: "navigeer", richting: "op" }],
      ["Escape", toets("Escape", { doelIsKnop: true }), { soort: "wisSelectie" }],
      ["Ctrl+Z", toets("z", { doelIsKnop: true, ctrlKey: true }), { soort: "ongedaan" }],
    ])("behandelt %s", (_naam, invoer, verwacht) => {
      expect(sneltoets(invoer)).toEqual(verwacht);
    });

    test.each<[string, Toets]>([
      ["Enter", toets("Enter", { doelIsKnop: true })],
      ["spatie", toets(" ", { doelIsKnop: true })],
    ])("laat %s bij de knop", (_naam, invoer) => {
      expect(sneltoets(invoer)).toBeNull();
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

describe("doelSoort", () => {
  test.each<[string, DoelElement, DoelSoort]>([
    ["een knop", { tagName: "BUTTON", type: "button" }, "knop"],
    ["een tekstinvoer", { tagName: "INPUT", type: "text" }, "invoer"],
    ["een invoer zonder type", { tagName: "INPUT" }, "invoer"],
    ["een getalinvoer", { tagName: "INPUT", type: "number" }, "invoer"],
    ["een invoer van type button", { tagName: "INPUT", type: "button" }, "knop"],
    ["een selectievakje", { tagName: "INPUT", type: "checkbox" }, "knop"],
    ["een keuzerondje", { tagName: "INPUT", type: "radio" }, "knop"],
    ["een invoer van type submit", { tagName: "INPUT", type: "submit" }, "knop"],
    ["een tekstvak", { tagName: "TEXTAREA" }, "invoer"],
    ["een keuzelijst", { tagName: "SELECT" }, "invoer"],
    ["een bewerkbaar element", { tagName: "DIV", isContentEditable: true }, "invoer"],
    ["een gewoon element", { tagName: "DIV", isContentEditable: false }, "overig"],
    ["een svg-element", { tagName: "svg" }, "overig"],
  ])("%s", (_naam, doel, verwacht) => {
    expect(doelSoort(doel)).toBe(verwacht);
  });
});

describe("spatieSchuift", () => {
  test("alleen op een gewoon doel", () => {
    expect(spatieSchuift(" ", "overig")).toBe(true);
    expect(spatieSchuift(" ", "knop")).toBe(false);
    expect(spatieSchuift(" ", "invoer")).toBe(false);
    expect(spatieSchuift("a", "overig")).toBe(false);
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
