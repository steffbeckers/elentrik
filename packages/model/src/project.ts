import { z } from "zod";
import { DocumentFout } from "./fouten";
import { resultaat, vereis, type OperatieResultaat } from "./operaties";
import {
  AdresSchema,
  AfwijkingSchema,
  MetingenSchema,
  StroomtypeSchema,
  TaalSchema,
  type Adres,
  type Afwijking,
  type InstallatieDocument,
  type Metingen,
  type NodeId,
  type Stroomtype,
  type Taal,
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
  frequentie_Hz?: number | null;
  /** `null` wist het adres van de klant. */
  klantAdres?: Adres | null;
  werfadres?: Adres;
  ean?: string;
  datum?: string;
  /** De taal van het dossier; `nl` op een document zonder taal verandert niets. */
  dossierTaal?: Taal;
  installatieContext?: "nieuw" | "bestaand" | "onbekend";
  /** Vervangt het hele object; `null` of een leeg object wist de metingen. */
  metingen?: Metingen | null;
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
 * Wijzigt de projectgegevens: klantnaam, klantadres, werfadres, EAN, datum en metingen
 * (`meta`), de dossiertaal (`meta.dossierTaal`) en het stroomtype (`voeding.stroomtype`). Alles in een aanroep is een
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
  if (wijziging.frequentie_Hz != null) valideer(z.number().positive(), wijziging.frequentie_Hz);
  const klantAdres =
    wijziging.klantAdres === undefined || wijziging.klantAdres === null
      ? wijziging.klantAdres
      : valideer(AdresSchema, wijziging.klantAdres);
  const werfadres =
    wijziging.werfadres === undefined ? undefined : valideer(AdresSchema, wijziging.werfadres);
  const ean = wijziging.ean === undefined ? undefined : valideer(TekstSchema, wijziging.ean);
  const datum = wijziging.datum === undefined ? undefined : valideer(TekstSchema, wijziging.datum);
  // Afwezig betekent nl: een taal die al geldt, valt weg.
  const dossierTaal =
    wijziging.dossierTaal === undefined ? undefined : valideer(TaalSchema, wijziging.dossierTaal);
  const nieuweTaal =
    dossierTaal !== undefined && dossierTaal !== (doc.meta.dossierTaal ?? "nl") ? dossierTaal : undefined;
  const installatieContext = wijziging.installatieContext === undefined ? undefined
    : valideer(z.enum(["nieuw", "bestaand", "onbekend"]), wijziging.installatieContext);
  // Een ongedefinieerd veld telt als afwezig; leeg betekent wissen.
  const metingen = wijziging.metingen === undefined ? undefined : wijziging.metingen === null ? null
    : valideer(MetingenSchema, Object.fromEntries(Object.entries(wijziging.metingen).filter(([, w]) => w !== undefined)));
  const nieuweMetingen = metingen === undefined ? undefined
    : metingen === null || Object.keys(metingen).length === 0
      ? (doc.meta.metingen === undefined ? undefined : null)
      : (zelfdeMetingen(metingen, doc.meta.metingen) ? undefined : metingen);

  if (
    klantNaam === undefined &&
    stroomtype === undefined &&
    wijziging.frequentie_Hz === undefined &&
    klantAdres === undefined &&
    werfadres === undefined &&
    ean === undefined &&
    datum === undefined &&
    nieuweTaal === undefined &&
    (installatieContext === undefined || installatieContext === doc.meta.installatieContext) &&
    nieuweMetingen === undefined
  ) {
    return { doc, patches: [], inversePatches: [] };
  }

  return resultaat(doc, (draft) => {
    if (klantNaam !== undefined) draft.meta.klant.naam = klantNaam;
    if (stroomtype !== undefined) draft.voeding.stroomtype = stroomtype;
    if (wijziging.frequentie_Hz === null) delete draft.voeding.frequentie_Hz;
    else if (wijziging.frequentie_Hz !== undefined) draft.voeding.frequentie_Hz = wijziging.frequentie_Hz;
    if (klantAdres === null) delete draft.meta.klant.adres;
    else if (klantAdres !== undefined) draft.meta.klant.adres = klantAdres;
    if (werfadres !== undefined) draft.meta.werfadres = werfadres;
    if (ean !== undefined) draft.meta.ean = ean;
    if (datum !== undefined) draft.meta.datum = datum;
    if (nieuweTaal !== undefined) draft.meta.dossierTaal = nieuweTaal;
    if (installatieContext !== undefined) draft.meta.installatieContext = installatieContext;
    if (nieuweMetingen === null) delete draft.meta.metingen;
    else if (nieuweMetingen !== undefined) draft.meta.metingen = nieuweMetingen;
  });
}

const METINGVELDEN = ["datum", "aardingsweerstand_ohm", "isolatieweerstand_MOhm", "meettoestel", "opmerking"] as const satisfies readonly (keyof Metingen)[];

function zelfdeMetingen(a: Metingen, b: Metingen | undefined): boolean {
  return b !== undefined && METINGVELDEN.every((veld) => a[veld] === b[veld]);
}
