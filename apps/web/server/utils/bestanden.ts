// Gedeelde hulp voor de bestanden-handlers: de upload uitlezen en BestandFout naar HTTP
// vertalen. Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createError, getHeader, getRouterParam, readMultipartFormData, type H3Event } from "h3";
import { z } from "zod";
import { MAX_LOGO_BYTES, MAX_UPLOAD_BYTES } from "../../shared/bestandsinhoud";
import { BestandFout, type PlanSoort } from "../bestanden/repo";
import { nietGevondenFout } from "../fouten";
import { IdSchema } from "./projecten";
const SoortSchema = z.enum(["plan-origineel", "plan-raster"]);

/** Ruimte voor de multipart-grenzen en veldkoppen bovenop het bestand zelf. */
const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

/** Een id dat geen uuid is, kan nooit een bestaand bestand zijn: 404. */
export function bestandId(event: H3Event): string {
  const id = IdSchema.safeParse(getRouterParam(event, "id"));
  if (!id.success) throw nietGevondenFout();
  return id.data;
}

/** Weigert een te grote upload (413) op basis van `content-length`, vóór de body gelezen wordt. */
export function controleerUploadGrootte(event: H3Event, maxBytes: number = MAX_UPLOAD_BYTES): void {
  const waarde = getHeader(event, "content-length")?.trim();
  if (waarde === undefined || !/^\d+$/.test(waarde)) return;
  if (Number(waarde) > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Bestand te groot", data: { code: "BESTAND_TE_GROOT" } });
  }
}

/** Leest de multipart-velden `bestand` en `soort`; ontbrekende of onbekende velden geven 400. */
export async function leesPlanUpload(
  event: H3Event,
): Promise<{ soort: PlanSoort; data: Uint8Array }> {
  controleerUploadGrootte(event);
  const delen = await readMultipartFormData(event);
  const bestand = delen?.find((deel) => deel.name === "bestand");
  const soortDeel = delen?.find((deel) => deel.name === "soort");
  const soort = SoortSchema.safeParse(soortDeel?.data.toString("utf8"));
  if (!bestand || !soort.success) {
    throw createError({ statusCode: 400, statusMessage: "Ongeldige invoer", data: { code: "ONGELDIGE_INVOER" } });
  }
  return {
    soort: soort.data,
    data: new Uint8Array(bestand.data.buffer, bestand.data.byteOffset, bestand.data.byteLength),
  };
}

/** Leest het multipart-veld `bestand` van een logo-upload; een ontbrekend veld geeft 400. */
export async function leesLogoUpload(event: H3Event): Promise<Uint8Array> {
  controleerUploadGrootte(event, MAX_LOGO_BYTES);
  const delen = await readMultipartFormData(event);
  const bestand = delen?.find((deel) => deel.name === "bestand");
  if (!bestand) {
    throw createError({ statusCode: 400, statusMessage: "Ongeldige invoer", data: { code: "ONGELDIGE_INVOER" } });
  }
  return new Uint8Array(bestand.data.buffer, bestand.data.byteOffset, bestand.data.byteLength);
}

/** Voert een repo-aanroep uit en vertaalt BestandFout naar 404, 413, 415 of 422. */
export async function metBestandFouten<T>(actie: () => Promise<T>): Promise<T> {
  try {
    return await actie();
  } catch (fout) {
    if (!(fout instanceof BestandFout)) throw fout;
    switch (fout.code) {
      case "NIET_GEVONDEN":
        throw nietGevondenFout();
      case "TE_GROOT":
        throw createError({ statusCode: 413, statusMessage: "Bestand te groot", data: { code: "BESTAND_TE_GROOT" } });
      case "ONGELDIG_TYPE":
        throw createError({
          statusCode: 415,
          statusMessage: "Bestandstype niet toegelaten",
          data: { code: "BESTANDSTYPE_NIET_TOEGELATEN" },
        });
      case "RASTER_TE_GROOT":
        throw createError({ statusCode: 422, statusMessage: "Raster te groot", data: { code: "RASTER_TE_GROOT" } });
    }
  }
}
