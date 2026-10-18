// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Alles wat van buiten komt
// (store, API, navigatie) wordt als optie meegegeven, zodat dit zonder Nuxt te testen is.
import type { InstallatieDocument } from "@elentrik/model";
import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import { bewaarConcept as bewaarConceptEcht, wisConcept as wisConceptEcht, type Concept } from "./concepten";
import { ConflictFout, type BewaarInvoer, type Project } from "./useProjectenApi";

/**
 * - `opgeslagen`: de server heeft de laatste wijziging.
 * - `bezig`: er is een wijziging die nog naar de server moet (wacht op de vertraging) of ze is onderweg.
 * - `lokaal`: bewaren op de server lukt niet (netwerk, 5xx, 408 of 429), maar het concept staat in IndexedDB.
 *   Er volgt een nieuwe poging.
 * - `onbewaard`: idem, maar ook het concept kon niet bewaard worden: de wijziging bestaat alleen in het geheugen.
 * - `conflict`: de server heeft een nieuwere versie (409). Er wordt niets overschreven en niets meer verstuurd
 *   tot `laadServerversie` of `bewaarAlsKopie` het oplost.
 * - `fout`: de server weigert het document (4xx, bv. 422 of 404). Geen automatische nieuwe poging en geen
 *   autosave meer; `nuOpslaan()` probeert het handmatig opnieuw.
 */
export type AutosaveStatus = "opgeslagen" | "bezig" | "lokaal" | "onbewaard" | "conflict" | "fout";

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
  /** Het conceptarchief; standaard IndexedDB via `concepten.ts`. Injecteerbaar voor tests. */
  concepten?: {
    bewaarConcept: (projectId: string, concept: Concept) => Promise<void>;
    wisConcept: (projectId: string) => Promise<void>;
  };
};

export type Autosave = {
  status: Ref<AutosaveStatus>;
  conflict: Ref<{ huidigeVersie: number } | null>;
  /** Gezet bij status `fout`: de HTTP-status waarmee de server het bewaren weigerde. */
  fout: Ref<{ status: number } | null>;
  nuOpslaan(): Promise<void>;
  laadServerversie(): Promise<void>;
  bewaarAlsKopie(): Promise<void>;
  /**
   * Stopt de watcher en de timers. Gebeurt ook automatisch als de scope verdwijnt. Staan er dan
   * onbewaarde wijzigingen (en geen conflict of fout), dan volgt nog één poging om ze te bewaren.
   */
  stop(): void;
};

/** 4xx-statussen die tijdelijk zijn (time-out, te veel verzoeken): die volgen het pad van een 5xx. */
const TIJDELIJK = new Set([408, 429]);

/**
 * Voor `beforeunload`: zolang niet alles op de server staat, vraagt de browser of de gebruiker
 * de pagina echt wil verlaten.
 */
export function waarschuwBijVerlaten(status: AutosaveStatus, event: { preventDefault(): void }): void {
  if (status !== "opgeslagen") event.preventDefault();
}

/** De HTTP-status van een fout zoals `$fetch` hem geeft (`status` of `statusCode`). */
function httpStatus(fout: unknown): number | undefined {
  if (typeof fout !== "object" || fout === null) return undefined;
  const { status, statusCode } = fout as { status?: unknown; statusCode?: unknown };
  const waarde = status ?? statusCode;
  return typeof waarde === "number" ? waarde : undefined;
}

/**
 * Automatisch opslaan: een wijziging bewaart meteen een concept in IndexedDB en na `vertragingMs`
 * zonder nieuwe wijziging het project op de server (`PUT` met `If-Match`).
 *
 * Bekende beperking: gaat het antwoord verloren nadat de server het document wel bewaarde, dan
 * stuurt de nieuwe poging de oude versie mee en volgt een 409 op onze eigen wijziging. De gebruiker
 * kiest dan in het conflictscherm; er gaat niets verloren.
 */
