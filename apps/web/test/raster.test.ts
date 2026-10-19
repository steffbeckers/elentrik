import { describe, expect, test } from "vitest";
import {
  moetHercoderen,
  paginaTitel,
  rasterSchaal,
  verkleinMaat,
} from "../app/situatie/raster";

describe("rasterSchaal", () => {
  test("A4 rastert op 300 dpi", () => {
    expect(rasterSchaal(595, 842)).toBe(300 / 72);
  });

  test("A0 wordt teruggebracht tot een lange zijde van 8000 px", () => {
    const schaal = rasterSchaal(3370, 2384);
    expect(3370 * schaal).toBeCloseTo(8000, 6);
    expect(2384 * schaal).toBeLessThan(8000);
  });

  test("een staande pagina wordt ook op de lange zijde begrensd", () => {
    expect(rasterSchaal(2384, 3370) * 3370).toBeCloseTo(8000, 6);
  });
});

describe("verkleinMaat", () => {
  test("verkleint proportioneel tot precies 8000 op de lange zijde", () => {
    expect(verkleinMaat(10000, 5000)).toEqual({ breedte: 8000, hoogte: 4000 });
    expect(verkleinMaat(5000, 10000)).toEqual({ breedte: 4000, hoogte: 8000 });
  });

  test("laat een maat binnen de limiet ongemoeid", () => {
    expect(verkleinMaat(8000, 10)).toEqual({ breedte: 8000, hoogte: 10 });
  });

  test("rondt de korte zijde naar beneden af", () => {
    expect(verkleinMaat(9001, 4001)).toEqual({ breedte: 8000, hoogte: 3556 });
  });
});

describe("paginaTitel", () => {
  test("haalt de extensie weg en voegt het PDF-paginanummer toe", () => {
    expect(paginaTitel("plan-gelijkvloers.pdf", 2, "Pagina 1")).toBe(
      "plan-gelijkvloers p2",
    );
  });

  test("zonder PDF-pagina blijft alleen de naam over", () => {
    expect(paginaTitel("verdieping.png", undefined, "Pagina 2")).toBe("verdieping");
  });

  test("een lege naam geeft de meegegeven standaardtitel", () => {
    expect(paginaTitel(".png", undefined, "Pagina 3")).toBe("Pagina 3");
    expect(paginaTitel("", undefined, "Blad 1")).toBe("Blad 1");
  });
});

describe("moetHercoderen", () => {
  const liggend = { b: 4000, h: 3000 };

  test("laat een afbeelding binnen de limiet en zonder EXIF-oriëntatie ongemoeid", () => {
    expect(moetHercoderen(liggend, 1, 8000)).toBe(false);
  });

  test("hercodeert een afbeelding met een lange zijde boven de limiet", () => {
    expect(moetHercoderen({ b: 10000, h: 5000 }, 1, 8000)).toBe(true);
  });

  test.each([2, 3, 4, 5, 6, 7, 8])(
    "hercodeert altijd bij EXIF-oriëntatie %i, ook als de maat gelijk blijft",
    (orientatie) => {
      expect(moetHercoderen(liggend, orientatie, 8000)).toBe(true);
      expect(moetHercoderen({ b: 500, h: 500 }, orientatie, 8000)).toBe(true);
    },
  );
});
