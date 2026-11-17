// Expliciete imports, geen Nuxt-auto-imports (ruling E1). Alles wat van buiten komt
// (store, API, navigatie) wordt als optie meegegeven, zodat dit zonder Nuxt te testen is.
import type { InstallatieDocument, Telling } from "@elentrik/model";
import { getCurrentScope, nextTick, onScopeDispose, ref, watch, type Ref } from "vue";
import {
  bewaarConcept as bewaarConceptEcht,
  maakInstantieId,
  wisConcept as wisConceptEcht,
  type Concept,
  type ConceptPlek,
} from "./concepten";
import { PROJECT_ALLEEN_LEZEN, PROJECT_LIMIET } from "../../shared/abonnement";
import type { Foutcode } from "../../shared/foutcodes";
import { bekendeFoutcode } from "../fouten";
import { foutCode } from "../sessie/fouten";
import { isNieuweVersieFout } from "../versie/regels";
import { metNieuweBestandIds, planBestandIds } from "../editor/kopie";
import {
  ConflictFout,
  httpStatus,
  type BewaarInvoer,
  type NieuwProjectUitDocument,
  type Project,
} from "./useProjectenApi";

/**
 * - `opgeslagen`: de server heeft de laatste wijziging.
 * - `bezig`: er is een wijziging die nog naar de server moet (wacht op de vertraging) of ze is onderweg.
 * - `lokaal`: bewaren op de server lukt niet (netwerk, 5xx, 408 of 429), maar het concept staat in IndexedDB.
 *   Er volgt een nieuwe poging. Na een 401 (de sessie is verlopen) ook `lokaal`, maar met `afgemeld`:
 *   dan volgt geen nieuwe poging tot `nuOpslaan()`, na opnieuw inloggen. Ook na een 426
 *   `NIEUWE_VERSIE_VEREIST` (de app is verouderd) is de status `lokaal`, met `versieVerouderd`: dan
 *   volgt evenmin een nieuwe poging, tot de pagina herlaadt.
 * - `onbewaard`: idem, maar ook het concept kon niet bewaard worden: de wijziging bestaat alleen in het geheugen.
 * - `conflict`: de server heeft een nieuwere versie (409). Er wordt niets overschreven en niets meer verstuurd
 *   tot `laadServerversie` of `bewaarAlsKopie` het oplost.
 * - `fout`: de server weigert het document (4xx, bv. 422 of 404). Geen automatische nieuwe poging en geen
 *   autosave meer; `nuOpslaan()` probeert het handmatig opnieuw.
 * - `alleen-lezen`: de server antwoordde 402 `PROJECT_ALLEEN_LEZEN`: het project mag niet (meer) bewerkt worden.
 *   Het werk staat in het concept; zoals bij `afgemeld` volgt geen nieuwe poging tot `nuOpslaan()`.
 *   Lukt het concept niet (of niet meer), dan is de status `onbewaard`; `alleenLezen` blijft dan true.
 *   Een 402 `PROJECT_LIMIET` (het bewaren gaat over de gratis limiet) geeft `lokaal` (of `onbewaard`) met
 *   `limiet`: het werk staat in het concept, er volgt geen nieuwe poging met een timer, wel bij de volgende wijziging.
 * - `verwijderd`: de server antwoordde 404: het project is intussen elders verwijderd. Het werk staat in het
 *   concept; er volgt geen nieuwe poging. De editor biedt `bewaarAlsNieuwProject()` of terug naar de projecten
 *   aan. Verlaten vraagt nog altijd om bevestiging (het concept van een verwijderd project is nooit meer te
 *   openen), behalve via de uitdrukkelijke keuze "Terug naar de projecten". Lukt het concept niet (of niet
 *   meer), dan is de status `onbewaard`; `verwijderd` blijft dan true.
 */
export type AutosaveStatus =
  | "opgeslagen"
  | "bezig"
  | "lokaal"
  | "onbewaard"
  | "conflict"
  | "fout"
  | "alleen-lezen"
  | "verwijderd";

/** De leden van de editor-store die de autosave gebruikt. */
export type AutosaveStore = {
  document: InstallatieDocument | null;
  projectId: string | null;
  naam: string;
  versie: number;
  gewijzigdSindsOpslaan: number;
  /** Stijgt bij elke `laad`; de store houdt hem bij (ruling E11). */
  readonly laadGeneratie: number;
  /** Het limietvenster van de editor: een 402 `PROJECT_LIMIET` zet hier de telling van de server. */
  limietGeweigerd?: Telling | null;
  laad(project: { id: string; naam: string; versie: number; document: InstallatieDocument }): void;
};

