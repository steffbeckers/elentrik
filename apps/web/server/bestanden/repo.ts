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

/** Wat `bewaarBestand` aanvaardt; `export` (een PDF) is alleen voor intern gebruik, niet voor de upload-route. */
export type BewaarSoort = PlanSoort | "export";

const MIME: Record<BestandSoort, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
};

/**
 * De gedeelde schrijfstap: eerst het bestand, dan de rij, zodat een mislukte schrijfactie
 * geen rij achterlaat die naar niets wijst; fouten worden niet ingeslikt. `metRij` laat de
 * aanroeper in dezelfde transactie nog iets bijwerken, zodat een mislukking ook de rij terugdraait.
 */
export async function schrijfBestandMetRij(
  db: Db,
  opslag: BestandOpslag,
  invoer: {
    projectId: string | null;
    soort: (typeof bestanden.$inferInsert)["soort"];
    map: string;
    type: BestandSoort;
    data: Uint8Array;
  },
  metRij?: (tx: Db, info: BestandInfo) => Promise<void>,
): Promise<BestandInfo> {
  const { projectId, soort, map, type, data } = invoer;
  const maten = type === "pdf" ? null : afmetingen(data, type);
  const id = randomUUID();
  const sleutel = `${map}/${id}`;
  const mime = MIME[type];
  const info: BestandInfo = {
    id,
    mime,
    grootte: data.length,
    ...(maten ? { breedte_px: maten.breedte, hoogte_px: maten.hoogte } : {}),
  };
  await opslag.schrijf(sleutel, data);
  if (metRij) {
    await db.transaction(async (tx) => {
      await tx.insert(bestanden).values({ id, projectId, soort, mime, grootte: data.length, sleutel });
      await metRij(tx, info);
    });
  } else {
    await db.insert(bestanden).values({ id, projectId, soort, mime, grootte: data.length, sleutel });
  }
  return info;
}

/**
 * Valideert en bewaart een planbestand of een export-PDF. Het type volgt uit de bytes.
 */
export async function bewaarBestand(
  db: Db,
  opslag: BestandOpslag,
  invoer: { projectId: string; soort: BewaarSoort; data: Uint8Array },
): Promise<BestandInfo> {
  const { projectId, soort, data } = invoer;
  if (data.length > MAX_UPLOAD_BYTES) throw new BestandFout("TE_GROOT");

  const type = herkenSoort(data);
  if (!type) throw new BestandFout("ONGELDIG_TYPE");
  // Een export is altijd een PDF; een raster is juist nooit een PDF.
  if (soort === "export" && type !== "pdf") throw new BestandFout("ONGELDIG_TYPE");
  if (soort === "plan-raster" && type === "pdf") throw new BestandFout("ONGELDIG_TYPE");

  if (soort === "plan-raster") {
    const maten = afmetingen(data, type as "png" | "jpeg");
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

  return schrijfBestandMetRij(db, opslag, { projectId, soort, map: projectId, type, data });
}

export async function haalBestand(
  db: Db,
  id: string,
): Promise<{ id: string; soort: (typeof bestanden.$inferSelect)["soort"]; mime: string; sleutel: string } | null> {
  const [rij] = await db
    .select({ id: bestanden.id, soort: bestanden.soort, mime: bestanden.mime, sleutel: bestanden.sleutel })
    .from(bestanden)
    .where(eq(bestanden.id, id));
  return rij ?? null;
}
