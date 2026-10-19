// De hulpfuncties van de exports-API als pure functies, zonder Nitro-server.
import { afterEach, describe, expect, test, vi } from "vitest";
import { PdfFout } from "../server/pdf/gotenberg";
import { ProjectFout } from "../server/projecten/repo";
import { ExportInvoerSchema, metExportFouten } from "../server/utils/exports";

const GELDIG = {
  onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: false, bijlage: false },
  papier: "A4",
  versieLabel: "  V1  ",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportInvoerSchema", () => {
  test("een geldige invoer wordt aanvaard en het versielabel getrimd", () => {
    expect(ExportInvoerSchema.parse(GELDIG)).toEqual({ ...GELDIG, versieLabel: "V1" });
  });

  test("40 tekens na trimmen mag", () => {
    expect(ExportInvoerSchema.safeParse({ ...GELDIG, versieLabel: ` ${"a".repeat(40)} ` }).success).toBe(true);
  });

  test.each([
    ["leeg versielabel", { ...GELDIG, versieLabel: "   " }],
    ["versielabel van 41 tekens", { ...GELDIG, versieLabel: "a".repeat(41) }],
    ["geen onderdeel aan", { ...GELDIG, onderdelen: { ...GELDIG.onderdelen, eendraadschema: false } }],
    ["onbekend papier", { ...GELDIG, papier: "A5" }],
    ["ontbrekend onderdeel", { ...GELDIG, onderdelen: { eendraadschema: true } }],
    ["onbekend veld", { ...GELDIG, extra: 1 }],
  ])("%s wordt geweigerd", (_naam, invoer) => {
    expect(ExportInvoerSchema.safeParse(invoer).success).toBe(false);
  });
});

async function fout(belofte: Promise<unknown>): Promise<{ statusCode?: number; statusMessage?: string }> {
  try {
    await belofte;
  } catch (e) {
    return e as { statusCode?: number; statusMessage?: string };
  }
  throw new Error("Er werd geen fout gegooid");
}

describe("metExportFouten", () => {
  test("geeft het resultaat door", async () => {
    expect(await metExportFouten("p1", async () => 42)).toBe(42);
  });

  test.each([
    ["ONBEREIKBAAR", "De PDF-dienst is niet bereikbaar."],
    ["TIMEOUT", "De PDF-dienst is niet bereikbaar."],
    ["MISLUKT", "De PDF kon niet gemaakt worden."],
  ] as const)("PdfFout %s wordt 502 met een boodschap en wordt gelogd met het projectId", async (code, boodschap) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = await fout(
      metExportFouten("project-123", async () => {
        throw new PdfFout(code, "detail", { status: 503, body: "stuk" });
      }),
    );
    expect(e.statusCode).toBe(502);
    expect(e.statusMessage).toBe(boodschap);
    expect(log).toHaveBeenCalledTimes(1);
    const tekst = JSON.stringify(log.mock.calls[0]);
    expect(tekst).toContain("project-123");
    expect(tekst).toContain(code);
    expect(tekst).toContain("stuk");
  });

  test("ProjectFout NIET_GEVONDEN wordt 404", async () => {
    const e = await fout(
      metExportFouten("p1", async () => {
        throw new ProjectFout("NIET_GEVONDEN");
      }),
    );
    expect(e.statusCode).toBe(404);
  });

  test("een andere fout gaat ongewijzigd door", async () => {
    const anders = new Error("anders");
    await expect(
      metExportFouten("p1", async () => {
        throw anders;
      }),
    ).rejects.toBe(anders);
  });
});
