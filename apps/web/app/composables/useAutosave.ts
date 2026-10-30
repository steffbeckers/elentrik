// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Alles wat van buiten komt
// (store, API, navigatie) wordt als optie meegegeven, zodat dit zonder Nuxt te testen is.
import type { InstallatieDocument } from "@elentrik/model";
import { getCurrentScope, nextTick, onScopeDispose, ref, watch, type Ref } from "vue";
import {
  bewaarConcept as bewaarConceptEcht,
  maakInstantieId,
  wisConcept as wisConceptEcht,
  type Concept,
  type ConceptPlek,
} from "./concepten";
import { ABONNEMENT_VEREIST } from "../../shared/abonnement";
import { foutCode } from "../sessie/fouten";
import { ConflictFout, httpStatus, type BewaarInvoer, type Project } from "./useProjectenApi";

/**
 * - `opgeslagen`: de server heeft de laatste wijziging.
 * - `bezig`: er is een wijziging die nog naar de server moet (wacht op de vertraging) of ze is onderweg.
 * - `lokaal`: bewaren op de server lukt niet (netwerk, 5xx, 408 of 429), maar het concept staat in IndexedDB.
 *   Er volgt een nieuwe poging. Na een 401 (de sessie is verlopen) ook `lokaal`, maar met `afgemeld`:
 *   dan volgt geen nieuwe poging tot `nuOpslaan()`, na opnieuw inloggen.
 * - `onbewaard`: idem, maar ook het concept kon niet bewaard worden: de wijziging bestaat alleen in het geheugen.
 * - `conflict`: de server heeft een nieuwere versie (409). Er wordt niets overschreven en niets meer verstuurd
 *   tot `laadServerversie` of `bewaarAlsKopie` het oplost.
 * - `fout`: de server weigert het document (4xx, bv. 422 of 404). Geen automatische nieuwe poging en geen
 *   autosave meer; `nuOpslaan()` probeert het handmatig opnieuw.
 * - `alleen-lezen`: de server antwoordde 402 `ABONNEMENT_VEREIST`: de organisatie mag niet meer schrijven.
 *   Het werk staat in het concept; zoals bij `afgemeld` volgt geen nieuwe poging tot `nuOpslaan()`.
 *   Lukt het concept niet (of niet meer), dan is de status `onbewaard`; `alleenLezen` blijft dan true.
 */
export type AutosaveStatus = "opgeslagen" | "bezig" | "lokaal" | "onbewaard" | "conflict" | "fout" | "alleen-lezen";

/** De leden van de editor-store die de autosave gebruikt. */
export type AutosaveStore = {
  document: InstallatieDocument | null;
  projectId: string | null;
  naam: string;
  versie: number;
  gewijzigdSindsOpslaan: number;
  /** Stijgt bij elke `laad`; de store houdt hem bij (ruling E11). */
  readonly laadGeneratie: number;
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
    bewaarConcept: (plek: ConceptPlek, concept: Concept) => Promise<void>;
    wisConcept: (plek: ConceptPlek) => Promise<void>;
  };
  /** De ingelogde gebruiker die dit venster opende: zijn concepten zijn alleen van hem. */
  gebruikerId: string;
  /** Het id van dit editorvenster, voor de sleutel van het concept; standaard een nieuwe UUID. */
  instantieId?: string;
};

/**
 * De server heeft een andere versie dan de editor toont. `lokaleWijzigingen`: staan er in de editor
 * wijzigingen die nog niet op de server staan? Bij een 409 op het bewaren altijd; bij de export
 * (die enkel van een opgeslagen project kan) meestal niet: dan toont de editor gewoon een oudere versie.
 */
export type Conflict = { huidigeVersie: number; lokaleWijzigingen: boolean };

