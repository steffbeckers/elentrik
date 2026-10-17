import { describe, expect, test } from "vitest";
import {
  KOLOM_BREEDTE_MM,
  LIJNDIKTE_MM,
  TEKSTGROOTTE_MM,
  cirkel,
  escapeXml,
  getal,
  lijn,
  pad,
  rechthoek,
  tekst,
} from "../src/index";
import { kloon } from "./hulp";

describe("constanten", () => {
  test("vaste waarden", () => {
    expect(LIJNDIKTE_MM).toBe(0.35);
    expect(TEKSTGROOTTE_MM).toBe(2.5);
    expect(KOLOM_BREEDTE_MM).toBe(24);
  });
});

describe("getal", () => {
  test.each([
    [1, "1"],
    [1.5, "1.5"],
    [1.234, "1.23"],
    [2.005, "2.01"],
    [-2.005, "-2.01"],
    [1.999, "2"],
    [10, "10"],
    [0.001, "0"],
    [1e-7, "0"],
    [-0.001, "0"],
    [0.005, "0.01"],
    [-0, "0"],
    [0, "0"],
    [123456.789, "123456.79"],
  ])("getal(%s) is %s", (invoer, verwacht) => {
    expect(getal(invoer)).toBe(verwacht);
  });

  test("NaN, Infinity en te grote waarden gooien een RangeError", () => {
    expect(() => getal(NaN)).toThrow(RangeError);
    expect(() => getal(Infinity)).toThrow(RangeError);
    expect(() => getal(-Infinity)).toThrow(RangeError);
    expect(() => getal(1e21)).toThrow(RangeError);
    expect(() => getal(-1e15)).toThrow(RangeError);
  });
});

describe("escapeXml", () => {
  test("escapet alle vijf speciale tekens", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;");
  });

  test("escapet & eerst, zonder dubbele escaping", () => {
    expect(escapeXml("&lt;")).toBe("&amp;lt;");
  });

  test("verwijdert tekens die in XML 1.0 ongeldig zijn", () => {
    expect(escapeXml("a\u000Bb")).toBe("ab");
    expect(escapeXml("\u0000")).toBe("");
    expect(escapeXml("a\u0008\u000C\u000E\u001Fb\uFFFE\uFFFFc")).toBe("abc");
    expect(escapeXml("a\uD800b")).toBe("ab");
    expect(escapeXml("a\uDC00b")).toBe("ab");
  });

  test("behoudt geldige tekens: tab, LF, CR en surrogaatparen", () => {
    expect(escapeXml("😀")).toBe("😀");
    expect(escapeXml("a😀\uD800b")).toBe("a😀b");
    expect(escapeXml("\t\n\r")).toBe("\t\n\r");
  });
});

describe("builders", () => {
  test("lijn", () => {
    expect(lijn(0, 0, 1.5, 2)).toBe(
      '<line x1="0" y1="0" x2="1.5" y2="2" stroke="currentColor" stroke-width="0.35" fill="none"/>',
    );
  });

  test("cirkel ongevuld en gevuld", () => {
    expect(cirkel(1, 2, 3)).toBe(
      '<circle cx="1" cy="2" r="3" stroke="currentColor" stroke-width="0.35" fill="none"/>',
    );
    expect(cirkel(1, 2, 3, { gevuld: true })).toBe(
      '<circle cx="1" cy="2" r="3" stroke="currentColor" stroke-width="0.35" fill="currentColor"/>',
    );
  });

  test("rechthoek", () => {
    expect(rechthoek(0, 1, 2, 3)).toBe(
      '<rect x="0" y="1" width="2" height="3" stroke="currentColor" stroke-width="0.35" fill="none"/>',
    );
  });

  test("pad geeft d ongewijzigd door", () => {
    expect(pad("M0 0L1 1")).toBe(
      '<path d="M0 0L1 1" stroke="currentColor" stroke-width="0.35" fill="none"/>',
    );
  });

  test("pad weigert tekens buiten numerieke padgegevens", () => {
    expect(() => pad('M0 0"/><script>')).toThrow(RangeError);
    expect(pad("M0.5,-1e2 L1 1 Z")).toContain('d="M0.5,-1e2 L1 1 Z"');
  });

  test("tekst met standaardwaarden", () => {
    expect(tekst(1, 2, "A")).toBe(
      '<text x="1" y="2" font-size="2.5" text-anchor="start" font-family="sans-serif" fill="currentColor">A</text>',
    );
  });

  test("tekst met opties", () => {
    expect(tekst(1, 2, "A", { grootte: 3, anker: "middle" })).toBe(
      '<text x="1" y="2" font-size="3" text-anchor="middle" font-family="sans-serif" fill="currentColor">A</text>',
    );
  });

  test("tekst escapet de inhoud", () => {
    expect(tekst(0, 0, "<b>")).toContain("&lt;b&gt;");
    expect(tekst(0, 0, "<b>")).not.toContain("<b>");
  });

  test("coördinaten worden afgerond", () => {
    expect(lijn(0.001, 1.005, 2.5, -0)).toContain('x1="0" y1="1.01" x2="2.5" y2="0"');
  });

  test("niet-eindige coördinaten gooien een RangeError", () => {
    expect(() => lijn(0, 0, NaN, 0)).toThrow(RangeError);
  });
});

describe("extra data-attributen", () => {
  test("komen als laatste attributen, met escaping", () => {
    expect(lijn(0, 0, 1, 1, { data: { rol: "pool" } })).toBe(
      '<line x1="0" y1="0" x2="1" y2="1" stroke="currentColor" stroke-width="0.35" fill="none" data-rol="pool"/>',
    );
    expect(cirkel(0, 0, 1, { data: { "a-b": 'x"y' } })).toContain(' data-a-b="x&quot;y"/>');
    expect(rechthoek(0, 0, 1, 1, { data: { rol: "pool" } })).toContain(' data-rol="pool"/>');
    expect(pad("M0 0", { data: { rol: "pool" } })).toContain(' data-rol="pool"/>');
    expect(tekst(0, 0, "A", { data: { rol: "label" } })).toBe(
      '<text x="0" y="0" font-size="2.5" text-anchor="start" font-family="sans-serif" fill="currentColor" data-rol="label">A</text>',
    );
  });

  test("meerdere attributen behouden hun volgorde", () => {
    expect(lijn(0, 0, 1, 1, { data: { b: "1", a: "2" } })).toContain(' data-b="1" data-a="2"/>');
  });

  test("ongeldige sleutels gooien", () => {
    for (const sleutel of ["Rol", "1a", "a b", 'a"', "a_b", "", "-a"]) {
      expect(() => lijn(0, 0, 1, 1, { data: { [sleutel]: "x" } }), sleutel).toThrow();
    }
  });

  test("opties worden niet gemuteerd", () => {
    const opties = { data: { rol: "pool" } };
    const kopie = kloon(opties);
    cirkel(0, 0, 1, { ...opties, gevuld: true });
    expect(opties).toEqual(kopie);
  });
});
