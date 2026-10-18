// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Een concept is het lokale,
// nog niet naar de server bewaarde werk van één editorvenster, bewaard in IndexedDB.
// Elk venster (elke autosave-instantie) heeft een eigen sleutel, zodat het ene venster
// nooit het concept van een ander wist.
import type { InstallatieDocument } from "@elentrik/model";
import { del, getMany, keys, set } from "idb-keyval";

export type Concept = {
  document: InstallatieDocument;
  /** De serverversie waarop het concept gebaseerd is. */
  versie: number;
  naam: string;
  /** Tijdstip van bewaren, in milliseconden sinds epoch (`Date.now()`). */
  tijd: number;
};

/** Een concept dat bij het openen wordt aangeboden, met de sleutel waaronder het staat. */
export type AangebodenConcept = { sleutel: string; concept: Concept };

function sleutel(projectId: string, instantieId: string): string {
  return `concept:${projectId}:${instantieId}`;
}

/** Een concept van vóór de sleutels per venster, onder `concept:${projectId}`, telt ook mee. */
function hoortBijProject(s: IDBValidKey, projectId: string): s is string {
  return typeof s === "string" && (s === `concept:${projectId}` || s.startsWith(`concept:${projectId}:`));
}

export function bewaarConcept(projectId: string, instantieId: string, concept: Concept): Promise<void> {
  return set(sleutel(projectId, instantieId), concept);
}

export function wisConcept(projectId: string, instantieId: string): Promise<void> {
  return del(sleutel(projectId, instantieId));
}

/** Wist enkel het aangeboden concept; de concepten van andere vensters blijven staan. */
export function wisAangebodenConcept(aangeboden: Pick<AangebodenConcept, "sleutel">): Promise<void> {
  return del(aangeboden.sleutel);
}

/**
 * Het nieuwste concept (op `tijd`) van het project, uit alle vensters, los van de klok van de server:
 * een concept bestaat alleen zolang er onbewaard werk is.
 */
export async function nieuwsteConcept(projectId: string): Promise<AangebodenConcept | null> {
  const sleutels = (await keys()).filter((s): s is string => hoortBijProject(s, projectId));
  const concepten = await getMany<Concept | undefined>(sleutels);
  let nieuwste: AangebodenConcept | null = null;
  for (const [i, s] of sleutels.entries()) {
    const concept = concepten[i];
    if (concept && (nieuwste === null || concept.tijd > nieuwste.concept.tijd)) nieuwste = { sleutel: s, concept };
  }
  return nieuwste;
}
