import type { Analyse } from "@elentrik/arei";
import type { InstallatieDocument } from "@elentrik/model";
import { tePlaatsen } from "./te-plaatsen";

/** Completeness includes all placeable components, including infrastructure. This is separate
 * from electrical point findings: an unplaced meter is incomplete, not an electrical violation.
 * Missing measurements are incomplete too; a recorded value is never judged (0 counts as filled in). */
export function dossierStatus(doc: InstallatieDocument | null, analyse: Analyse | null) {
  const ontbreekt: ("klant" | "werfadres" | "context" | "schema" | "aardingsweerstand" | "isolatieweerstand")[] = [];
  if (!doc?.meta.klant.naam.trim()) ontbreekt.push("klant");
  const adres = doc?.meta.werfadres;
  if (!adres || ![adres.straat, adres.nummer, adres.postcode, adres.gemeente].every(v => v.trim())) ontbreekt.push("werfadres");
  if (!doc?.meta.installatieContext || doc.meta.installatieContext === "onbekend") ontbreekt.push("context");
  if (!analyse?.kringen.length) ontbreekt.push("schema");
  if (doc?.meta.metingen?.aardingsweerstand_ohm === undefined) ontbreekt.push("aardingsweerstand");
  if (doc?.meta.metingen?.isolatieweerstand_MOhm === undefined) ontbreekt.push("isolatieweerstand");
  const paginas = (doc?.situatie.paginas ?? []).filter(p => !p.referentie);
  const plannen = paginas.filter(p => p.achtergrond).length;
  const zonderPlan = paginas.filter(p => !p.achtergrond).length;
  const ongeplaatsteIds = doc && analyse ? tePlaatsen(doc, analyse).flatMap(g => g.nodeIds) : [];
  const ongeplaatst = ongeplaatsteIds.length;
  return { ontbreekt, plannen, zonderPlan, ongeplaatst, ongeplaatsteIds,
    volledig: !!doc && !!analyse && !ontbreekt.length && plannen > 0 && !zonderPlan && !ongeplaatst };
}
