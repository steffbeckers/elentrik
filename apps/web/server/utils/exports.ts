// Gedeelde hulp voor de exports-handlers: de POST-body valideren en PdfFout naar HTTP vertalen.
// Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createError } from "h3";
import { z } from "zod";
import type { ExportInvoer } from "../../shared/exports";
import { PdfFout, type PdfFoutCode } from "../pdf/gotenberg";
import { metProjectFouten } from "./projecten";

export const ExportInvoerSchema = z
  .strictObject({
    onderdelen: z.strictObject({
      eendraadschema: z.boolean(),
      situatieschema: z.boolean(),
      kringenlijst: z.boolean(),
      bijlage: z.boolean(),
    }),
    papier: z.enum(["A4", "A3"]),
    versieLabel: z.string().trim().min(1).max(40),
  })
  .refine((invoer) => Object.values(invoer.onderdelen).some(Boolean), {
    message: "Kies minstens één onderdeel",
    path: ["onderdelen"],
  }) satisfies z.ZodType<ExportInvoer>;

const BOODSCHAP: Readonly<Record<PdfFoutCode, string>> = {
  ONBEREIKBAAR: "De PDF-dienst is niet bereikbaar.",
  TIMEOUT: "De PDF-dienst is niet bereikbaar.",
  MISLUKT: "De PDF kon niet gemaakt worden.",
};

/**
 * Voert een export uit en vertaalt de fouten: ProjectFout zoals `metProjectFouten`, PdfFout naar 502
 * met een boodschap voor de gebruiker. Een PdfFout wordt gelogd met het projectId, de code en de details.
 */
export async function metExportFouten<T>(projectId: string, actie: () => Promise<T>): Promise<T> {
  try {
    return await metProjectFouten(actie);
  } catch (fout) {
    if (!(fout instanceof PdfFout)) throw fout;
    console.error("PDF-export mislukt", {
      projectId,
      code: fout.code,
      bericht: fout.message,
      details: fout.details,
    });
    throw createError({ statusCode: 502, statusMessage: BOODSCHAP[fout.code], data: { code: fout.code } });
  }
}