export type AutosaveOpties = {
  store: AutosaveStore;
  bewaar: (id: string, versie: number, invoer: BewaarInvoer) => Promise<{ versie: number }>;
  haal: (id: string) => Promise<Project>;
  /**
   * Dupliceert op de server. `bestandIds`: de planbestanden van het lokale document; het antwoord
   * geeft voor de gekopieerde bestanden oud -> nieuw (`bestandIds`).
   */
  dupliceer?: (id: string, bestandIds?: string[]) => Promise<{ id: string; bestandIds?: Record<string, string> }>;
  /**
   * Maakt op de server een nieuw project uit het lokale document (het project is verwijderd). De server
   * kopieert de planbestanden van de organisatie mee en geeft oud -> nieuw terug (`bestandIds`), samen met
   * het document-id en de versie van het nieuwe project.
   */
  maakNieuw?: (invoer: { naam: string; document: InstallatieDocument }) => Promise<NieuwProjectUitDocument>;
  modus?: 'klant' | 'admin';
  /** Navigeert naar een ander project (de kopie of het nieuwe project). */
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
  /** Gezet bij status `fout`: de HTTP-status waarmee de server het bewaren weigerde, en zijn foutcode als die bekend is. */
  fout: Ref<{ status: number; code?: Foutcode } | null>;
  /**
   * De server antwoordde 401: de sessie is verlopen. Het werk staat in het concept; er gaat
   * niets meer naar de server tot `nuOpslaan()`. Een geslaagd bewaar zet dit terug op false.
   */
  afgemeld: Ref<boolean>;
  /**
   * De server antwoordde 426 `NIEUWE_VERSIE_VEREIST`: deze versie van de app mag niet meer schrijven. Het
   * werk staat in het concept; er gaat niets meer naar de server tot `nuOpslaan()`, en na het herladen
   * van de pagina wordt het concept aangeboden. Een geslaagd bewaar zet dit terug op false.
   */
  versieVerouderd: Ref<boolean>;
  /**
   * De server antwoordde 402 `PROJECT_ALLEEN_LEZEN`. Het werk staat in het concept; er gaat niets
   * meer naar de server tot `nuOpslaan()` (na een vrijgave of een abonnement). Een geslaagd bewaar zet
   * dit terug op false.
   */
  alleenLezen: Ref<boolean>;
  /**
   * De server antwoordde 402 `PROJECT_LIMIET`: het bewaren ging over de gratis limiet. Het werk staat in het
   * concept en `store.limietGeweigerd` opent het limietvenster. De editor blijft bewerkbaar: de volgende
   * wijziging (bv. een kring minder) probeert opnieuw. Een geslaagd bewaar zet dit terug op false.
   */
  limiet: Ref<boolean>;
  /**
   * De server antwoordde 404: het project is verwijderd (elders). Het werk staat in het concept; er gaat
   * niets meer naar de server. `bewaarAlsNieuwProject` maakt er een nieuw project van.
   */
  verwijderd: Ref<boolean>;
  nuOpslaan(): Promise<void>;
  laadServerversie(): Promise<void>;
  bewaarAlsKopie(): Promise<void>;
  /**
   * Na `verwijderd`: maakt van het lokale document een nieuw project (de planbestanden van de organisatie
   * gaan mee), wist het concept van het verwijderde project en navigeert naar het nieuwe. Mislukt het, dan
   * blijft alles zoals het was (status `verwijderd`, het concept blijft) en gooit dit de fout.
   */
  bewaarAlsNieuwProject(): Promise<void>;
  /**
   * Een 409 van buiten het bewaren (de export): de server heeft een andere versie dan de editor.
   * Hetzelfde conflictpad als een 409 bij het bewaren; `laadServerversie` of `bewaarAlsKopie` lost het op.
   */
  meldConflict(huidigeVersie: number): void;
  /**
   * Een 404 van buiten het bewaren (het uploaden van een plan): het project is elders verwijderd. Dezelfde
   * toestand als een 404 bij het bewaren: status `verwijderd`, het werk in het concept, geen nieuwe poging.
   */
  meldVerwijderd(): void;
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

/** Het project bestaat niet (meer): verwijderd, of niet van jou. */
const NIET_GEVONDEN = 404;

/** Het project mag niet (meer) bewerkt worden of gaat over de limiet; samen met een code van de projecttoegang. */
const BETALING_VEREIST = 402;

/** De telling uit een 402 `PROJECT_LIMIET` (`data.telling`); zonder bruikbare telling nullen. */
function limietTelling(fout: unknown): Telling {
  const data = (fout as { data?: { data?: { telling?: unknown } } } | null)?.data?.data?.telling as Partial<Telling> | undefined;
  const getal = (waarde: unknown) => (typeof waarde === "number" ? waarde : 0);
  return { kringen: getal(data?.kringen), situatieschemas: getal(data?.situatieschemas) };
}

/**
 * Voor `beforeunload` en het navigeren in de app: zolang niet alles op de server staat, vragen we
 * of de gebruiker de pagina echt wil verlaten.
 */
export function waarschuwBijVerlaten(status: AutosaveStatus): boolean {
  // Ook bij `verwijderd`: het concept van een verwijderd project kan nooit meer geopend worden. Alleen
  // de uitdrukkelijke keuze "Terug naar de projecten" slaat de vraag over (dat beslist de pagina).
  return status !== "opgeslagen";
}

/**
 * Automatisch opslaan: een wijziging bewaart meteen een concept in IndexedDB en na `vertragingMs`
 * zonder nieuwe wijziging het project op de server (`PUT` met `If-Match`).
 *
 * Bekende beperking in klantmodus: gaat het antwoord verloren nadat de server het document wel bewaarde, dan
 * stuurt de nieuwe poging de oude versie mee en volgt een 409 op onze eigen wijziging. De gebruiker
 * kiest dan in het conflictscherm; er gaat niets verloren.
 */
export function useAutosave(opties: AutosaveOpties): Autosave {
  const { store, bewaar, haal, dupliceer, maakNieuw, naarProject } = opties;
  const vertragingMs = opties.vertragingMs ?? 2000;
  const herprobeerMs = opties.herprobeerMs ?? 10_000;
  const concepten = opties.concepten ?? { bewaarConcept: bewaarConceptEcht, wisConcept: wisConceptEcht };
  // Elk venster schrijft en wist alleen zijn eigen concept.
  const instantieId = opties.instantieId ?? maakInstantieId();
  const { gebruikerId } = opties;
  // Nooit een concept zonder eigenaar: zonder gebruiker geen autosave.
  if (!gebruikerId) throw new Error("De autosave heeft een ingelogde gebruiker nodig (gebruikerId).");
  const plekVan = (projectId: string): ConceptPlek => ({ gebruikerId, projectId, instantieId, ...(opties.modus ? { modus: opties.modus } : {}) });

  const status = ref<AutosaveStatus>("opgeslagen");
  const conflict = ref<Conflict | null>(null);
  const fout = ref<{ status: number; code?: Foutcode } | null>(null);
  const afgemeld = ref(false);
  const versieVerouderd = ref(false);
  const alleenLezen = ref(false);
  const limiet = ref(false);
  /** De teller van de inhoud die 402 `PROJECT_LIMIET` kreeg: die opnieuw sturen geeft hetzelfde antwoord. */
  let limietTeller: number | null = null;
  const verwijderd = ref(false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Het bewaar (of de kopie) dat nu loopt; er is er nooit meer dan één tegelijk. */
  let lopend: Promise<void> | undefined;
  /** De waarde van `gewijzigdSindsOpslaan` die al naar de server is. */
  let bewaardeTeller = store.gewijzigdSindsOpslaan;
  // Alleen support heeft serverontvangsten voor idempotente retries. Bevestig een
  // onzekere momentopname voordat latere wijzigingen haar versie mogen gebruiken.
  let onzekereBewaring: { id: string; generatie: number; teller: number; versie: number; invoer: BewaarInvoer } | undefined;
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

  /** Zoals `alleenLezenStatus`, voor een verwijderd project. */
  function verwijderdStatus(): AutosaveStatus {
    return conceptGelukt ? "verwijderd" : "onbewaard";
  }

  function werkOfflineStatusBij(): void {
    if (verwijderd.value) {
      if (status.value === "verwijderd" || status.value === "onbewaard") status.value = verwijderdStatus();
      return;
    }
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

  /**
   * Bewaart de autosave vanzelf? Niet bij een conflict, een fout, na een 401 (afgemeld), een 426
   * (versieVerouderd), een 402 (alleen-lezen) of een 404 (verwijderd).
   */
  function automatisch(): boolean {
    return (
      !conflict.value &&
      !fout.value &&
      !afgemeld.value &&
      !versieVerouderd.value &&
      !alleenLezen.value &&
      !verwijderd.value
    );
  }

  /**
   * Wijzigingen die tijdens een bewaar binnenkwamen krijgen hier hun eigen, gedebouncete bewaar. Niet
   * voor de inhoud die net over de limiet ging: pas een nieuwe wijziging probeert opnieuw.
   */
  function herplan(): void {
    const zelfdeAlsLimiet = limiet.value && store.gewijzigdSindsOpslaan === limietTeller;
    if (!gestopt && automatisch() && onbewaard() && !zelfdeAlsLimiet && timer === undefined) plan(vertragingMs);
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

  /**
   * De toestand `verwijderd`, voor een 404 bij het bewaren en voor `meldVerwijderd`: het werk staat in het
   * concept (nog eens schrijven, voor het geval een eerdere schrijfactie mislukte) en er volgt geen nieuwe
   * poging; de gebruiker kiest een nieuw project of terug naar de projecten.
   */
  function zetVerwijderd(id: string): void {
    verwijderd.value = true;
    afgemeld.value = false;
    versieVerouderd.value = false;
    alleenLezen.value = false;
    limiet.value = false;
    status.value = verwijderdStatus();
    const huidig = store.document;
    if (huidig !== null) {
      schrijfConcept(id, { document: huidig, versie: store.versie, naam: store.naam, tijd: Date.now() });
    }
    wisTimer();
  }

  /** Bewaart de huidige staat, tenzij er een conflict of fout is of al een bewaar loopt. */
  async function probeer(): Promise<void> {
    if (conflict.value || fout.value || verwijderd.value || lopend) return;
    const id = store.projectId;
    const document = store.document;
    if (id === null || document === null) return;
    const generatie = store.laadGeneratie;
    const poging = opties.modus === 'admin' && onzekereBewaring?.id === id && onzekereBewaring.generatie === generatie
      ? onzekereBewaring
      : { id, generatie, teller: store.gewijzigdSindsOpslaan, versie: store.versie,
          invoer: opties.modus === 'admin'
            ? JSON.parse(JSON.stringify({ naam: store.naam, document })) as BewaarInvoer
            : { naam: store.naam, document } };
    const { teller } = poging;

    wisTimer();
    // Na een mislukte poging blijft `lokaal` of `onbewaard` staan tot een bewaar slaagt.
    if (status.value !== "lokaal" && status.value !== "onbewaard") status.value = "bezig";
    await startLopend(async () => {
      try {
        const resultaat = await bewaar(id, poging.versie, poging.invoer);
        if (onzekereBewaring === poging) onzekereBewaring = undefined;
        // Intussen opnieuw geladen (een ander project, of hetzelfde in een nieuwe pagina):
        // die staat is niet meer van ons.
        if (store.laadGeneratie !== generatie) return;
        store.versie = resultaat.versie;
        bewaardeTeller = teller;
        afgemeld.value = false;
        versieVerouderd.value = false;
        alleenLezen.value = false;
        limiet.value = false;
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
        if (opties.modus === 'admin') {
          onzekereBewaring = !(e instanceof ConflictFout) && (httpCode === undefined || httpCode >= 500 || TIJDELIJK.has(httpCode)) ? poging : undefined;
        }
        if (e instanceof ConflictFout) {
          conflict.value = { huidigeVersie: e.huidigeVersie, lokaleWijzigingen: true };
          status.value = "conflict";
          wisTimer();
        } else if (httpCode === AFGEMELD) {
          // De sessie is verlopen: het werk staat in het concept. Opnieuw proberen heeft pas zin
          // na opnieuw inloggen, dus geen nieuwe poging tot `nuOpslaan()`.
          afgemeld.value = true;
          versieVerouderd.value = false;
          alleenLezen.value = false;
          limiet.value = false;
          status.value = offlineStatus();
          wisTimer();
        } else if (isNieuweVersieFout(e)) {
          // De app is verouderd: de server weigert elke schrijfactie van deze versie. Het werk staat in
          // het concept; opnieuw proberen heeft pas zin na het herladen, dus geen nieuwe poging tot
          // `nuOpslaan()`. Er staat maar een melding tegelijk.
          versieVerouderd.value = true;
          afgemeld.value = false;
          alleenLezen.value = false;
          limiet.value = false;
          status.value = offlineStatus();
          wisTimer();
        } else if (httpCode === BETALING_VEREIST && foutCode(e) === PROJECT_ALLEEN_LEZEN) {
          // Het project mag niet meer bewerkt worden: het werk staat in het concept. Opnieuw proberen
          // heeft pas zin na een vrijgave of een abonnement, dus geen nieuwe poging tot `nuOpslaan()`.
          alleenLezen.value = true;
          limiet.value = false;
          afgemeld.value = false;
          versieVerouderd.value = false;
          status.value = alleenLezenStatus();
          wisTimer();
        } else if (httpCode === BETALING_VEREIST && foutCode(e) === PROJECT_LIMIET) {
          // Over de gratis limiet (bv. een ander venster was sneller): het werk staat in het concept en
          // het limietvenster gaat open, één keer tot een bewaar weer lukt. Geen timer: dezelfde inhoud
          // geeft hetzelfde antwoord; de volgende wijziging probeert opnieuw.
          if (!limiet.value && "limietGeweigerd" in store) store.limietGeweigerd = limietTelling(e);
          limiet.value = true;
          limietTeller = teller;
          afgemeld.value = false;
          versieVerouderd.value = false;
          status.value = offlineStatus();
          wisTimer();
        } else if (httpCode === NIET_GEVONDEN) {
          // Het project is intussen verwijderd: opnieuw proberen verandert daar niets aan. Het werk
          // staat in het concept (nog eens schrijven, voor het geval een eerdere schrijfactie mislukte);
          // de gebruiker kiest: een nieuw project maken of terug naar de projecten.
          zetVerwijderd(id);
        } else if (httpCode !== undefined && httpCode >= 400 && httpCode < 500 && !TIJDELIJK.has(httpCode)) {
          // De server weigert dit document; opnieuw proberen verandert daar niets aan. De server
          // antwoordde met een sessie: afgemeld vervalt, zodat er maar een melding tegelijk staat.
          const code = bekendeFoutcode(e);
          fout.value = code === undefined ? { status: httpCode } : { status: httpCode, code };
          afgemeld.value = false;
          versieVerouderd.value = false;
          alleenLezen.value = false;
          limiet.value = false;
          status.value = "fout";
          wisTimer();
        } else {
          // Netwerk, 5xx, 408 of 429: later opnieuw; maar na een 401 alleen via `nuOpslaan()`.
          // In alleen-lezen weten we niet of het abonnement intussen terug is: geen timer, de status blijft.
          status.value = alleenLezen.value ? alleenLezenStatus() : offlineStatus();
          if (!afgemeld.value && !versieVerouderd.value && !alleenLezen.value) plan(herprobeerMs);
        }
      }
    });
  }

  function bijWijziging(teller: number): void {
    if (teller === 0) {
      // `store.laad` zet de teller terug: een vers project, niets om te bewaren.
      bewaardeTeller = 0;
      onzekereBewaring = undefined;
      conceptGelukt = true;
      wisTimer();
      conflict.value = null;
      fout.value = null;
      afgemeld.value = false;
      versieVerouderd.value = false;
      alleenLezen.value = false;
      limiet.value = false;
      verwijderd.value = false;
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
    // Bij een conflict, een fout, afgemeld of versieVerouderd blijft het concept staan, maar gaat er niets naar de server.
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
    if (conflict.value || verwijderd.value || !onbewaard()) return;
    fout.value = null;
    do {
      await probeer();
      // Een bevestigde retry kan oudere inhoud betreffen. Afronden mag pas na
      // de actuele inhoud; bij een nieuwe fout blijft die inhoud lokaal staan.
    } while (opties.modus === 'admin' && status.value === 'bezig' && onbewaard() && automatisch());
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
    versieVerouderd.value = false;
    alleenLezen.value = false;
    limiet.value = false;
    verwijderd.value = false;
    status.value = "opgeslagen";
    await wisConceptVeilig(id);
  }

  /**
   * Zonder lokale wijzigingen (een conflict bij de export) is de kopie gewoon een server-side
   * duplicaat van de actuele serverversie, met eigen planbestanden: daar wordt niets over geschreven
   * (de plan-id's van het lokale document gaan toch mee, voor een wijziging tijdens het dupliceren).
   * Met lokale wijzigingen wordt het lokale document in de kopie bewaard; de planbestanden daarvan
   * staan dan op hun nieuwe id's uit het duplicaat.
   */
  async function bewaarAlsKopie(): Promise<void> {
    if (!dupliceer) return;
    while (lopend) await lopend;
    const id = store.projectId;
    if (id === null || store.document === null) return;
    wisTimer();
    const zonderLokaal = conflict.value?.lokaleWijzigingen === false;
    await startLopend(async () => {
      // Altijd de planbestanden van het lokale document, uit de staat van vlak vóór het dupliceren. Restrisico:
      // een planupload die tijdens het dupliceren klaar komt, zit niet in de mapping; het bewaren in de kopie
      // krijgt dan 422 PLANBESTAND_ONBEKEND.
      const kopie = await dupliceer(id, planBestandIds(store.document!));
      // Kwam er tijdens het dupliceren toch een wijziging bij, dan gaat die mee naar de kopie.
      if (!zonderLokaal || onbewaard()) {
        const nieuweIds = kopie.bestandIds ?? {};
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
            document: { ...metNieuweBestandIds(document, nieuweIds), id: kopieDocId },
          });
          versie = resultaat.versie;
          // Kwam er tijdens het bewaar nog een wijziging bij, dan gaat die ook naar de kopie.
        } while (store.gewijzigdSindsOpslaan !== teller);
        bewaardeTeller = store.gewijzigdSindsOpslaan;
      }
      afgemeld.value = false;
      versieVerouderd.value = false;
      alleenLezen.value = false;
      limiet.value = false;
      await wisConceptVeilig(id);
      await naarProject(kopie.id);
    });
  }

  /**
   * Een nieuw project uit het lokale document. De server geeft de nieuwe id's van de planbestanden terug;
   * kwam er tijdens het maken nog een wijziging bij, dan gaat die met die id's ook naar het nieuwe project.
   * Pas daarna gaat het concept van het verwijderde project weg en volgt de navigatie.
   */
  async function bewaarAlsNieuwProject(): Promise<void> {
    if (!maakNieuw) return;
    while (lopend) await lopend;
    const id = store.projectId;
    if (id === null || store.document === null) return;
    wisTimer();
    await startLopend(async () => {
      let teller = store.gewijzigdSindsOpslaan;
      const nieuw = await maakNieuw({ naam: store.naam, document: store.document! });
      let versie = nieuw.versie;
      // Het nieuwe project bestaat: vanaf hier nooit een tweede maken. Lukt het bewaren van een latere
      // wijziging niet, dan gaat die naar het concept van het nieuwe project (de editor daar biedt het
      // aan) en navigeren we toch.
      const naarNieuw = (document: InstallatieDocument): InstallatieDocument => ({
        ...metNieuweBestandIds(document, nieuw.bestandIds),
        id: nieuw.documentId,
      });
      try {
        while (store.gewijzigdSindsOpslaan !== teller) {
          teller = store.gewijzigdSindsOpslaan;
          const document = store.document;
          if (document === null) break;
          const resultaat = await bewaar(nieuw.id, versie, { naam: store.naam, document: naarNieuw(document) });
          versie = resultaat.versie;
        }
        bewaardeTeller = store.gewijzigdSindsOpslaan;
      } catch {
        const document = store.document;
        if (document !== null) {
          schrijfConcept(nieuw.id, { document: naarNieuw(document), versie, naam: store.naam, tijd: Date.now() });
        }
      }
      await wisConceptVeilig(id);
      await naarProject(nieuw.id);
    });
  }

  function meldVerwijderd(): void {
    const id = store.projectId;
    if (id === null) return;
    // Een conflict of fout hoort bij een project dat er nog was: er staat maar één melding tegelijk.
    conflict.value = null;
    fout.value = null;
    zetVerwijderd(id);
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
    if (conflict.value || fout.value || alleenLezen.value || verwijderd.value || store.document === null || !onbewaard()) {
      return;
    }
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
    versieVerouderd,
    alleenLezen,
    limiet,
    verwijderd,
    nuOpslaan,
    laadServerversie,
    bewaarAlsKopie,
    bewaarAlsNieuwProject,
    meldConflict,
    meldVerwijderd,
    stop,
    wachtOpConcept,
  };
}
