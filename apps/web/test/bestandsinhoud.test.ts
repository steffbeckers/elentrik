import { describe, expect, test } from "vitest";
import {
  MAX_RASTER_PX,
  MAX_UPLOAD_BYTES,
  RASTER_DPI,
  afmetingen,
  controleerPlanbestand,
  herkenSoort,
} from "../shared/bestandsinhoud";

const tekst = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
const u16 = (n: number): number[] => [(n >>> 8) & 0xff, n & 0xff];

const PNG_SIGNATUUR = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Signatuur + IHDR-chunk (lengte 13, type, breedte, hoogte, rest van de kop, crc). */
function png(breedte: number, hoogte: number): Uint8Array {
  return Uint8Array.from([
    ...PNG_SIGNATUUR,
    ...u32(13),
    ...tekst("IHDR"),
    ...u32(breedte),
    ...u32(hoogte),
    8, 6, 0, 0, 0,
    0, 0, 0, 0,
  ]);
}

/** SOI + APP0 (JFIF) + SOF-segment met precisie, hoogte en breedte. */
function jpeg(breedte: number, hoogte: number, sof = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, ...u16(16), ...tekst("JFIF"), 0, 1, 1, 0, ...u16(1), ...u16(1), 0, 0];
  const sofSegment = [0xff, sof, ...u16(17), 8, ...u16(hoogte), ...u16(breedte), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...sofSegment]);
}

describe("limieten", () => {
  test("hebben de vaste waarden", () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * 1024 * 1024);
    expect(RASTER_DPI).toBe(300);
    expect(MAX_RASTER_PX).toBe(8000);
  });
});

describe("herkenSoort", () => {
  test("herkent pdf, png en jpeg aan de magic bytes", () => {
    expect(herkenSoort(Uint8Array.from(tekst("%PDF-1.7\n")))).toBe("pdf");
    expect(herkenSoort(png(1, 1))).toBe("png");
    expect(herkenSoort(jpeg(640, 480))).toBe("jpeg");
  });

  test("weigert svg en html", () => {
    expect(herkenSoort(Uint8Array.from(tekst('<svg xmlns="http://www.w3.org/2000/svg"/>')))).toBeNull();
    expect(herkenSoort(Uint8Array.from(tekst("<html><body></body></html>")))).toBeNull();
  });

  test("geeft null voor een lege of te korte kop", () => {
    expect(herkenSoort(new Uint8Array())).toBeNull();
    expect(herkenSoort(Uint8Array.from(tekst("%PDF")))).toBeNull();
    expect(herkenSoort(Uint8Array.from(PNG_SIGNATUUR.slice(0, 7)))).toBeNull();
    expect(herkenSoort(Uint8Array.from([0xff, 0xd8]))).toBeNull();
  });

  test("geeft null voor een bijna-signatuur", () => {
    expect(herkenSoort(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b]))).toBeNull();
    expect(herkenSoort(Uint8Array.from([0xff, 0xd8, 0xfe]))).toBeNull();
  });
});

describe("afmetingen", () => {
  test("leest een png van 1x1", () => {
    expect(afmetingen(png(1, 1), "png")).toEqual({ breedte: 1, hoogte: 1 });
  });

  test("leest een png van 3000x2000 (breedte en hoogte niet verwisseld)", () => {
    expect(afmetingen(png(3000, 2000), "png")).toEqual({ breedte: 3000, hoogte: 2000 });
  });

  test("geeft null voor een png die na de IHDR-lengte is afgekapt", () => {
    expect(afmetingen(png(3000, 2000).slice(0, 12), "png")).toBeNull();
    expect(afmetingen(png(3000, 2000).slice(0, 20), "png")).toBeNull();
    expect(afmetingen(png(3000, 2000).slice(0, 23), "png")).toBeNull();
  });

  test("geeft null voor een png zonder IHDR als eerste chunk", () => {
    const kapot = png(10, 10);
    kapot.set(tekst("IDAT"), 12);
    expect(afmetingen(kapot, "png")).toBeNull();
  });

  test("leest een jpeg met APP0 gevolgd door SOF0 van 640x480", () => {
    expect(afmetingen(jpeg(640, 480), "jpeg")).toEqual({ breedte: 640, hoogte: 480 });
  });

  test("leest ook SOF1 en SOF2 (progressief)", () => {
    expect(afmetingen(jpeg(1200, 800, 0xc1), "jpeg")).toEqual({ breedte: 1200, hoogte: 800 });
    expect(afmetingen(jpeg(4000, 3000, 0xc2), "jpeg")).toEqual({ breedte: 4000, hoogte: 3000 });
  });

  test("geeft null voor een jpeg die voor de SOF is afgekapt", () => {
    const volledig = jpeg(640, 480);
    expect(afmetingen(volledig.slice(0, 2), "jpeg")).toBeNull();
    expect(afmetingen(volledig.slice(0, 10), "jpeg")).toBeNull();
    expect(afmetingen(volledig.slice(0, 22), "jpeg")).toBeNull();
    expect(afmetingen(volledig.slice(0, 27), "jpeg")).toBeNull();
  });

  test("geeft null voor een jpeg zonder SOF-marker", () => {
    const zonderSof = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...u16(4), 0, 0, 0xff, 0xd9]);
    expect(afmetingen(zonderSof, "jpeg")).toBeNull();
  });

  test("geeft null voor een jpeg met een segmentlengte kleiner dan 2", () => {
    const kapot = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...u16(0), 0, 0]);
    expect(afmetingen(kapot, "jpeg")).toBeNull();
  });
});

describe("controleerPlanbestand", () => {
  test("aanvaardt een png binnen de limiet", () => {
    expect(controleerPlanbestand(1024, png(10, 10))).toEqual({ ok: true, soort: "png" });
  });

  test("aanvaardt precies MAX_UPLOAD_BYTES", () => {
    expect(controleerPlanbestand(MAX_UPLOAD_BYTES, png(10, 10))).toEqual({ ok: true, soort: "png" });
  });

  test("weigert een bestand boven MAX_UPLOAD_BYTES als te-groot", () => {
    expect(controleerPlanbestand(MAX_UPLOAD_BYTES + 1, png(10, 10))).toEqual({ ok: false, reden: "te-groot" });
  });

  test("weigert een te groot bestand ook als het type onbekend is, met te-groot", () => {
    expect(controleerPlanbestand(MAX_UPLOAD_BYTES + 1, Uint8Array.from(tekst("<svg")))).toEqual({
      ok: false,
      reden: "te-groot",
    });
  });

  test("weigert svg en html als onbekend-type", () => {
    expect(controleerPlanbestand(100, Uint8Array.from(tekst("<svg xmlns=''/>")))).toEqual({
      ok: false,
      reden: "onbekend-type",
    });
    expect(controleerPlanbestand(100, Uint8Array.from(tekst("<html>")))).toEqual({
      ok: false,
      reden: "onbekend-type",
    });
  });

  test("weigert een leeg bestand als onbekend-type", () => {
    expect(controleerPlanbestand(0, new Uint8Array())).toEqual({ ok: false, reden: "onbekend-type" });
  });

  test("geeft de soort uit de bytes terug", () => {
    expect(controleerPlanbestand(100, Uint8Array.from(tekst("%PDF-1.4")))).toEqual({ ok: true, soort: "pdf" });
    expect(controleerPlanbestand(100, jpeg(10, 10))).toEqual({ ok: true, soort: "jpeg" });
  });
});
