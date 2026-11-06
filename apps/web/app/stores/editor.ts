// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { analyseer, controleer, haalRegelset, type Analyse, type Bevinding } from "@elentrik/arei";
import { STANDAARD_PAPIER_A4, opmaak as legOp, type SchemaOpmaak } from "@elentrik/layout";
import {
  DocumentFout,
  magToevoegen,
  magInvoegenVoor,
  voegInVoor,
  STANDAARD,
  migreer,
  legKringCodesVast as legCodesVast,
  behoudKringCodes as behoudCodes,
  bepaalKringCodes,
  hernummerKringen as hernummer,
  voorbeeldHernummering,
  voegLichtschakelingToe as voegLichtToe,
  type SjabloonDoel,
  type DifferentieelInstellingen,
  type LichtschakelingDoel,
  type LichtschakelingOpties,
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
  type Metingen,
  type Node,
  type NodeId,
  type OperatieResultaat,
  type Onderdeel,
  type Patch,
  type ProjectWijziging,
  type Stroomtype,
  type Toestelsoort,
  type Voorinstelling,
} from "@elentrik/model";
import { schemaStripSvg } from "@elentrik/render";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type { Richting } from "../composables/sneltoetsen";
import { zelfdeAdres } from "../editor/adres";
import { dupliceerMetVrijeCode } from "../editor/dupliceren";
import { bordVanNode } from "../editor/schema-navigatie";
import { samengevoegd } from "../editor/resultaten";
import type { Taal } from "../../shared/taal";
import { useSessieStore } from "./sessie";

/** Eén undo-stap. Stappen met dezelfde `groep` na elkaar worden samengevoegd. */
export type Stap = { patches: Patch[]; inversePatches: Patch[]; groep?: string };

/** Maximaal aantal undo-stappen; daarboven valt de oudste weg. */
export const MAX_STAPPEN = 200;

/** De tabbladen van de editor. */
export type Tabblad = "eendraadschema" | "situatieschema" | "kringenlijst" | "materiaallijst";

export type TeLadenProject = { id: string; naam: string; versie: number; document: InstallatieDocument };

/** De voorinstellingen bij het openen van de editor: toestel begint bij de wasmachine, de rest bij de standaard. */
export const BEGIN_VOORINSTELLINGEN: Readonly<Partial<Record<Onderdeel, Readonly<Voorinstelling>>>> = Object.freeze({
  toestel: Object.freeze({ soort: "wasmachine" }),
});

/** Een verse, losse kopie van de beginvoorinstellingen: de store muteert nooit de constante. */
function beginVoorinstellingen(): Partial<Record<Onderdeel, Voorinstelling>> {
  return { toestel: { ...BEGIN_VOORINSTELLINGEN.toestel } };
}

