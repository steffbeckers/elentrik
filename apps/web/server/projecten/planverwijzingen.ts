// Controle op de planverwijzingen van een document bij het bewaren: een document mag geen NIEUWE
// verwijzing naar een plan krijgen dat niet van dit project is. Een verwijzing die al in het bewaarde
// document stond, blijft aanvaard (een oude kopie, of een bestand dat niet gekopieerd kon worden):
// zo wordt een bestaand project nooit geweigerd.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import type { InstallatieDocument } from "@elentrik/model";
import { inArray } from "drizzle-orm";
import type { Db } from "../db";
import { bestanden } from "../db/schema";
import { maakFout } from "../fouten";

/** Een id in een uuid-kolom: een ander id zou de query laten falen in plaats van niets te vinden. */
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * De planbestanden (origineel en raster) waarnaar de situatiepagina's van een document verwijzen. Een
 * bewaard document zonder situatie (de database garandeert dat niet) heeft geen verwijzingen.
 */
export function planBestandIdsVan(document: InstallatieDocument): string[] {
  return (document.situatie?.paginas ?? []).flatMap((p) =>
    p.achtergrond ? [p.achtergrond.origineelBestandId, p.achtergrond.rasterBestandId] : [],
  );
}

/** De planbestand-id's in `nieuw` die niet in `bewaard` stonden, ontdubbeld, over alle situatiepagina's. */
export function nieuwePlanIds(bewaard: InstallatieDocument, nieuw: InstallatieDocument): string[] {
  const bekend = new Set(planBestandIdsVan(bewaard));
  return [...new Set(planBestandIdsVan(nieuw).filter((id) => !bekend.has(id)))];
}

/**
 * Een nieuw id mag een `plan-origineel` of `plan-raster` van project `projectId` zijn, of naar niets
 * wijzen: een id zonder bestand (een onbekende uuid, een tekst die geen uuid is) is onschadelijk. Dat
 * laatste is nodig omdat ongedaan maken over een bewaring heen een verwijzing herstelt die al niet meer
 * naar een bestand wees. Bestaat er wél een bestand met dat id dat geen plan van dit project is (een
 * plan van een ander project of bedrijf, een logo, een export), dan volgt 422 `PLANBESTAND_ONBEKEND`.
 * Eén fout voor al die gevallen: de reden verraadt anders het bestaan van andermans bestanden.
 */
export async function controleerPlanverwijzingen(db: Db, projectId: string, ids: string[]): Promise<void> {
  const geldig = [...new Set(ids)].filter((id) => UUID.test(id));
  if (geldig.length === 0) return;
  const rijen = await db
    .select({ projectId: bestanden.projectId, soort: bestanden.soort })
    .from(bestanden)
    .where(inArray(bestanden.id, geldig));
  const vreemd = rijen.some(
    (rij) => rij.projectId !== projectId || (rij.soort !== "plan-origineel" && rij.soort !== "plan-raster"),
  );
  if (vreemd) {
    throw maakFout(422, "Het document verwijst naar een bestand dat geen plan van dit project is", "PLANBESTAND_ONBEKEND");
  }
}