export type Autosave = {
  status: Ref<AutosaveStatus>;
  conflict: Ref<Conflict | null>;
  /** Gezet bij status `fout`: de HTTP-status waarmee de server het bewaren weigerde. */
  fout: Ref<{ status: number } | null>;
  /**
   * De server antwoordde 401: de sessie is verlopen. Het werk staat in het concept; er gaat
   * niets meer naar de server tot `nuOpslaan()`. Een geslaagd bewaar zet dit terug op false.
   */
  afgemeld: Ref<boolean>;
  /**
   * De server antwoordde 402 `ABONNEMENT_VEREIST`. Het werk staat in het concept; er gaat niets
   * meer naar de server tot `nuOpslaan()` (na een abonnement). Een geslaagd bewaar zet dit terug op false.
   */
  alleenLezen: Ref<boolean>;
  nuOpslaan(): Promise<void>;
  laadServerversie(): Promise<void>;
  bewaarAlsKopie(): Promise<void>;
  /**
   * Een 409 van buiten het bewaren (de export): de server heeft een andere versie dan de editor.
   * Hetzelfde conflictpad als een 409 bij het bewaren; `laadServerversie` of `bewaarAlsKopie` lost het op.
   */
  meldConflict(huidigeVersie: number): void;
  /**
   * Stopt de watcher en de timers. Gebeurt ook automatisch als de scope verdwijnt. Staan er dan
   * onbewaarde wijzigingen (en geen conflict of fout), dan volgt nog één poging om ze te bewaren.
   */
  stop(): void;
  /**
   * Wacht tot de conceptschrijfacties van de wijzigingen tot nu klaar zijn, en geeft of de laatste
   * lukte (dan staat het werk van dit venster in zijn eigen concept).
   */
  wachtOpConcept(): Promise<boolean>;
};

/** 4xx-statussen die tijdelijk zijn (time-out, te veel verzoeken): die volgen het pad van een 5xx. */
const TIJDELIJK = new Set([408, 429]);

/** Geen (geldige) sessie meer. */
const AFGEMELD = 401;

/** De organisatie mag niet (meer) schrijven; samen met de code `ABONNEMENT_VEREIST`. */
const BETALING_VEREIST = 402;

/**
 * Voor `beforeunload` en het navigeren in de app: zolang niet alles op de server staat, vragen we
 * of de gebruiker de pagina echt wil verlaten.
 */