export function useAutosave(opties: AutosaveOpties): Autosave {
  const { store, bewaar, haal, dupliceer, naarProject } = opties;
  const vertragingMs = opties.vertragingMs ?? 2000;
  const herprobeerMs = opties.herprobeerMs ?? 10_000;
  const concepten = opties.concepten ?? { bewaarConcept: bewaarConceptEcht, wisConcept: wisConceptEcht };

  const status = ref<AutosaveStatus>("opgeslagen");
  const conflict = ref<{ huidigeVersie: number } | null>(null);
  const fout = ref<{ status: number } | null>(null);

  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Het bewaar (of de kopie) dat nu loopt; er is er nooit meer dan één tegelijk. */
  let lopend: Promise<void> | undefined;
  /** De waarde van `gewijzigdSindsOpslaan` die al naar de server is. */
  let bewaardeTeller = store.gewijzigdSindsOpslaan;
  let gestopt = false;
  /** Of de laatste conceptschrijfactie lukte. */
  let conceptGelukt = true;
  /** Conceptschrijfacties lopen na elkaar, zodat een wis nooit vóór een oudere schrijf valt. */
  let conceptKetting: Promise<unknown> = Promise.resolve();

  function offlineStatus(): AutosaveStatus {
    return conceptGelukt ? "lokaal" : "onbewaard";
  }

  function werkOfflineStatusBij(): void {
    if (status.value === "lokaal" || status.value === "onbewaard") status.value = offlineStatus();
  }

  function schrijfConcept(id: string, concept: Concept): void {
    conceptKetting = conceptKetting.then(async () => {
      try {
        await concepten.bewaarConcept(id, concept);
        conceptGelukt = true;
      } catch {
        conceptGelukt = false;
      }
      werkOfflineStatusBij();
    });
  }

  /** Een mislukte wis is niet erg: `nieuwerConcept` negeert een concept dat ouder is dan de server. */
  function wisConceptVeilig(id: string): Promise<void> {
    const volgende = conceptKetting.then(() => concepten.wisConcept(id)).catch(() => {});
    conceptKetting = volgende;
    return volgende;
  }

  function wisTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function plan(ms: number): void {
    wisTimer();
    if (gestopt) return;
    timer = setTimeout(() => {
      timer = undefined;
      void probeer();
    }, ms);
  }

  function onbewaard(): boolean {
    return store.gewijzigdSindsOpslaan !== bewaardeTeller;
  }

  /** Wijzigingen die tijdens een bewaar binnenkwamen krijgen hier hun eigen, gedebouncete bewaar. */
  function herplan(): void {
    if (!gestopt && !conflict.value && !fout.value && onbewaard() && timer === undefined) plan(vertragingMs);
  }

  /** Voert `werk` uit als het ene lopende bewaar; daarna volgt zo nodig een nieuw bewaar. */
  function startLopend(werk: () => Promise<void>): Promise<void> {
    const taak = (async () => {
      try {
        await werk();
      } finally {
        lopend = undefined;
        herplan();
      }
    })();
    lopend = taak.catch(() => {});
    return taak;
  }

  /** Bewaart de huidige staat, tenzij er een conflict of fout is of al een bewaar loopt. */
  async function probeer(): Promise<void> {
    if (conflict.value || fout.value || lopend) return;
    const id = store.projectId;
    const document = store.document;
    if (id === null || document === null) return;
    const teller = store.gewijzigdSindsOpslaan;

    wisTimer();
    // Na een mislukte poging blijft `lokaal` of `onbewaard` staan tot een bewaar slaagt.
    if (status.value !== "lokaal" && status.value !== "onbewaard") status.value = "bezig";
    await startLopend(async () => {
      try {
        const resultaat = await bewaar(id, store.versie, { naam: store.naam, document });
        // Intussen een ander project geladen: die staat is niet meer van ons.
        if (store.projectId !== id) return;
        store.versie = resultaat.versie;
        bewaardeTeller = teller;
        if (store.gewijzigdSindsOpslaan === teller) {
          conceptGelukt = true;
          status.value = "opgeslagen";
          await wisConceptVeilig(id);
        } else if (status.value !== "bezig") {
          // Er kwam iets bij tijdens het bewaar: `herplan` bewaart opnieuw, het concept blijft.
          status.value = "bezig";
        }
      } catch (e) {
        if (store.projectId !== id) return;
        const httpCode = httpStatus(e);
        if (e instanceof ConflictFout) {
          conflict.value = { huidigeVersie: e.huidigeVersie };
          status.value = "conflict";
          wisTimer();
        } else if (httpCode !== undefined && httpCode >= 400 && httpCode < 500 && !TIJDELIJK.has(httpCode)) {
          // De server weigert dit document; opnieuw proberen verandert daar niets aan.
          fout.value = { status: httpCode };
          status.value = "fout";
          wisTimer();
        } else {
          // Netwerk, 5xx, 408 of 429: later opnieuw.
          status.value = offlineStatus();
          plan(herprobeerMs);
        }
      }
    });
  }

  function bijWijziging(teller: number): void {
    if (teller === 0) {
      // `store.laad` zet de teller terug: een vers project, niets om te bewaren.
      bewaardeTeller = 0;
      conceptGelukt = true;
      wisTimer();
      conflict.value = null;
      fout.value = null;
      status.value = "opgeslagen";
      return;
    }
    const id = store.projectId;
    const document = store.document;
    if (id !== null && document !== null) {
      schrijfConcept(id, { document, versie: store.versie, naam: store.naam, tijd: Date.now() });
    }
    // Bij een conflict of fout blijft het concept staan, maar gaat er niets naar de server.
    if (conflict.value || fout.value) return;
    if (status.value !== "lokaal" && status.value !== "onbewaard") status.value = "bezig";
    // Loopt er een bewaar, dan plant dat zelf een nieuw bewaar als het klaar is.
    if (!lopend) plan(vertragingMs);
  }

  const stopWatch = watch(() => store.gewijzigdSindsOpslaan, bijWijziging);

  /** Bewaart nu, zonder de vertraging; na een `fout` is dit de handmatige nieuwe poging. */
  async function nuOpslaan(): Promise<void> {
    wisTimer();
    let gewacht = false;
    while (lopend) {
      gewacht = true;
      await lopend;
    }
    if (gewacht && (status.value === "lokaal" || status.value === "onbewaard" || status.value === "fout")) return;
    if (conflict.value || !onbewaard()) return;
    fout.value = null;
    await probeer();
  }

  async function laadServerversie(): Promise<void> {
    const id = store.projectId;
    if (id === null) return;
    const project = await haal(id);
    wisTimer();
    store.laad({ id: project.id, naam: project.naam, versie: project.versie, document: project.document });
    bewaardeTeller = store.gewijzigdSindsOpslaan;
    // Eerst de status, dan pas wachten (zoals in `probeer`): een wijziging tijdens het wissen
    // mag niet op een achtergebleven conflict botsen en daarna verloren gaan.
    conceptGelukt = true;
    conflict.value = null;
    fout.value = null;
    status.value = "opgeslagen";
    await wisConceptVeilig(id);
  }

  async function bewaarAlsKopie(): Promise<void> {
    while (lopend) await lopend;
    const id = store.projectId;
    if (id === null || store.document === null) return;
    wisTimer();
    await startLopend(async () => {
      const kopie = await dupliceer(id);
      // De kopie heeft een eigen document-id; die nemen we over, anders delen origineel en kopie er één.
      const kopieDocId = (await haal(kopie.id)).document.id;
      let versie = 1;
      let teller: number;
      do {
        teller = store.gewijzigdSindsOpslaan;
        const document = store.document;
        if (document === null) return;
        const resultaat = await bewaar(kopie.id, versie, {
          naam: `${store.naam} (kopie)`,
          document: { ...document, id: kopieDocId },
        });
        versie = resultaat.versie;
        // Kwam er tijdens het bewaar nog een wijziging bij, dan gaat die ook naar de kopie.
      } while (store.gewijzigdSindsOpslaan !== teller);
      bewaardeTeller = store.gewijzigdSindsOpslaan;
      await wisConceptVeilig(id);
      await naarProject(kopie.id);
    });
  }

  function stop(): void {
    if (gestopt) return;
    gestopt = true;
    stopWatch();
    wisTimer();
    // In-app navigeren binnen de vertraging mag de serverbewaring niet overslaan.
    if (conflict.value || fout.value || store.document === null || !onbewaard()) return;
    // Het project van nu: is er na het wachten een ander project geladen (de volgende pagina),
    // dan is die staat niet van ons en gaat er niets naar de server.
    const id = store.projectId;
    void (async () => {
      while (lopend) await lopend;
      if (store.projectId !== id) return;
      await nuOpslaan();
    })().catch(() => {});
  }

  if (getCurrentScope()) onScopeDispose(stop);

  return { status, conflict, fout, nuOpslaan, laadServerversie, bewaarAlsKopie, stop };
}
