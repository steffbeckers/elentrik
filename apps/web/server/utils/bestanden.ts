// Gedeelde hulp voor de bestanden-handlers: de upload uitlezen en BestandFout naar HTTP
// vertalen. Nitro importeert de exports van server/utils automatisch.
// Expliciete imports, geen Nitro-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createError, getHeader, getRouterParam, readMultipartFormData, type H3Event } from "h3";
import { z } from "zod";
import { MAX_LOGO_BYTES, MAX_UPLOAD_BYTES } from "../../shared/bestandsinhoud";
import { controleerOpslagruimte } from "../bestanden/opslagruimte";
import { BestandFout, type PlanSoort } from "../bestanden/repo";
import type { Db } from "../db";
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

/** Het bedrijf waarvoor een upload bedoeld is: de opslaglimiet geldt per bedrijf. */
export type UploadRuimte = { db: Db; organisatieId: string };

/**
 * Eist een geldige `content-length` (411 LENGTE_VEREIST) en weigert een te grote upload (413) op
 * basis daarvan, vóór de body gelezen wordt. Zonder lengte (bv. `Transfer-Encoding: chunked`)
 * zou de limiet te omzeilen zijn; de browser stuurt de lengte van een FormData altijd mee.
 * Geeft die lengte terug.
 */
export function controleerUploadGrootte(event: H3Event, maxBytes: number = MAX_UPLOAD_BYTES): number {
  const waarde = getHeader(event, "content-length")?.trim();
  if (waarde === undefined || !/^\d+$/.test(waarde)) {
    throw createError({ statusCode: 411, statusMessage: "Lengte vereist", data: { code: "LENGTE_VEREIST" } });
  }
  if (Number(waarde) > maxBytes + MULTIPART_OVERHEAD_BYTES) {
    throw createError({ statusCode: 413, statusMessage: "Bestand te groot", data: { code: "BESTAND_TE_GROOT" } });
  }
  return Number(waarde);
}

/**
 * Leest de multipart-velden `bestand` en `soort`; ontbrekende of onbekende velden geven 400. Past de
 * `content-length` nog in de opslag van het bedrijf? Zo niet: 413 OPSLAG_VOL, vóór de body gelezen
 * en vóór er iets geschreven wordt. De lengte bevat de multipart-koppen, een paar honderd bytes
 * meer dan het bestand zelf.
 */
export async function leesPlanUpload(
  event: H3Event,
  ruimte: UploadRuimte,
): Promise<{ soort: PlanSoort; data: Uint8Array }> {
  const lengte = controleerUploadGrootte(event);
  await controleerOpslagruimte(ruimte.db, ruimte.organisatieId, lengte);
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

/** Leest het multipart-veld `bestand` van een logo-upload; een ontbrekend veld geeft 400. Controleert de opslag zoals `leesPlanUpload`. */
export async function leesLogoUpload(event: H3Event, ruimte: UploadRuimte): Promise<Uint8Array> {
  const lengte = controleerUploadGrootte(event, MAX_LOGO_BYTES);
  await controleerOpslagruimte(ruimte.db, ruimte.organisatieId, lengte);
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
