// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import {
  hernoemPagina,
  plaats,
  verplaatsPagina as verplaatsPaginaInDoc,
  verwijderPagina as verwijderPaginaUitDoc,
  verwijderPlaatsing,
  voegPaginaToe,
  zetAchtergrond,
  zetSchaal as zetSchaalInDoc,
  type NodeId,
  type OperatieResultaat,
  type SituatiePagina,
} from "@elentrik/model";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { samengevoegd } from "../editor/resultaten";
import { draai, schuif } from "../situatie/geometrie";
import { useEditorStore } from "./editor";

type Achtergrond = NonNullable<SituatiePagina["achtergrond"]>;

export const useSituatieStore = defineStore("situatie", () => {
  const editor = useEditorStore();

  /** De gekozen pagina; bestaat die niet (meer), dan geldt de eerste. */
  const gekozenPaginaId = ref<string | null>(null);

  const paginas = computed<SituatiePagina[]>(() => editor.document?.situatie.paginas ?? []);

  const actievePagina = computed<SituatiePagina | undefined>(
    () => paginas.value.find((p) => p.id === gekozenPaginaId.value) ?? paginas.value[0],
  );

  const actievePaginaId = computed<string | null>({
    get: () => actievePagina.value?.id ?? null,
    set: (id) => {
      gekozenPaginaId.value = id;
    },
  });

  function vereisDocument() {
    if (!editor.document) throw new Error("Er is geen document geladen");
    return editor.document;
  }

  /** Voegt een pagina met plan toe als één undo-stap en maakt haar actief. */
  function voegPlanPaginaToe(titel: string, achtergrond: Achtergrond): string {
    const doc = vereisDocument();
    const toegevoegd = voegPaginaToe(doc, titel);
    const metPlan = zetAchtergrond(toegevoegd.doc, toegevoegd.id, achtergrond);
    editor.pasToe(samengevoegd(doc, [toegevoegd, metPlan]));
    gekozenPaginaId.value = toegevoegd.id;
    return toegevoegd.id;
  }

  function vervangAchtergrond(paginaId: string, achtergrond: Achtergrond): void {
    editor.pasToe(zetAchtergrond(vereisDocument(), paginaId, achtergrond));
  }

  function hernoem(paginaId: string, titel: string): void {
    editor.pasToe(hernoemPagina(vereisDocument(), paginaId, titel));
  }

  function verwijderPagina(paginaId: string): void {
    editor.pasToe(verwijderPaginaUitDoc(vereisDocument(), paginaId));
  }

  function verplaatsPagina(paginaId: string, index: number): void {
    editor.pasToe(verplaatsPaginaInDoc(vereisDocument(), paginaId, index));
  }

  function zetSchaal(paginaId: string, mmPerPx: number | undefined): void {
    editor.pasToe(zetSchaalInDoc(vereisDocument(), paginaId, mmPerPx));
  }

  /** De pagina en plaatsing van een node, of `undefined` als hij nergens staat. */
  function plaatsingVan(nodeId: NodeId) {
    for (const pagina of paginas.value) {
      const plaatsing = pagina.plaatsingen.find((p) => p.nodeId === nodeId);
      if (plaatsing) return { pagina, plaatsing };
    }
    return undefined;
  }

  /**
   * Plaatst de node op de actieve pagina en behoudt een bestaande rotatie. Stond hij op een
   * andere pagina, dan geeft dit de titel van die pagina terug (voor een melding), anders `null`.
   */
  function plaatsNode(nodeId: NodeId, x: number, y: number): string | null {
    const doel = actievePagina.value;
    if (!doel) throw new Error("Er is geen actieve pagina");
    const bestaand = plaatsingVan(nodeId);
    // Een klik zonder verschuiving verandert niets en hoeft dus geen undo-stap of autosave.
    if (bestaand && bestaand.pagina.id === doel.id && bestaand.plaatsing.x === x && bestaand.plaatsing.y === y) {
      return null;
    }
    editor.pasToe(plaats(vereisDocument(), doel.id, nodeId, { x, y, rotatie: bestaand?.plaatsing.rotatie ?? 0 }));
    return bestaand && bestaand.pagina.id !== doel.id ? bestaand.pagina.titel : null;
  }

  function haalVanPlan(nodeId: NodeId): void {
    editor.pasToe(verwijderPlaatsing(vereisDocument(), nodeId));
  }

  /**
   * Past een wijziging toe op elke geselecteerde node die op de actieve pagina staat; plaatsingen
   * op andere pagina's blijven ongemoeid. Alles samen is één undo-stap, of geen als niets verandert.
   */
  function wijzigGeselecteerde(
    nieuw: (huidig: { x: number; y: number; rotatie: number }, pagina: SituatiePagina) => { x: number; y: number; rotatie: number } | undefined,
  ): void {
    const doc = vereisDocument();
    const pagina = actievePagina.value;
    if (!pagina) return;
    const resultaten: OperatieResultaat[] = [];
    let huidig = doc;
    for (const nodeId of editor.selectie) {
      const plaatsing = pagina.plaatsingen.find((p) => p.nodeId === nodeId);
      if (!plaatsing) continue;
      const positie = nieuw(plaatsing, pagina);
      if (!positie) continue;
      const r = plaats(huidig, pagina.id, nodeId, positie);
      resultaten.push(r);
      huidig = r.doc;
    }
    if (resultaten.length > 0) editor.pasToe(samengevoegd(doc, resultaten));
  }

  /** Haalt de geselecteerde nodes van de actieve pagina, in één undo-stap (geen stap als niets past). */
  function haalSelectieVanPlan(): void {
    const doc = vereisDocument();
    const pagina = actievePagina.value;
    if (!pagina) return;
    const resultaten: OperatieResultaat[] = [];
    let huidig = doc;
    for (const nodeId of editor.selectie) {
      if (!pagina.plaatsingen.some((p) => p.nodeId === nodeId)) continue;
      const r = verwijderPlaatsing(huidig, nodeId);
      resultaten.push(r);
      huidig = r.doc;
    }
    if (resultaten.length > 0) editor.pasToe(samengevoegd(doc, resultaten));
  }

  /** Draait de geselecteerde, geplaatste nodes één stap van 15 graden. */
  function draaiSelectie(richting: 1 | -1): void {
    wijzigGeselecteerde((p) => ({ x: p.x, y: p.y, rotatie: draai(p.rotatie, richting) }));
  }

  /** Verschuift de geselecteerde, geplaatste nodes binnen het raster van hun pagina. */
  function schuifSelectie(dx: number, dy: number): void {
    wijzigGeselecteerde((p, pagina) => {
      if (!pagina.achtergrond) return undefined;
      const { x, y } = schuif(p, dx, dy, pagina.achtergrond);
      return x === p.x && y === p.y ? undefined : { x, y, rotatie: p.rotatie };
    });
  }

  return {
    actievePaginaId,
    actievePagina,
    voegPlanPaginaToe,
    vervangAchtergrond,
    hernoem,
    verwijderPagina,
    verplaatsPagina,
    zetSchaal,
    plaatsNode,
    haalVanPlan,
    haalSelectieVanPlan,
    draaiSelectie,
    schuifSelectie,
  };
});
