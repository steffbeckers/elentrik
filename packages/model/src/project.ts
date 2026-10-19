import { DocumentFout } from "./fouten";
import { resultaat, vereis, type OperatieResultaat } from "./operaties";
import {
  AfwijkingSchema,
  StroomtypeSchema,
  type Afwijking,
  type InstallatieDocument,
  type NodeId,
  type Stroomtype,
} from "./schema";

/**
 * Voegt een afwijking toe. Een bestaande afwijking met dezelfde `regelId` en
 * `nodeId` wordt op dezelfde plek vervangen.
 */
export function voegAfwijkingToe(
  doc: InstallatieDocument,
  afwijking: Afwijking,
): OperatieResultaat {
  const geparsed = AfwijkingSchema.safeParse(afwijking);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  const nieuw = geparsed.data;
  vereis(doc, nieuw.nodeId);

  return resultaat(doc, (draft) => {
    const positie = draft.afwijkingen.findIndex(
      (a) => a.regelId === nieuw.regelId && a.nodeId === nieuw.nodeId,
    );
    if (positie === -1) draft.afwijkingen.push(nieuw);
    else draft.afwijkingen[positie] = nieuw;
  });
}

/** Verwijdert een afwijking. Bestaat ze niet (ook niet voor een onbekende node), dan is het een no-op. */
export function verwijderAfwijking(
  doc: InstallatieDocument,
  regelId: string,
  nodeId: NodeId,
): OperatieResultaat {
  if (!doc.afwijkingen.some((a) => a.regelId === regelId && a.nodeId === nodeId)) {
    return { doc, patches: [], inversePatches: [] };
  }
  return resultaat(doc, (draft) => {
    draft.afwijkingen = draft.afwijkingen.filter(
      (a) => !(a.regelId === regelId && a.nodeId === nodeId),
    );
  });
}

/** Wijzigt de klantnaam (`meta.klant.naam`) en/of het stroomtype (`voeding.stroomtype`). */
export function wijzigProject(
  doc: InstallatieDocument,
  wijziging: { klantNaam?: string; stroomtype?: Stroomtype },
): OperatieResultaat {
  const { klantNaam, stroomtype } = wijziging;
  if (klantNaam !== undefined && typeof klantNaam !== "string") {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "klantNaam moet tekst zijn" });
  }
  if (stroomtype !== undefined) {
    const geparsed = StroomtypeSchema.safeParse(stroomtype);
    if (!geparsed.success) {
      throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
    }
  }
  if (klantNaam === undefined && stroomtype === undefined) {
    return { doc, patches: [], inversePatches: [] };
  }

  return resultaat(doc, (draft) => {
    if (klantNaam !== undefined) draft.meta.klant.naam = klantNaam;
    if (stroomtype !== undefined) draft.voeding.stroomtype = stroomtype;
  });
}
