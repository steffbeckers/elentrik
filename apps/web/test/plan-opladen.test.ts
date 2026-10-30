import { describe, expect, test, vi } from "vitest";
import { foutSleutel, isAfgebroken, laadPlanOp, type PlanUploader } from "../app/situatie/plan-opladen";

function maakFout(status: number): Error {
  return Object.assign(new Error(`HTTP ${status}`), { status });
}

const PNG = new Blob(["png"], { type: "image/png" });
const PDF = new Blob(["pdf"], { type: "application/pdf" });
const RASTER = new Blob(["raster"], { type: "image/png" });

function uploader(antwoorden: Record<string, { id: string; breedte_px?: number; hoogte_px?: number }>) {
  const upload = vi.fn(async (_projectId: string, soort: string, _blob?: Blob, _naam?: string, _signal?: AbortSignal) => {
    const antwoord = antwoorden[soort];
    if (!antwoord) throw new Error("onverwacht");
    return { mime: "image/png", grootte: 1, ...antwoord };
  });
  return { upload: upload as unknown as PlanUploader["upload"], mock: upload };
}

describe("laadPlanOp", () => {
  test("een afbeelding die zichzelf als raster dient wordt één keer geüpload", async () => {
    const api = uploader({ "plan-origineel": { id: "b1", breedte_px: 4000, hoogte_px: 3000 } });
    const resultaat = await laadPlanOp(api, "p1", { origineel: PNG, raster: PNG, naam: "plan.png" });
    expect(api.mock).toHaveBeenCalledTimes(1);
    expect(resultaat).toEqual({ origineelBestandId: "b1", rasterBestandId: "b1", breedte_px: 4000, hoogte_px: 3000 });
  });

  test("een verkleinde afbeelding gaat apart als plan-raster, met de maat van het raster", async () => {
    const api = uploader({
      "plan-origineel": { id: "o", breedte_px: 12000, hoogte_px: 9000 },
      "plan-raster": { id: "r", breedte_px: 8000, hoogte_px: 6000 },
    });
    const resultaat = await laadPlanOp(api, "p1", { origineel: PNG, raster: RASTER, naam: "plan.png" });
    expect(api.mock.mock.calls.map((a) => a[1])).toEqual(["plan-origineel", "plan-raster"]);
    expect(resultaat).toEqual({ origineelBestandId: "o", rasterBestandId: "r", breedte_px: 8000, hoogte_px: 6000 });
  });

  test("een pdf-pagina: pdf als origineel, png als raster en het paginanummer", async () => {
    const api = uploader({ "plan-origineel": { id: "o" }, "plan-raster": { id: "r", breedte_px: 2480, hoogte_px: 3508 } });
    const resultaat = await laadPlanOp(api, "p1", { origineel: PDF, raster: RASTER, naam: "plan.pdf", pdfPagina: 2 });
    expect(resultaat).toEqual({
      origineelBestandId: "o",
      rasterBestandId: "r",
      pdfPagina: 2,
      breedte_px: 2480,
      hoogte_px: 3508,
    });
  });

  test("geeft het signaal door aan elke upload", async () => {
    const api = uploader({ "plan-origineel": { id: "o" }, "plan-raster": { id: "r", breedte_px: 1, hoogte_px: 1 } });
    const { signal } = new AbortController();
    await laadPlanOp(api, "p1", { origineel: PDF, raster: RASTER, naam: "a.pdf", pdfPagina: 1 }, signal);
    expect(api.mock.mock.calls.every((a) => a[4] === signal)).toBe(true);
  });

  test("een mislukte rasterupload geeft een fout en geen resultaat", async () => {
    const upload = vi.fn(async (_p: string, soort: string) => {
      if (soort === "plan-raster") throw maakFout(422);
      return { id: "o", mime: "application/pdf", grootte: 1 };
    });
    await expect(
      laadPlanOp({ upload } as unknown as PlanUploader, "p1", { origineel: PDF, raster: RASTER, naam: "a.pdf", pdfPagina: 1 }),
    ).rejects.toMatchObject({ status: 422 });
  });

  test("een antwoord zonder afmetingen voor het raster is een fout", async () => {
    const api = uploader({ "plan-origineel": { id: "b1" } });
    await expect(laadPlanOp(api, "p1", { origineel: PNG, raster: PNG, naam: "plan.png" })).rejects.toThrow();
  });

  test("een al afgebroken signaal stopt vóór de volgende upload", async () => {
    const controller = new AbortController();
    const upload = vi.fn(async (_p: string, soort: string) => {
      if (soort === "plan-origineel") controller.abort();
      return { id: "o", mime: "image/png", grootte: 1, breedte_px: 1, hoogte_px: 1 };
    });
    await expect(
      laadPlanOp({ upload } as unknown as PlanUploader, "p1", { origineel: PDF, raster: RASTER, naam: "a.pdf", pdfPagina: 1 }, controller.signal),
    ).rejects.toSatisfy(isAfgebroken);
    expect(upload).toHaveBeenCalledTimes(1);
  });
});

describe("foutSleutel", () => {
  test.each([
    [415, "onbekendType"],
    [413, "teGroot"],
    [422, "tePixels"],
    [500, "mislukt"],
    [undefined, "mislukt"],
  ])("status %s geeft %s", (status, sleutel) => {
    expect(foutSleutel(status === undefined ? new Error("x") : maakFout(status))).toBe(sleutel);
  });
});

describe("foutSleutel bij een volle opslag", () => {
  const opslagVol = Object.assign(new Error("HTTP 413"), { status: 413, data: { data: { code: "OPSLAG_VOL" } } });

  test("een 413 OPSLAG_VOL is opslagVol, een 413 BESTAND_TE_GROOT blijft teGroot", () => {
    expect(foutSleutel(opslagVol)).toBe("opslagVol");
    const teGroot = Object.assign(new Error("HTTP 413"), { status: 413, data: { data: { code: "BESTAND_TE_GROOT" } } });
    expect(foutSleutel(teGroot)).toBe("teGroot");
  });
});

describe("isAfgebroken", () => {
  test("herkent een AbortError, ook van een fetch-fout met cause", () => {
    expect(isAfgebroken(new DOMException("x", "AbortError"))).toBe(true);
    expect(isAfgebroken(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
    expect(isAfgebroken(new Error("x"))).toBe(false);
    expect(isAfgebroken(null)).toBe(false);
  });
});
