// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { analyseer, controleer, haalRegelset, type Analyse, type Bevinding } from "@elentrik/arei";
import { STANDAARD_PAPIER_A4, opmaak as legOp, type SchemaOpmaak } from "@elentrik/layout";
import {
  DocumentFout,
  magToevoegen,
  pasPatchesToe,
  verwijder,
  verwijderAfwijking,
  verwijderEnkel,
  voegAfwijkingToe,
  voegOnderdeelToe,
  voegSjabloonToe as voegSjabloonToeAanDoc,
  wijzigEigenschappen,
  wijzigProject,
  type Aanknoping,
  type Adres,
  type InstallatieDocument,
  type Node,
  type NodeId,
  type OperatieResultaat,
  type Onderdeel,
  type Patch,
  type ProjectWijziging,
  type Stroomtype,
  type Toestelsoort,
} from "@elentrik/model";
import { schemaStripSvg } from "@elentrik/render";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type { Richting } from "../composables/sneltoetsen";
import { zelfdeAdres } from "../editor/adres";
import { samengevoegd } from "../editor/resultaten";
import { useSessieStore } from "./sessie";

/** Eén undo-stap. Stappen met dezelfde `groep` na elkaar worden samengevoegd. */
export type Stap = { patches: Patch[]; inversePatches: Patch[]; groep?: string };

/** Maximaal aantal undo-stappen; daarboven valt de oudste weg. */
export const MAX_STAPPEN = 200;

/** De tabbladen van de editor. */
export type Tabblad = "eendraadschema" | "situatieschema" | "kringenlijst";

export type TeLadenProject = { id: string; naam: string; versie: number; document: InstallatieDocument };

/** De datum van vandaag als `JJJJ-MM-DD`, in lokale tijd (zoals `meta.datum`). */
function vandaag(): string {
  const nu = new Date();
  const maand = String(nu.getMonth() + 1).padStart(2, "0");
  const dag = String(nu.getDate()).padStart(2, "0");
  return `${nu.getFullYear()}-${maand}-${dag}`;
}

/** Het eerste verdeelbord in pre-order. */
function eersteVerdeelbord(doc: InstallatieDocument): NodeId | undefined {
  const stapel: NodeId[] = [doc.rootId];
  while (stapel.length > 0) {
    const node = doc.nodes[stapel.pop()!];
    if (!node) continue;
    if (node.type === "verdeelbord") return node.id;
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push(node.kinderen[i]!);
  }
  return undefined;
}

