import { describe, expect, test, vi } from "vitest";
import { laadPlannenOp } from "../app/situatie/plan-opladen";
import { uitsnedeMaat } from "../app/situatie/uitsnede";

describe("meerdere uitsneden", () => {
  const origineel = new Blob(["pdf"], { type: "application/pdf" });
  const crop = { x: 100, y: 200, breedte: 600, hoogte: 400, rotatie: 90 as const };
  test("twee uitsneden, één origineel en brongegevens zonder overgenomen schaal", async () => {
    let i = 0;
    const upload = vi.fn(async () => ({ id: `b${++i}`, mime: "image/png", grootte: 1, breedte_px: 400, hoogte_px: 600 }));
    const resultaten = await laadPlannenOp({ upload }, "p", [1, 2].map(n => ({ origineel, raster: new Blob([String(n)]), naam: "plan.pdf", pdfPagina: n, bronUitsnede: crop })));
    expect(upload).toHaveBeenCalledTimes(3);
    expect(resultaten.map(r => r.origineelBestandId)).toEqual(["b1", "b1"]);
    expect(resultaten[1]).toMatchObject({ pdfPagina: 2, bronUitsnede: crop });
    expect(resultaten[1]?.schaal).toBeUndefined();
  });
  test("een latere fout levert geen gedeeltelijk resultaat", async () => {
    let i = 0;
    const upload = vi.fn(async () => { if (++i === 3) throw new Error("opslag vol"); return { id: `b${i}`, mime: "image/png", grootte: 1, breedte_px: 1, hoogte_px: 1 }; });
    await expect(laadPlannenOp({ upload }, "p", [1, 2].map(n => ({ origineel, raster: new Blob([String(n)]), naam: "p" })))).rejects.toThrow("opslag vol");
  });
  test("cancel na laatste upload geeft ook geen resultaat", async () => {
    const c = new AbortController();
    const upload = vi.fn(async () => { c.abort(); return { id: "b", mime: "image/png", grootte: 1, breedte_px: 1, hoogte_px: 1 }; });
    await expect(laadPlannenOp({ upload }, "p", [{ origineel, raster: origineel, naam: "p" }], c.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  test("90/270 graden verwisselt afmetingen; ongeldige uitsnede wordt geweigerd", () => {
    expect(uitsnedeMaat(crop, 1000, 1000)).toEqual({ breedte: 400, hoogte: 600 });
    expect(() => uitsnedeMaat({ ...crop, x: 900 }, 1000, 1000)).toThrow();
  });
});
