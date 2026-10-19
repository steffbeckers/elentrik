import { z } from "zod";
import { DocumentFout } from "./fouten";
import { resultaat, vereis, type OperatieResultaat } from "./operaties";
import {
  AdresSchema,
  AfwijkingSchema,
  StroomtypeSchema,
  type Adres,
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

/** Velden die `wijzigProject` kan wijzigen. */
export type ProjectWijziging = {
  klantNaam?: string;
  stroomtype?: Stroomtype;
  /** `null` wist het adres van de klant. */
  klantAdres?: Adres | null;
  werfadres?: Adres;
  ean?: string;
  datum?: string;
};

const TekstSchema = z.string();

function valideer<T>(schema: z.ZodType<T>, waarde: unknown): T {
  const geparsed = schema.safeParse(waarde);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  return geparsed.data;
}

/**
 * Wijzigt de projectgegevens: klantnaam, klantadres, werfadres, EAN en datum
 * (`meta`) en het stroomtype (`voeding.stroomtype`). Alles in een aanroep is een
 * resultaat, dus een undo-stap.
 */
export function wijzigProject(
  doc: InstallatieDocument,
  wijziging: ProjectWijziging,
): OperatieResultaat {
  const { stroomtype } = wijziging;
  if (wijziging.klantNaam !== undefined && typeof wijziging.klantNaam !== "string") {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "klantNaam moet tekst zijn" });
  }
  const klantNaam = wijziging.klantNaam;
  if (stroomtype !== undefined) valideer(StroomtypeSchema, stroomtype);
  const klantAdres =
    wijziging.klantAdres === undefined || wijziging.klantAdres === null
      ? wijziging.klantAdres
      : valideer(AdresSchema, wijziging.klantAdres);
  const werfadres =
    wijziging.werfadres === undefined ? undefined : valideer(AdresSchema, wijziging.werfadres);
  const ean = wijziging.ean === undefined ? undefined : valideer(TekstSchema, wijziging.ean);
  const datum = wijziging.datum === undefined ? undefined : valideer(TekstSchema, wijziging.datum);

  if (
    klantNaam === undefined &&
    stroomtype === undefined &&
    klantAdres === undefined &&
    werfadres === undefined &&
    ean === undefined &&
    datum === undefined
  ) {
    return { doc, patches: [], inversePatches: [] };
  }

  return resultaat(doc, (draft) => {
    if (klantNaam !== undefined) draft.meta.klant.naam = klantNaam;
    if (stroomtype !== undefined) draft.voeding.stroomtype = stroomtype;
    if (klantAdres === null) delete draft.meta.klant.adres;
    else if (klantAdres !== undefined) draft.meta.klant.adres = klantAdres;
    if (werfadres !== undefined) draft.meta.werfadres = werfadres;
    if (ean !== undefined) draft.meta.ean = ean;
    if (datum !== undefined) draft.meta.datum = datum;
  });
}