export const useEditorStore = defineStore("editor", () => {
  // De documenten zijn diep bevroren door immer: een shallowRef, zodat Vue er niets aan wrapt.
  const document = shallowRef<InstallatieDocument | null>(null);
  const projectId = ref<string | null>(null);
  const naam = ref("");
  const versie = ref(0);
  /** De laatst geklikte node staat achteraan. */
  const selectie = ref<NodeId[]>([]);
  const onderdeel = ref<Onderdeel>("contactdoos");
  const toestelsoort = ref<Toestelsoort>("wasmachine");
  const tabblad = ref<Tabblad>("eendraadschema");
  // Elke wijziging vervangt de array, zodat een shallowRef volstaat.
  const terug = shallowRef<Stap[]>([]);
  const vooruit = shallowRef<Stap[]>([]);
  /** Telt elke wijziging (document of naam); de autosave vergelijkt hem met de laatst bewaarde waarde. */
  const gewijzigdSindsOpslaan = ref(0);
  /**
   * Stijgt bij elke `laad`, ook van hetzelfde project. Een bewaar dat vóór een `laad` vertrok,
   * hoort bij een vorige generatie en mag de staat van daarna niet meer aanraken.
   */
  const laadGeneratie = ref(0);
  /** Na `sluitGroep` (of undo/redo) begint de volgende `pasToe` altijd een nieuwe stap. */
  let groepGesloten = true;

  const analyse = computed<Analyse | null>(() =>
    document.value ? analyseer(document.value) : null,
  );
  const bevindingen = computed<Bevinding[]>(() =>
    document.value ? controleer(document.value, haalRegelset(document.value.regelset)) : [],
  );
  const opmaak = computed<SchemaOpmaak | null>(() =>
    document.value && analyse.value ? legOp(document.value, STANDAARD_PAPIER_A4, analyse.value) : null,
  );
  const svg = computed(() => (opmaak.value ? schemaStripSvg(opmaak.value) : ""));
  const aantalFouten = computed(
    () => bevindingen.value.filter((b) => b.ernst === "fout" && !b.afgeweken).length,
  );
  const aantalWaarschuwingen = computed(
    () => bevindingen.value.filter((b) => b.ernst === "waarschuwing" && !b.afgeweken).length,
  );

  function vereisDocument(): InstallatieDocument {
    if (!document.value) throw new Error("Er is geen document geladen");
    return document.value;
  }

  /** Zet een nieuw document en haalt verdwenen nodes uit de selectie. */
  function zetDocument(doc: InstallatieDocument): void {
    document.value = doc;
    if (selectie.value.some((id) => !Object.hasOwn(doc.nodes, id))) {
      selectie.value = selectie.value.filter((id) => Object.hasOwn(doc.nodes, id));
    }
    gewijzigdSindsOpslaan.value++;
  }

  /** Telt een wijziging die buiten de store is gebeurd (bv. een geladen concept), zodat de autosave ze bewaart. */
  function markeerGewijzigd(): void {
    gewijzigdSindsOpslaan.value++;
  }

  /**
   * De gebruiker van dit editorvenster, voor `door` van een afwijking; geen state. `nieuwVenster`
   * wist hem, de eerste `laad` daarna onthoudt de ingelogde gebruiker (`onthoudAuteur`).
   */
  let vensterAuteur: { id: string; naam: string } | null = null;

  function laad(project: TeLadenProject): void {
    document.value = project.document;
    projectId.value = project.id;
    naam.value = project.naam;
    versie.value = project.versie;
    selectie.value = [];
    tabblad.value = "eendraadschema";
    terug.value = [];
    vooruit.value = [];
    gewijzigdSindsOpslaan.value = 0;
    laadGeneratie.value++;
    groepGesloten = true;
    onthoudAuteur();
  }

  /** Een nieuw editorvenster (pagina): de volgende `laad` bepaalt wie er werkt. */
  function nieuwVenster(): void {
    vensterAuteur = null;
  }

  /**
   * Zet het resultaat van een operatie als nieuw document en leegt `vooruit`. Heeft de
   * laatste stap dezelfde `groep`, dan komen de patches in die stap; anders volgt een
   * nieuwe stap. Een resultaat zonder patches verandert niets.
   */
  function pasToe(resultaat: OperatieResultaat, groep?: string): void {
    vereisDocument();
    if (resultaat.patches.length === 0) return;

    const laatste = terug.value.at(-1);
    if (!groepGesloten && groep !== undefined && laatste?.groep === groep) {
      const stap: Stap = {
        patches: [...laatste.patches, ...resultaat.patches],
        inversePatches: [...resultaat.inversePatches, ...laatste.inversePatches],
        groep,
      };
      terug.value = [...terug.value.slice(0, -1), stap];
    } else {
      const stap: Stap = groep === undefined
        ? { patches: resultaat.patches, inversePatches: resultaat.inversePatches }
        : { patches: resultaat.patches, inversePatches: resultaat.inversePatches, groep };
      terug.value = [...terug.value, stap].slice(-MAX_STAPPEN);
    }
    groepGesloten = false;
    vooruit.value = [];
    zetDocument(resultaat.doc);
  }

  function sluitGroep(): void {
    groepGesloten = true;
  }

  function ongedaanMaken(): void {
    const stap = terug.value.at(-1);
    if (!document.value || !stap) return;
    const doc = pasPatchesToe(document.value, stap.inversePatches);
    terug.value = terug.value.slice(0, -1);
    vooruit.value = [...vooruit.value, stap];
    groepGesloten = true;
    zetDocument(doc);
  }

  function opnieuw(): void {
    const stap = vooruit.value.at(-1);
    if (!document.value || !stap) return;
    const doc = pasPatchesToe(document.value, stap.patches);
    vooruit.value = vooruit.value.slice(0, -1);
    terug.value = [...terug.value, stap].slice(-MAX_STAPPEN);
    groepGesloten = true;
    zetDocument(doc);
  }

  /** Voegt `onderdeel` toe op de aanknoping en selecteert de bovenste nieuwe node. */
  function voegToe(aanknoping: Aanknoping): void {
    const r = voegOnderdeelToe(
      vereisDocument(),
      { soort: aanknoping.soort, nodeId: aanknoping.nodeId },
      onderdeel.value,
      toestelsoort.value,
    );
    pasToe(r);
    selectie.value = [r.ids[r.ids.length - 1]!];
  }

  /** Op het geselecteerde bord of differentieel, anders op het eerste verdeelbord in pre-order. */
  function voegSjabloonToe(sjabloonId: string): void {
    const doc = vereisDocument();
    const geselecteerd = selectie.value.find((id) => {
      const type = doc.nodes[id]?.type;
      return type === "verdeelbord" || type === "differentieel";
    });
    const doel = geselecteerd ?? eersteVerdeelbord(doc);
    if (doel === undefined) throw new DocumentFout("ONBEKENDE_NODE", { reden: "geen verdeelbord" });
    pasToe(voegSjabloonToeAanDoc(doc, doel, sjabloonId));
  }

  /**
   * Wijzigt één veld op alle nodes in één undo-stap. Opeenvolgende wijzigingen van
   * hetzelfde veld op dezelfde nodes vallen samen tot `sluitGroep`.
   */
  function wijzigVeld(nodeIds: NodeId[], sleutel: string, waarde: unknown): void {
    const doc = vereisDocument();
    if (nodeIds.length === 0) return;
    const resultaten: OperatieResultaat[] = [];
    let huidig = doc;
    for (const id of nodeIds) {
      const r = wijzigEigenschappen(huidig, id, { [sleutel]: waarde });
      resultaten.push(r);
      huidig = r.doc;
    }
    pasToe(samengevoegd(doc, resultaten), `veld:${sleutel}:${nodeIds.join(",")}`);
  }

  /** De aanknoping voor Enter, vanaf de eerste geselecteerde node (spec §4.7.5). */
  function aanknopingBijSelectie(doc: InstallatieDocument): Aanknoping | undefined {
    const eerste = selectie.value[0];
    let node = eerste === undefined ? undefined : doc.nodes[eerste];
    if (!node) return undefined;
    const aanknopingen = opmaak.value?.strook.aanknopingen ?? [];
    const zoek = (soort: Aanknoping["soort"], nodeId: NodeId): Aanknoping | undefined => {
      const a = aanknopingen.find((k) => k.soort === soort && k.nodeId === nodeId);
      return a && { soort: a.soort, nodeId: a.nodeId };
    };

    if (node.type === "verdeelbord") return { soort: "rail-einde", nodeId: node.id };
    if (node.type === "differentieel") {
      const rail = zoek("rail-einde", node.id);
      if (rail) return rail;
    }
    while (node.kinderen.length > 0) {
      const kind: Node | undefined = doc.nodes[node.kinderen[0]!];
      if (!kind) return undefined;
      node = kind;
    }
    const einde = zoek("kring-einde", node.id);
    if (einde) return einde;
    // De keten loopt dood op een bord (bv. de teller in een nieuw project): dan op de rail.
    if (node.type === "verdeelbord" || node.type === "differentieel") return zoek("rail-einde", node.id);
    return undefined;
  }

  /** Enter: voegt `onderdeel` toe bij de selectie. Kan het niet, dan gebeurt er niets. */
  function voegToeBijSelectie(): void {
    const doc = document.value;
    if (!doc) return;
    const aanknoping = aanknopingBijSelectie(doc);
    if (!aanknoping || !magToevoegen(doc, aanknoping, onderdeel.value, toestelsoort.value)) return;
    voegToe(aanknoping);
  }

  /**
   * Verplaatst de selectie naar één node (pijltjestoetsen). "op" is het eerste kind (omhoog in
   * het schema), "neer" de ouder; beide stoppen bij het uiteinde. "links" en "rechts" gaan naar
   * de beveiliging van de vorige of volgende kring in `analyse.kringen`. Raakt de undo-stapel niet.
   */
  function navigeer(richting: Richting): void {
    const doc = document.value;
    const huidig = selectie.value.at(-1);
    if (!doc || huidig === undefined || !Object.hasOwn(doc.nodes, huidig)) return;

    let doel: NodeId | undefined;
    if (richting === "op") {
      doel = doc.nodes[huidig]?.kinderen[0];
    } else if (richting === "neer") {
      doel = Object.values(doc.nodes).find((n) => n.kinderen.includes(huidig))?.id;
    } else {
      const kringen = analyse.value?.kringen ?? [];
      const kringId = analyse.value?.kringVanNode[huidig];
      const index = kringen.findIndex((k) => k.id === kringId);
      if (index < 0) return;
      const verschuiving = richting === "links" ? -1 : 1;
      doel = kringen[Math.min(Math.max(index + verschuiving, 0), kringen.length - 1)]?.beveiligingId;
    }
    if (doel !== undefined) selectie.value = [doel];
  }

  /**
   * Verwijdert de geselecteerde nodes in één stap: elk apart (`verwijderEnkel`) of met
   * hun hele tak (`verwijder`). De aansluiting en de teller zijn nooit te verwijderen
   * (spec §4.7.2). Een `DocumentFout` gaat door naar de UI; de store blijft dan ongewijzigd.
   */
  function verwijderSelectie(heleTak: boolean): void {
    const doc = vereisDocument();
    for (const id of selectie.value) {
      const type = doc.nodes[id]?.type;
      if (type === "aansluiting" || type === "teller") {
        throw new DocumentFout("ROOT_NIET_WIJZIGBAAR", { nodeId: id, type });
      }
    }
    const resultaten: OperatieResultaat[] = [];
    let huidig = doc;
    for (const id of selectie.value) {
      // Bij een hele tak kan een node al met een eerder geselecteerde voorouder weg zijn.
      if (heleTak && !Object.hasOwn(huidig.nodes, id)) continue;
      const r = heleTak ? verwijder(huidig, id) : verwijderEnkel(huidig, id);
      resultaten.push(r);
      huidig = r.doc;
    }
    pasToe(samengevoegd(doc, resultaten));
  }

  /**
   * Onthoudt de ingelogde gebruiker als die van dit venster. Een andere gebruiker (die intussen in
   * een ander tabblad inlogde) overschrijft hem nooit; dezelfde gebruiker werkt zijn naam bij.
   */
  function onthoudAuteur(): void {
    const huidige = useSessieStore().gebruiker;
    if (!huidige) return;
    if (vensterAuteur === null || vensterAuteur.id === huidige.id) {
      vensterAuteur = { id: huidige.id, naam: huidige.naam };
    }
  }

  /**
   * De naam voor `door` van een afwijking: de gebruiker van dit venster. Is de sessie intussen
   * verlopen of van een ander, dan blijft het de naam van wie het venster opende.
   */
  function auteur(): string {
    onthoudAuteur();
    return vensterAuteur?.naam || useSessieStore().gebruiker?.naam || "onbekend";
  }

  function zetAfwijking(regelId: string, nodeId: NodeId, motivatie: string): void {
    pasToe(
      voegAfwijkingToe(vereisDocument(), {
        regelId,
        nodeId,
        motivatie,
        door: auteur(),
        datum: vandaag(),
      }),
    );
  }

  function wisAfwijking(regelId: string, nodeId: NodeId): void {
    pasToe(verwijderAfwijking(vereisDocument(), regelId, nodeId));
  }

  /**
   * De projectnaam valt buiten undo (spec §4.7.4); de rest gaat in één keer via `wijzigProject`,
   * dus als één undo-stap. Velden die al de gevraagde waarde hebben worden weggelaten, zodat een
   * ongewijzigde bewaring geen lege undo-stap geeft; `klantAdres: null` telt alleen als er een adres is.
   */
  function wijzigProjectgegevens(gegevens: {
    naam?: string;
    klantNaam?: string;
    stroomtype?: Stroomtype;
    klantAdres?: Adres | null;
    werfadres?: Adres;
    ean?: string;
    datum?: string;
  }): void {
    const doc = vereisDocument();
    const wijziging: ProjectWijziging = {};
    if (gegevens.klantNaam !== undefined) wijziging.klantNaam = gegevens.klantNaam;
    if (gegevens.stroomtype !== undefined) wijziging.stroomtype = gegevens.stroomtype;
    if (gegevens.klantAdres !== undefined) {
      const huidig = doc.meta.klant.adres;
      if (gegevens.klantAdres === null ? huidig !== undefined : !zelfdeAdres(gegevens.klantAdres, huidig)) {
        wijziging.klantAdres = gegevens.klantAdres;
      }
    }
    if (gegevens.werfadres !== undefined && !zelfdeAdres(gegevens.werfadres, doc.meta.werfadres)) {
      wijziging.werfadres = gegevens.werfadres;
    }
    if (gegevens.ean !== undefined && gegevens.ean !== (doc.meta.ean ?? "")) wijziging.ean = gegevens.ean;
    if (gegevens.datum !== undefined) wijziging.datum = gegevens.datum;
    // Eerst de operatie: gooit die, dan blijft ook de naam ongewijzigd.
    const r = wijzigProject(doc, wijziging);
    if (gegevens.naam !== undefined && gegevens.naam !== naam.value) {
      naam.value = gegevens.naam;
      gewijzigdSindsOpslaan.value++;
    }
    pasToe(r);
  }

  return {
    document,
    projectId,
    naam,
    versie,
    selectie,
    onderdeel,
    toestelsoort,
    tabblad,
    terug,
    vooruit,
    gewijzigdSindsOpslaan,
    laadGeneratie,
    analyse,
    bevindingen,
    opmaak,
    svg,
    aantalFouten,
    aantalWaarschuwingen,
    laad,
    markeerGewijzigd,
    pasToe,
    sluitGroep,
    ongedaanMaken,
    opnieuw,
    voegToe,
    voegSjabloonToe,
    wijzigVeld,
    voegToeBijSelectie,
    navigeer,
    verwijderSelectie,
    zetAfwijking,
    nieuwVenster,
    wisAfwijking,
    wijzigProjectgegevens,
  };
});
