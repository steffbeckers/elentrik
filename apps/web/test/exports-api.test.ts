import { describe, expect, test } from "vitest";
import { maakExportsApi, type ExportsFetch } from "../app/composables/useExportsApi";
import type { ExportInfo, ExportInvoer } from "../shared/exports";

type Oproep = Parameters<ExportsFetch>;

function maakApi(antwoord: unknown) {
  const oproepen: Oproep[] = [];
  const api = maakExportsApi(async (...argumenten) => {
    oproepen.push(argumenten);
    return antwoord;
  });
  return { api, oproepen };
}

const info: ExportInfo = {
  id: "e1",
  bestandId: "b1",
  versieLabel: "V1",
  papier: "A4",
  aantalFouten: 0,
  aantalWaarschuwingen: 2,
  aangemaakt: "2026-10-22T10:00:00.000Z",
};

describe("useExportsApi", () => {
  test("maak stuurt de invoer als POST naar /api/projecten/:id/exports", async () => {
    const invoer: ExportInvoer = {
      onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: true, bijlage: true },
      papier: "A3",
      versieLabel: "V1",
    };
    const { api, oproepen } = maakApi(info);
    expect(await api.maak("p1", invoer)).toEqual(info);
    expect(oproepen).toEqual([["/api/projecten/p1/exports", { method: "POST", body: invoer }]]);
  });

  test("lijst leest /api/projecten/:id/exports", async () => {
    const { api, oproepen } = maakApi([info]);
    expect(await api.lijst("p1")).toEqual([info]);
    expect(oproepen).toEqual([["/api/projecten/p1/exports"]]);
  });

  test("downloadUrl wijst naar het bestand", () => {
    const { api, oproepen } = maakApi(undefined);
    expect(api.downloadUrl("b1")).toBe("/api/bestanden/b1");
    expect(oproepen).toEqual([]);
  });

  test("een fout van de server blijft ongemoeid", async () => {
    const eigen = Object.assign(new Error("502"), { status: 502 });
    const api = maakExportsApi(async () => {
      throw eigen;
    });
    await expect(api.lijst("p1")).rejects.toBe(eigen);
  });
});
