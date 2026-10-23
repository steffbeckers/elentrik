// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Een concept is het lokale,
// nog niet naar de server bewaarde werk van één editorvenster, bewaard in IndexedDB.
// Elk venster (elke autosave-instantie) heeft een eigen sleutel, zodat het ene venster
// nooit het concept van een ander wist. Concepten horen bij de ingelogde gebruiker (spec 5b.2):
// een gebruiker krijgt alleen zijn eigen concepten aangeboden, ook na uitloggen blijven ze staan.
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

/** Waar een concept staat: van welke gebruiker, voor welk project, uit welk venster. */
export type ConceptPlek = { gebruikerId: string; projectId: string; instantieId: string };

/**
 * `concept:u:<gebruikerId>:<projectId>:<instantieId>`. Het voorvoegsel `u:` onderscheidt de sleutel
 * van de oude sleutels zonder gebruiker (`concept:<projectId>` en `concept:<projectId>:<instantieId>`):
 * een project-id is nooit `u`.
 */
function sleutel({ gebruikerId, projectId, instantieId }: ConceptPlek): string {
  return `${voorvoegsel(gebruikerId, projectId)}${instantieId}`;
}

/** Zonder gebruiker gooit dit: een concept zonder eigenaar bestaat nooit. */
function voorvoegsel(gebruikerId: string, projectId: string): string {
  if (!gebruikerId) throw new Error("Een concept hoort bij een gebruiker (gebruikerId ontbreekt).");
  return `concept:u:${gebruikerId}:${projectId}:`;
}

/** Een oude sleutel van het project, zonder gebruiker: van vóór het inloggen. */
function isOudeSleutel(s: IDBValidKey, projectId: string): s is string {
  return typeof s === "string" && (s === `concept:${projectId}` || s.startsWith(`concept:${projectId}:`));
}

/** De sleutel waaronder een oud concept voortaan van de gebruiker is; het venster blijft hetzelfde. */
function eigenSleutelVoorOud(oud: string, gebruikerId: string, projectId: string): string {
  const instantieId = oud === `concept:${projectId}` ? "oud" : oud.slice(`concept:${projectId}:`.length);
  return sleutel({ gebruikerId, projectId, instantieId });
}

export async function bewaarConcept(plek: ConceptPlek, concept: Concept): Promise<void> {
  await set(sleutel(plek), concept);
}

export async function wisConcept(plek: ConceptPlek): Promise<void> {
  await del(sleutel(plek));
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
 * Neemt de oude concepten van het project (zonder gebruiker in de sleutel) over voor `gebruikerId`:
 * ze komen onder zijn eigen sleutel en de oude sleutel verdwijnt. Zo krijgt alleen de eerste
 * ingelogde gebruiker die het project opent ze aangeboden (spec 5b.2), en gaat er niets verloren.
 * Alles in één transactie: twee vensters tegelijk nemen een oud concept nooit allebei over.
 */
async function neemOudeConceptenOver(projectId: string, gebruikerId: string): Promise<void> {
  voorvoegsel(gebruikerId, projectId);
  return archief()(
    "readwrite",
    (winkel) =>
      new Promise<void>((klaar, fout) => {
        const verzoek = winkel.getAllKeys();
        verzoek.onsuccess = () => {
          for (const oud of verzoek.result.filter((s) => isOudeSleutel(s, projectId))) {
            const nieuw = eigenSleutelVoorOud(oud, gebruikerId, projectId);
            const oudVerzoek = winkel.get(oud);
            const nieuwVerzoek = winkel.get(nieuw);
            nieuwVerzoek.onsuccess = () => {
              const oudConcept = oudVerzoek.result as Concept | undefined;
              // Staat er al een concept onder die sleutel, dan krijgt het oude een eigen, nieuw
              // venster: geen van beide gaat verloren.
              const doel =
                nieuwVerzoek.result === undefined
                  ? nieuw
                  : sleutel({ gebruikerId, projectId, instantieId: maakInstantieId() });
              if (oudConcept) winkel.put(oudConcept, doel);
              winkel.delete(oud);
            };
          }
        };
        winkel.transaction.oncomplete = () => klaar();
        winkel.transaction.onabort = () => fout(winkel.transaction.error);
      }),
  );
}

/**
 * Het nieuwste concept (op `tijd`) van de gebruiker voor het project, uit al zijn vensters, los
 * van de klok van de server: een concept bestaat alleen zolang er onbewaard werk is. Oude concepten
 * zonder gebruiker worden eerst van deze gebruiker (`neemOudeConceptenOver`).
 */
export async function nieuwsteConcept(projectId: string, gebruikerId: string): Promise<AangebodenConcept | null> {
  await neemOudeConceptenOver(projectId, gebruikerId);
  const eigen = voorvoegsel(gebruikerId, projectId);
  const sleutels = (await keys()).filter((s): s is string => typeof s === "string" && s.startsWith(eigen));
  const concepten = await getMany<Concept | undefined>(sleutels);
  let nieuwste: AangebodenConcept | null = null;
  for (const [i, s] of sleutels.entries()) {
    const concept = concepten[i];
    if (concept && (nieuwste === null || concept.tijd > nieuwste.concept.tijd)) nieuwste = { sleutel: s, concept };
  }
  return nieuwste;
}
