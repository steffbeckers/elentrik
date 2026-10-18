// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Alles wat van buiten komt
// (store, API, navigatie) wordt als optie meegegeven, zodat dit zonder Nuxt te testen is.
import type { InstallatieDocument } from "@elentrik/model";
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import { bewaarConcept, wisConcept } from "./concepten";
import { ConflictFout, type BewaarInvoer, type Project } from "./useProjectenApi";

export type AutosaveStatus = "opgeslagen" | "bezig" | "lokaal" | "conflict";

/** De leden van de editor-store die de autosave gebruikt. */
export type AutosaveStore = {
  document: InstallatieDocument | null;
  projectId: string | null;
  naam: string;
  versie: number;
  gewijzigdSindsOpslaan: number;
  laad(project: { id: string; naam: string; versie: number; document: InstallatieDocument }): void;
};

export type AutosaveOpties = {
  store: AutosaveStore;
  bewaar: (id: string, versie: number, invoer: BewaarInvoer) => Promise<{ versie: number }>;
  haal: (id: string) => Promise<Project>;
  dupliceer: (id: string) => Promise<{ id: string }>;
  /** Navigeert naar een ander project (de kopie). */
  naarProject: (id: string) => void | Promise<void>;
  /** Wachttijd na de laatste wijziging. */
  vertragingMs?: number;
  /** Wachttijd voor een nieuwe poging na een netwerkfout. */
  herprobeerMs?: number;
};

export type Autosave = {
  status: Ref<AutosaveStatus>;
  conflict: Ref<{ huidigeVersie: number } | null>;
  nuOpslaan(): Promise<void>;
  laadServerversie(): Promise<void>;
  bewaarAlsKopie(): Promise<void>;
  /** Stopt de watcher en de timers. Gebeurt ook automatisch als de scope verdwijnt. */
  stop(): void;
};

export function useAutosave(opties: AutosaveOpties): Autosave {
  const { store, bewaar, haal, dupliceer, naarProject } = opties;
  const vertragingMs = opties.vertragingMs ?? 2000;
  const herprobeerMs = opties.herprobeerMs ?? 10_000;

  const status = ref<AutosaveStatus>("opgeslagen");
  const conflict = ref<{ huidigeVersie: number } | null>(null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Het bewaar dat nu loopt; er is er nooit meer dan één tegelijk. */
  let lopend: Promise<void> | undefined;
  /** De waarde van `gewijzigdSindsOpslaan` die al naar de server is. */
  let bewaardeTeller = store.gewijzigdSindsOpslaan;
  let gestopt = false;
  /** Conceptschrijfacties lopen na elkaar, zodat een wis nooit vóór een oudere schrijf valt. */
  let conceptKetting: Promise<unknown> = Promise.resolve();

  function opConceptKetting(taak: () => Promise<void>): Promise<void> {
    // IndexedDB mag stuk zijn (privévenster): de server blijft de bron van waarheid.
    const volgende = conceptKetting.then(taak).catch(() => {});
    conceptKetting = volgende;
    return volgende;
  }

  function wisTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function plan(ms: number): void {
    wisTimer();
    timer = setTimeout(() => {
      timer = undefined;
      void probeer();
    }, ms);
  }

  function onbewaard(): boolean {
    return store.gewijzigdSindsOpslaan !== bewaardeTeller;
  }

  /** Bewaart de huidige staat, tenzij er een conflict is of al een bewaar loopt. */
  async function probeer(): Promise<void> {
    if (gestopt || conflict.value || lopend) return;
    const id = store.projectId;
    const document = store.document;
    if (id === null || document === null) return;
    const teller = store.gewijzigdSindsOpslaan;

    wisTimer();
    status.value = "bezig";
    lopend = (async () => {
      try {
        const resultaat = await bewaar(id, store.versie, { naam: store.naam, document });
        // Intussen een ander project geladen: die staat is niet meer van ons.
        if (store.projectId !== id) return;
        store.versie = resultaat.versie;
        bewaardeTeller = teller;
        if (store.gewijzigdSindsOpslaan === teller) {
          status.value = "opgeslagen";
          await opConceptKetting(() => wisConcept(id));
        } else if (!gestopt) {
          // Er is tijdens het bewaar iets gewijzigd: het concept blijft, en later volgt een nieuw bewaar.
          plan(vertragingMs);
        }
      } catch (fout) {
        if (store.projectId !== id) return;
        if (fout instanceof ConflictFout) {
          conflict.value = { huidigeVersie: fout.huidigeVersie };
          status.value = "conflict";
          wisTimer();
        } else {
          status.value = "lokaal";
          if (!gestopt) plan(herprobeerMs);
        }
      } finally {
        lopend = undefined;
      }
    })();
    await lopend;
  }

  function bijWijziging(teller: number): void {
    if (teller === 0) {
      // `store.laad` zet de teller terug: een vers project, niets om te bewaren.
      bewaardeTeller = 0;
      wisTimer();
      conflict.value = null;
      status.value = "opgeslagen";
      return;
    }
    const id = store.projectId;
    const document = store.document;
    if (id !== null && document !== null) {
      const concept = { document, versie: store.versie, naam: store.naam, tijd: Date.now() };
      void opConceptKetting(() => bewaarConcept(id, concept));
    }
    // Bij een conflict blijft het concept staan, maar gaat er niets naar de server.
    if (conflict.value) return;
    status.value = "bezig";
    // Loopt er een bewaar, dan plant dat zelf een nieuw bewaar als het klaar is.
    if (!lopend) plan(vertragingMs);
  }

  const stopWatch = watch(() => store.gewijzigdSindsOpslaan, bijWijziging);

  async function nuOpslaan(): Promise<void> {
    wisTimer();
    if (lopend) {
      await lopend;
      if (status.value === "lokaal") return;
    }
    if (conflict.value || !onbewaard()) return;
    await probeer();
  }

  async function laadServerversie(): Promise<void> {
    const id = store.projectId;
    if (id === null) return;
    const project = await haal(id);
    wisTimer();
    store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
    bewaardeTeller = store.gewijzigdSindsOpslaan;
    await opConceptKetting(() => wisConcept(id));
    conflict.value = null;
    status.value = "opgeslagen";
  }

  async function bewaarAlsKopie(): Promise<void> {
    const id = store.projectId;
    const document = store.document;
    if (id === null || document === null) return;
    const naam = `${store.naam} (kopie)`;
    wisTimer();
    const kopie = await dupliceer(id);
    // Een nieuw project begint op versie 1.
    await bewaar(kopie.id, 1, { naam, document });
    await opConceptKetting(() => wisConcept(id));
    await naarProject(kopie.id);
  }

  function stop(): void {
    gestopt = true;
    stopWatch();
    wisTimer();
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { status, conflict, nuOpslaan, laadServerversie, bewaarAlsKopie, stop };
}