export function waarschuwBijVerlaten(status: AutosaveStatus): boolean {
  return status !== "opgeslagen";
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
  // Elk venster schrijft en wist alleen zijn eigen concept.
  const instantieId = opties.instantieId ?? maakInstantieId();
  const { gebruikerId } = opties;
  // Nooit een concept zonder eigenaar: zonder gebruiker geen autosave.
  if (!gebruikerId) throw new Error("De autosave heeft een ingelogde gebruiker nodig (gebruikerId).");
  const plekVan = (projectId: string): ConceptPlek => ({ gebruikerId, projectId, instantieId });

  const status = ref<AutosaveStatus>("opgeslagen");
  const conflict = ref<Conflict | null>(null);
  const fout = ref<{ status: number } | null>(null);
  const afgemeld = ref(false);
  const alleenLezen = ref(false);

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
  /**
   * De schrijfactie die achteraan de ketting wacht en nog niet begonnen is. Een nieuwe wijziging
   * vervangt haar inhoud in plaats van er een schrijfactie bij te zetten. Een wis maakt dit leeg,
   * zodat een latere wijziging altijd na de wis geschreven wordt.
   */
  let wachtendConcept: { id: string; concept: Concept } | null = null;

  function offlineStatus(): AutosaveStatus {
    return conceptGelukt ? "lokaal" : "onbewaard";
  }

  /**
   * De status na een 402: `alleen-lezen` zolang het werk in het concept staat, anders `onbewaard`
   * (het geheugen is dan de enige kopie). Nooit meer beloven dan er is.
   */
  function alleenLezenStatus(): AutosaveStatus {
    return conceptGelukt ? "alleen-lezen" : "onbewaard";
  }

  function werkOfflineStatusBij(): void {
    if (alleenLezen.value) {
      if (status.value === "alleen-lezen" || status.value === "onbewaard") status.value = alleenLezenStatus();
      return;
    }
    if (status.value === "lokaal" || status.value === "onbewaard") status.value = offlineStatus();
  }

  function schrijfConcept(id: string, concept: Concept): void {
    if (wachtendConcept !== null) {
      wachtendConcept.id = id;
      wachtendConcept.concept = concept;
      return;
    }
    const teSchrijven = { id, concept };
    wachtendConcept = teSchrijven;
    conceptKetting = conceptKetting.then(async () => {
      // Vanaf hier loopt ze: een volgende wijziging krijgt een eigen schrijfactie.
      if (wachtendConcept === teSchrijven) wachtendConcept = null;
      try {
        await concepten.bewaarConcept(plekVan(teSchrijven.id), teSchrijven.concept);
        conceptGelukt = true;
      } catch {
        conceptGelukt = false;
      }
      werkOfflineStatusBij();
    });
  }

  /**
   * Een mislukte wis verliest niets: het achtergebleven concept wordt bij het volgende openen
   * aangeboden en de gebruiker kan het verwerpen.
   */
  function wisConceptVeilig(id: string): Promise<void> {
    // De wachtende schrijfactie gaat nog vóór de wis; wat erna komt, hoort achter de wis.
    wachtendConcept = null;
    const volgende = conceptKetting.then(() => concepten.wisConcept(plekVan(id))).catch(() => {});
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

  /** Bewaart de autosave vanzelf? Niet bij een conflict, een fout, na een 401 (afgemeld) of een 402 (alleen-lezen). */
  function automatisch(): boolean {
    return !conflict.value && !fout.value && !afgemeld.value && !alleenLezen.value;
  }

  /** Wijzigingen die tijdens een bewaar binnenkwamen krijgen hier hun eigen, gedebouncete bewaar. */
  function herplan(): void {
    if (!gestopt && automatisch() && onbewaard() && timer === undefined) plan(vertragingMs);
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
    const generatie = store.laadGeneratie;

    wisTimer();
    // Na een mislukte poging blijft `lokaal` of `onbewaard` staan tot een bewaar slaagt.
    if (status.value !== "lokaal" && status.value !== "onbewaard") status.value = "bezig";
    await startLopend(async () => {
      try {
        const resultaat = await bewaar(id, store.versie, { naam: store.naam, document });
        // Intussen opnieuw geladen (een ander project, of hetzelfde in een nieuwe pagina):
        // die staat is niet meer van ons.
        if (store.laadGeneratie !== generatie) return;
        store.versie = resultaat.versie;
        bewaardeTeller = teller;
        afgemeld.value = false;
        alleenLezen.value = false;
        if (store.gewijzigdSindsOpslaan === teller) {
          conceptGelukt = true;
          status.value = "opgeslagen";
          await wisConceptVeilig(id);
        } else {
          // Er kwam iets bij tijdens het bewaar: `herplan` bewaart opnieuw en het concept blijft,
          // nu op de nieuwe serverversie. Anders botst het na een crash op onze eigen bewaring.
          const huidig = store.document;
          if (huidig !== null) {
            schrijfConcept(id, { document: huidig, versie: store.versie, naam: store.naam, tijd: Date.now() });
          }
          if (status.value !== "bezig") status.value = "bezig";
        }
      } catch (e) {
        if (store.laadGeneratie !== generatie) return;
        const httpCode = httpStatus(e);
        if (e instanceof ConflictFout) {
          conflict.value = { huidigeVersie: e.huidigeVersie, lokaleWijzigingen: true };
          status.value = "conflict";
          wisTimer();
        } else if (httpCode === AFGEMELD) {
          // De sessie is verlopen: het werk staat in het concept. Opnieuw proberen heeft pas zin
          // na opnieuw inloggen, dus geen nieuwe poging tot `nuOpslaan()`.
          afgemeld.value = true;
          alleenLezen.value = false;
          status.value = offlineStatus();
          wisTimer();
        } else if (httpCode === BETALING_VEREIST && foutCode(e) === ABONNEMENT_VEREIST) {
          // De organisatie mag niet meer schrijven: het werk staat in het concept. Opnieuw proberen
          // heeft pas zin na een abonnement, dus geen nieuwe poging tot `nuOpslaan()`.
          alleenLezen.value = true;
          afgemeld.value = false;
          status.value = alleenLezenStatus();
          wisTimer();
        } else if (httpCode !== undefined && httpCode >= 400 && httpCode < 500 && !TIJDELIJK.has(httpCode)) {
          // De server weigert dit document; opnieuw proberen verandert daar niets aan. De server
          // antwoordde met een sessie: afgemeld vervalt, zodat er maar een melding tegelijk staat.
          fout.value = { status: httpCode };
          afgemeld.value = false;
          alleenLezen.value = false;
          status.value = "fout";
          wisTimer();
        } else {
          // Netwerk, 5xx, 408 of 429: later opnieuw; maar na een 401 alleen via `nuOpslaan()`.
          // In alleen-lezen weten we niet of het abonnement intussen terug is: geen timer, de status blijft.
          status.value = alleenLezen.value ? alleenLezenStatus() : offlineStatus();
          if (!afgemeld.value && !alleenLezen.value) plan(herprobeerMs);
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
      afgemeld.value = false;
      alleenLezen.value = false;
      status.value = "opgeslagen";
      return;
    }
    const id = store.projectId;
    const document = store.document;
    if (id !== null && document !== null) {
      schrijfConcept(id, { document, versie: store.versie, naam: store.naam, tijd: Date.now() });
    }
    // Een wijziging tijdens een conflict zonder lokale wijzigingen (de export): nu zijn er wel lokale wijzigingen.
    if (conflict.value && !conflict.value.lokaleWijzigingen) conflict.value = { ...conflict.value, lokaleWijzigingen: true };
    // Bij een conflict, een fout of afgemeld blijft het concept staan, maar gaat er niets naar de server.
    if (!automatisch()) return;
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
    afgemeld.value = false;
    alleenLezen.value = false;
    status.value = "opgeslagen";
    await wisConceptVeilig(id);
  }

  /**
   * Een kopie van de editor met zijn lokale wijzigingen. Zonder lokale wijzigingen (een conflict bij
   * de export) toont de editor een verouderde versie: dan wordt eerst de actuele versie van de server
   * geladen, en dat is de versie die gekopieerd wordt.
   */
  async function bewaarAlsKopie(): Promise<void> {
    while (lopend) await lopend;
    if (conflict.value?.lokaleWijzigingen === false) await laadServerversie();
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
      afgemeld.value = false;
      alleenLezen.value = false;
      await wisConceptVeilig(id);
      await naarProject(kopie.id);
    });
  }

  function meldConflict(huidigeVersie: number): void {
    conflict.value = { huidigeVersie, lokaleWijzigingen: onbewaard() };
    status.value = "conflict";
    wisTimer();
  }

  function stop(): void {
    if (gestopt) return;
    gestopt = true;
    stopWatch();
    wisTimer();
    // In-app navigeren binnen de vertraging mag de serverbewaring niet overslaan.
    if (conflict.value || fout.value || alleenLezen.value || store.document === null || !onbewaard()) return;
    // De generatie van nu: is er na het wachten opnieuw geladen (de volgende pagina, ook van
    // hetzelfde project), dan is die staat niet van ons en gaat er niets naar de server.
    const generatie = store.laadGeneratie;
    void (async () => {
      while (lopend) await lopend;
      if (store.laadGeneratie !== generatie) return;
      await nuOpslaan();
    })().catch(() => {});
  }

  if (getCurrentScope()) onScopeDispose(stop);

  async function wachtOpConcept(): Promise<boolean> {
    // Een wijziging van net bereikt de watcher pas bij de volgende tick.
    await nextTick();
    let ketting: Promise<unknown>;
    do {
      ketting = conceptKetting;
      await ketting;
    } while (ketting !== conceptKetting);
    return conceptGelukt;
  }

  return {
    status,
    conflict,
    fout,
    afgemeld,
    alleenLezen,
    nuOpslaan,
    laadServerversie,
    bewaarAlsKopie,
    meldConflict,
    stop,
    wachtOpConcept,
  };
}