/** De datum van vandaag als `JJJJ-MM-DD`, in lokale tijd (zoals `meta.datum`). */
function vandaag(): string {
  const nu = new Date();
  const maand = String(nu.getMonth() + 1).padStart(2, "0");
  const dag = String(nu.getDate()).padStart(2, "0");
  return `${nu.getFullYear()}-${maand}-${dag}`;
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
  /** Per onderdeel de gekozen variant; een onderdeel zonder sleutel gebruikt de standaard van het model. */
  const voorinstellingen = ref<Partial<Record<Onderdeel, Voorinstelling>>>(beginVoorinstellingen());
  /** De voorinstelling van het gekozen onderdeel, of `{}`. */
  const voorinstelling = computed<Voorinstelling>(() => voorinstellingen.value[onderdeel.value] ?? {});
  /** Leest en schrijft `voorinstellingen.toestel.soort`. */
  const toestelsoort = computed<Toestelsoort>({
    get: () => (voorinstellingen.value.toestel?.soort ?? "wasmachine") as Toestelsoort,
    set: (soort) => {
      voorinstellingen.value = { ...voorinstellingen.value, toestel: { ...voorinstellingen.value.toestel, soort } };
    },
  });
  /** Open het symbolenvenster? Een weergavekeuze, ook open in alleen-lezen. */
  const symbolenOpen = ref(false);
  /** Open het sneltoetsenoverzicht (`?` of de knop Toetsenbordhulp)? Ook open in alleen-lezen. */
  const sneltoetsenOpen = ref(false);
  /**
   * Per bord het differentieel dat het laatst een nieuwe kring kreeg (bord-id → differentieel-id):
   * de standaardbestemming voor de volgende nieuwe kring als de selectie geen differentieel heeft.
   */
  const laatsteDifferentieel = ref<Record<NodeId, NodeId>>({});
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
  /**
   * Alleen-lezen: de organisatie van het project mag niet (meer) schrijven. Elke functie die het
   * document, de naam of de undo-stapel wijzigt doet dan niets; selecteren, navigeren en
   * exporteren blijven werken. De pagina zet dit (`zetAlleenLezen`), `laad` raakt het niet aan.
   */
  const alleenLezen = ref(false);
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
  /** De actieve infobevindingen, zoals het paneel Bevindingen ze toont: zonder de nog niet geplaatste punten. */
  const aantalInfo = computed(
    () => bevindingen.value.filter((b) => b.ernst === "info" && !b.afgeweken && b.regelId !== "arei.situatie.niet-geplaatst").length,
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

  function zetAlleenLezen(waarde: boolean): void {
    alleenLezen.value = waarde;
  }

  /** Telt een wijziging die buiten de store is gebeurd (bv. een geladen concept), zodat de autosave ze bewaart. */
  function markeerGewijzigd(): void {
    if (alleenLezen.value) return;
    gewijzigdSindsOpslaan.value++;
  }

  /**
   * De gebruiker van dit editorvenster, voor `door` van een afwijking; geen state. `nieuwVenster`
   * wist hem, de eerste `laad` daarna onthoudt de ingelogde gebruiker (`onthoudAuteur`).
   */
  let vensterAuteur: { id: string; naam: string } | null = null;

  function laad(project: TeLadenProject): void {
    document.value = migreer(project.document);
    projectId.value = project.id;
    naam.value = project.naam;
    versie.value = project.versie;
    selectie.value = [];
    symbolenOpen.value = false;
    sneltoetsenOpen.value = false;
    laatsteDifferentieel.value = {};
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
    if (alleenLezen.value) return;
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

  /** Past een toevoegende operatie toe en legt de codes van bestaande kringen vast, in één undo-stap. */
  function pasToeMetBehoud(resultaat: OperatieResultaat): void {
    if (alleenLezen.value) return;
    const voor = vereisDocument();
    pasToe(samengevoegd(voor, [resultaat, behoudCodes(voor, resultaat.doc)]));
  }

  function sluitGroep(): void {
    groepGesloten = true;
  }

  function ongedaanMaken(): void {
    if (alleenLezen.value) return;
    const stap = terug.value.at(-1);
    if (!document.value || !stap) return;
    const doc = pasPatchesToe(document.value, stap.inversePatches);
    terug.value = terug.value.slice(0, -1);
    vooruit.value = [...vooruit.value, stap];
    groepGesloten = true;
    zetDocument(doc);
  }

  function opnieuw(): void {
    if (alleenLezen.value) return;
    const stap = vooruit.value.at(-1);
    if (!document.value || !stap) return;
    const doc = pasPatchesToe(document.value, stap.patches);
    vooruit.value = vooruit.value.slice(0, -1);
    terug.value = [...terug.value, stap].slice(-MAX_STAPPEN);
    groepGesloten = true;
    zetDocument(doc);
  }

  /** Kiest `onderdeel` met de variant `v`; toevoegen gebruikt ze tot een andere keuze. */
  function kiesVariant(gekozen: Onderdeel, v: Voorinstelling): void {
    if (alleenLezen.value) return;
    onderdeel.value = gekozen;
    voorinstellingen.value = { ...voorinstellingen.value, [gekozen]: v };
  }

  /** Zet de voorinstelling van `gekozen` terug naar de beginwaarde (toestel: wasmachine, de rest: geen). */
  function zetStandaard(gekozen: Onderdeel): void {
    if (alleenLezen.value) return;
    const { [gekozen]: _weg, ...rest } = voorinstellingen.value;
    const begin = BEGIN_VOORINSTELLINGEN[gekozen];
    voorinstellingen.value = begin ? { ...rest, [gekozen]: { ...begin } } : rest;
  }

  /** Onthoudt `differentieelId` als laatst gebruikte bestemming voor een nieuwe kring in zijn bord. */
  function onthoudDifferentieel(doc: InstallatieDocument, differentieelId: NodeId): void {
    if (doc.nodes[differentieelId]?.type !== "differentieel") return;
    const bord = bordVanNode(doc, differentieelId);
    if (bord !== undefined) laatsteDifferentieel.value = { ...laatsteDifferentieel.value, [bord]: differentieelId };
  }

  /** Voegt `onderdeel` toe op de aanknoping en selecteert de bovenste nieuwe node. */
  function voegToe(aanknoping: Aanknoping): void {
    if (alleenLezen.value) return;
    const doc = vereisDocument();
    const r = voegOnderdeelToe(
      doc,
      { soort: aanknoping.soort, nodeId: aanknoping.nodeId },
      onderdeel.value,
      voorinstelling.value,
    );
    pasToeMetBehoud(r);
    if (aanknoping.soort === "rail-einde") onthoudDifferentieel(doc, aanknoping.nodeId);
    selectie.value = [r.ids[r.ids.length - 1]!];
  }

  const kanVoorSelectieInvoegen = computed(() => {
    const doc = document.value;
    const id = selectie.value[0];
    const tool = onderdeel.value;
    return !alleenLezen.value && !!doc && selectie.value.length === 1 && id !== undefined &&
      (tool === "leiding" || tool === "differentieel") && magInvoegenVoor(doc, id, STANDAARD[tool]);
  });
  function voegVoorSelectieIn(): void {
    if (!kanVoorSelectieInvoegen.value) return;
    const r = voegInVoor(vereisDocument(), selectie.value[0]!, STANDAARD[onderdeel.value]);
    pasToeMetBehoud(r); selectie.value = [r.id];
  }

  const kanAftakkingToevoegen = computed(() => {
    const doc = document.value;
    const id = selectie.value[0];
    return !alleenLezen.value && !!doc && selectie.value.length === 1 && id !== undefined &&
      magToevoegen(doc, { soort: "aftakking", nodeId: id }, onderdeel.value, voorinstelling.value);
  });

  /** Nieuwe horizontale reeks op de geselecteerde leiding; uitbreiden gebeurt via het rechteruiteinde. */
  function voegAftakkingToeBijSelectie(): void {
    if (!kanAftakkingToevoegen.value) return;
    voegToe({ soort: "aftakking", nodeId: selectie.value[0]! });
  }

  /** Expliciet doel uit de bevestigingsdialoog; geen automatische bordkeuze. */
  function voegSjabloonToe(sjabloonId: string, doel?: SjabloonDoel, instellingen?: DifferentieelInstellingen): void {
    if (alleenLezen.value) return;
    if (!doel) throw new DocumentFout("NIET_TOEGELATEN_KIND", { reden: "kies een sjabloonbestemming" });
    const doc = vereisDocument();
    const r = voegSjabloonToeAanDoc(doc, doel, sjabloonId, instellingen);
    pasToeMetBehoud(r); selectie.value = [r.id];
    if (doel.soort === "bestaande-differentieel") onthoudDifferentieel(doc, doel.nodeId);
  }
  function voegLichtschakelingToe(doel: LichtschakelingDoel, opties: LichtschakelingOpties, instellingen?: DifferentieelInstellingen): void {
    if (alleenLezen.value) return;
    const doc = vereisDocument();
    const r = voegLichtToe(doc, doel, opties, instellingen);
    pasToeMetBehoud(r); selectie.value = [r.id];
    if (doel.soort === "bestaande-differentieel") onthoudDifferentieel(doc, doel.nodeId);
  }
  function legKringCodesVast(): void { if (!alleenLezen.value) pasToe(legCodesVast(vereisDocument())); }
  function hernummerKringen(): void { if (!alleenLezen.value) pasToe(hernummer(vereisDocument())); }
  const hernummerVoorbeeld = computed(() => document.value ? voorbeeldHernummering(document.value) : []);

  /**
   * Wijzigt één veld op alle nodes in één undo-stap. Opeenvolgende wijzigingen van
   * hetzelfde veld op dezelfde nodes vallen samen tot `sluitGroep`.
   */
  function wijzigVeld(nodeIds: NodeId[], sleutel: string, waarde: unknown): void {
    if (alleenLezen.value) return;
    const doc = vereisDocument();
    if (nodeIds.length === 0) return;
    const resultaten: OperatieResultaat[] = [];
    let huidig = doc;
    for (const id of nodeIds) {
      const node = huidig.nodes[id]!;
      let wijziging: Record<string, unknown> = { [sleutel]: waarde };
      if (sleutel === "aanleg.ligging" || sleutel === "aanleg.inBuis") {
        if (node.type !== "leiding") throw new DocumentFout("ONGELDIG_SCHEMA");
        const aanleg: Record<string, unknown> = { ...node.aanleg, [sleutel.slice(7)]: waarde };
        if (waarde === undefined) delete aanleg[sleutel.slice(7)];
        // InBuis is verplicht zodra een aanleg is opgegeven.
        wijziging = { aanleg: Object.keys(aanleg).length === 0 ? undefined : { inBuis: false, ...aanleg } };
      }
      const r = wijzigEigenschappen(huidig, id, wijziging);
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
    const einde = zoek("aftakking-einde", node.id) ?? zoek("kring-einde", node.id);
    if (einde) return einde;
    // De keten loopt dood op een bord (bv. de teller in een nieuw project): dan op de rail.
    if (node.type === "verdeelbord" || node.type === "differentieel") return zoek("rail-einde", node.id);
    return undefined;
  }

  /** Enter: voegt `onderdeel` toe bij de selectie. Kan het niet, dan gebeurt er niets. */
  function voegToeBijSelectie(): void {
    if (alleenLezen.value) return;
    const doc = document.value;
    if (!doc) return;
    const aanknoping = aanknopingBijSelectie(doc);
    if (!aanknoping) return;
    if (!magToevoegen(doc, aanknoping, onderdeel.value, voorinstelling.value)) return;
    voegToe(aanknoping);
  }

  /** De kring (id van de beveiliging) van de enige geselecteerde node, of undefined. */
  function kringVanSelectie(): NodeId | undefined {
    const id = selectie.value.length === 1 ? selectie.value[0] : undefined;
    const a = analyse.value;
    if (id === undefined || !a) return undefined;
    return a.kringVanNode[id] ?? a.kringen.find((k) => k.beveiligingId === id)?.id;
  }

  /**
   * C, L en D met een kring geselecteerd: kiest `gekozen` en voegt het meteen toe, zonder extra klik.
   * Een contactdoos of lichtpunt komt na de selectie (zoals Enter), een differentieel vóór de
   * selectie, of anders vóór de kring. Geeft true als er iets is toegevoegd; anders is het onderdeel
   * alleen gekozen.
   */
  function snelToevoegen(gekozen: Onderdeel): boolean {
    if (alleenLezen.value) return false;
    onderdeel.value = gekozen;
    const doc = document.value;
    const kring = kringVanSelectie();
    if (!doc || kring === undefined) return false;
    if (gekozen === "contactdoos" || gekozen === "lichtpunt") {
      voegToeBijSelectie();
      return document.value !== doc;
    }
    if (gekozen !== "differentieel") return false;
    const invoer = STANDAARD.differentieel;
    const doelId = [selectie.value[0]!, kring].find((id) => magInvoegenVoor(doc, id, invoer));
    if (doelId === undefined) return false;
    const r = voegInVoor(doc, doelId, invoer);
    pasToeMetBehoud(r);
    selectie.value = [r.id];
    return true;
  }

  /**
   * Ctrl+D: dupliceert de kring van de selectie met de eerste vrije letter (`dupliceerKring`), als
   * één undo-stap waarin de bestaande codes vast blijven, en selecteert de kopie. Geeft de codes van
   * bron en kopie, of null als de selectie geen kring is.
   */
  function dupliceerSelectieKring(): { code: string; bron: string } | null {
    if (alleenLezen.value) return null;
    const doc = document.value;
    const kring = kringVanSelectie();
    if (!doc || kring === undefined) return null;
    const { resultaat, code } = dupliceerMetVrijeCode(doc, kring);
    pasToeMetBehoud(resultaat);
    selectie.value = [resultaat.id];
    return { code, bron: bepaalKringCodes(doc)[kring] ?? "" };
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
    if (alleenLezen.value) return;
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
    if (alleenLezen.value) return;
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
    if (alleenLezen.value) return;
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
    frequentie_Hz?: number | null;
    klantAdres?: Adres | null;
    werfadres?: Adres;
    ean?: string;
    datum?: string;
    /** De taal van het dossier (PDF); dezelfde taal opnieuw (of nl zonder taal) maakt geen stap. */
    dossierTaal?: Taal;
    installatieContext?: "nieuw" | "bestaand" | "onbekend";
    /** Vervangt alle metingen; dezelfde metingen opnieuw maken geen stap (`wijzigProject`). */
    metingen?: Metingen | null;
  }): void {
    if (alleenLezen.value) return;
    const doc = vereisDocument();
    const wijziging: ProjectWijziging = {};
    if (gegevens.klantNaam !== undefined) wijziging.klantNaam = gegevens.klantNaam;
    if (gegevens.stroomtype !== undefined) wijziging.stroomtype = gegevens.stroomtype;
    if (gegevens.frequentie_Hz !== undefined && gegevens.frequentie_Hz !== (doc.voeding.frequentie_Hz ?? null)) wijziging.frequentie_Hz = gegevens.frequentie_Hz;
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
    if (gegevens.dossierTaal !== undefined) wijziging.dossierTaal = gegevens.dossierTaal;
    if (gegevens.installatieContext !== undefined) wijziging.installatieContext = gegevens.installatieContext;
    if (gegevens.metingen !== undefined) wijziging.metingen = gegevens.metingen;
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
    voorinstellingen,
    voorinstelling,
    toestelsoort,
    symbolenOpen,
    sneltoetsenOpen,
    laatsteDifferentieel,
    kiesVariant,
    zetStandaard,
    tabblad,
    terug,
    vooruit,
    gewijzigdSindsOpslaan,
    laadGeneratie,
    alleenLezen,
    analyse,
    bevindingen,
    opmaak,
    svg,
    aantalFouten,
    aantalWaarschuwingen,
    aantalInfo,
    laad,
    zetAlleenLezen,
    markeerGewijzigd,
    pasToe,
    pasToeMetBehoud,
    sluitGroep,
    ongedaanMaken,
    opnieuw,
    voegToe,
    kanVoorSelectieInvoegen,
    voegVoorSelectieIn,
    kanAftakkingToevoegen,
    voegAftakkingToeBijSelectie,
    voegSjabloonToe,
    voegLichtschakelingToe,
    legKringCodesVast,
    hernummerKringen,
    hernummerVoorbeeld,
    wijzigVeld,
    voegToeBijSelectie,
    snelToevoegen,
    dupliceerSelectieKring,
    navigeer,
    verwijderSelectie,
    zetAfwijking,
    nieuwVenster,
    wisAfwijking,
    wijzigProjectgegevens,
  };
});
