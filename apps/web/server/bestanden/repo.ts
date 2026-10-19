// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  afmetingen,
  herkenSoort,
  MAX_RASTER_PX,
  MAX_UPLOAD_BYTES,
  type BestandInfo,
  type BestandSoort,
} from "../../shared/bestandsinhoud";
import type { Db } from "../db";
import { bestanden, projecten } from "../db/schema";
import type { BestandOpslag } from "./opslag";

export type BestandFoutCode = "NIET_GEVONDEN" | "TE_GROOT" | "ONGELDIG_TYPE" | "RASTER_TE_GROOT";

export class BestandFout extends Error {
  readonly code: BestandFoutCode;

  constructor(code: BestandFoutCode) {
    super(code);
    this.name = "BestandFout";
    this.code = code;
  }
}

export type PlanSoort = "plan-origineel" | "plan-raster";

const MIME: Record<BestandSoort, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
};

/**
 * Valideert en bewaart een planbestand. Het type volgt uit de bytes. Het bestand wordt
 * geschreven vóór de rij, zodat een mislukte schrijfactie geen rij achterlaat die naar
 * niets wijst; fouten worden niet ingeslikt.
 */
export async function bewaarBestand(
  db: Db,
  opslag: BestandOpslag,
  invoer: { projectId: string; soort: PlanSoort; data: Uint8Array },
): Promise<BestandInfo> {
  const { projectId, soort, data } = invoer;
  if (data.length > MAX_UPLOAD_BYTES) throw new BestandFout("TE_GROOT");

  const type = herkenSoort(data);
  if (!type || (soort === "plan-raster" && type === "pdf")) throw new BestandFout("ONGELDIG_TYPE");

  const maten = type === "pdf" ? null : afmetingen(data, type);
  if (soort === "plan-raster") {
    if (!maten || maten.breedte === 0 || maten.hoogte === 0) throw new BestandFout("ONGELDIG_TYPE");
    if (Math.max(maten.breedte, maten.hoogte) > MAX_RASTER_PX) {
      throw new BestandFout("RASTER_TE_GROOT");
    }
  }

  const [project] = await db
    .select({ id: projecten.id })
    .from(projecten)
    .where(and(eq(projecten.id, projectId), isNull(projecten.verwijderd)));
  if (!project) throw new BestandFout("NIET_GEVONDEN");

  const id = randomUUID();
  const sleutel = `${projectId}/${id}`;
  const mime = MIME[type];
  await opslag.schrijf(sleutel, data);
  await db.insert(bestanden).values({ id, projectId, soort, mime, grootte: data.length, sleutel });

  return {
    id,
    mime,
    grootte: data.length,
    ...(maten ? { breedte_px: maten.breedte, hoogte_px: maten.hoogte } : {}),
  };
}

export async function haalBestand(
  db: Db,
  id: string,
): Promise<{ id: string; mime: string; sleutel: string } | null> {
  const [rij] = await db
    .select({ id: bestanden.id, mime: bestanden.mime, sleutel: bestanden.sleutel })
    .from(bestanden)
    .where(eq(bestanden.id, id));
  return rij ?? null;
}
