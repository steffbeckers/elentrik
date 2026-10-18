// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Een concept is het lokale,
// nog niet naar de server bewaarde werk van één editorvenster, bewaard in IndexedDB.
// Elk venster (elke autosave-instantie) heeft een eigen sleutel, zodat het ene venster
// nooit het concept van een ander wist.
import type { InstallatieDocument } from "@elentrik/model";
import { createStore, del, getMany, keys, set, type UseStore } from "idb-keyval";

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

/**
 * Dezelfde database en objectstore als de standaardfuncties van idb-keyval. Pas bij het eerste
 * gebruik geopend: `createStore` opent meteen IndexedDB, en dat bestaat niet bij server-rendering.
 */
let archiefWinkel: UseStore | undefined;
function archief(): UseStore {
  archiefWinkel ??= createStore("keyval-store", "keyval");
  return archiefWinkel;
}

/**
 * Wist enkel het aangeboden concept, en alleen als het nog ongewijzigd is (zelfde `tijd`). Heeft
 * een ander venster dat nog leeft het intussen herschreven, dan blijft het staan. Lezen en wissen
 * gebeuren in één transactie.
 */
export function wisAangebodenConcept(aangeboden: AangebodenConcept): Promise<void> {
  return archief()(
    "readwrite",
    (winkel) =>
      new Promise<void>((klaar, fout) => {
        const verzoek = winkel.get(aangeboden.sleutel);
        verzoek.onsuccess = () => {
          const huidig = verzoek.result as Concept | undefined;
          if (huidig?.tijd === aangeboden.concept.tijd) winkel.delete(aangeboden.sleutel);
        };
        winkel.transaction.oncomplete = () => klaar();
        winkel.transaction.onabort = () => fout(winkel.transaction.error);
      }),
  );
}

type Willekeur = {
  randomUUID?: () => string;
  getRandomValues?: (rij: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
};

/**
 * Een id voor een editorvenster. `crypto.randomUUID` bestaat alleen in een veilige context; daarbuiten
 * volgt `getRandomValues`, en zonder `crypto` de tijd met `Math.random`.
 */
export function maakInstantieId(willekeur: Willekeur | null = globalThis.crypto ?? null): string {
  if (willekeur?.randomUUID) return willekeur.randomUUID();
  if (willekeur?.getRandomValues) {
    const bytes = willekeur.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 2 ** 52).toString(36)}`;
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
