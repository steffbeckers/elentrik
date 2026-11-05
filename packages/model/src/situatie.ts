import { DocumentFout } from "./fouten";
import { nieuwId } from "./ids";
import { resultaat, vereis, type OperatieResultaat } from "./operaties";
import {
  SituatiePaginaSchema,
  PlanTekeningSchema,
  type PlanTekening,
  type InstallatieDocument,
  type NodeId,
  type SituatiePagina,
} from "./schema";
import { PUNT_TYPES } from "./structuur";

export const PLAATSBARE_TYPES = [...PUNT_TYPES, "verdeelbord"] as const;

const AchtergrondSchema = SituatiePaginaSchema.shape.achtergrond.unwrap();

function vereisPagina(doc: InstallatieDocument, paginaId: string): void {
  if (!doc.situatie.paginas.some((p) => p.id === paginaId)) {
    throw new DocumentFout("ONBEKENDE_PAGINA", { paginaId });
  }
}

export function voegPaginaToe(
  doc: InstallatieDocument,
  titel: string,
): OperatieResultaat & { id: string } {
  const id = nieuwId();
  return resultaat(
    doc,
    (draft) => {
      draft.situatie.paginas.push({ id, titel, plaatsingen: [] });
    },
    { id },
  );
}

export function zetAchtergrond(
  doc: InstallatieDocument,
  paginaId: string,
  achtergrond: NonNullable<SituatiePagina["achtergrond"]>,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const geparsed = AchtergrondSchema.safeParse(achtergrond);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  const nieuw = geparsed.data;
  return resultaat(doc, (draft) => {
    const pagina = draft.situatie.paginas.find((p) => p.id === paginaId)!;
    pagina.achtergrond = nieuw;
    if (pagina.afdruk?.schaalmodus === "gekalibreerd") delete pagina.afdruk;
    delete pagina.tekening;
  });
}

/** Commit source, raster and world-coordinate mapping together, as one undoable operation. */
export function zetGetekendPlan(
  doc: InstallatieDocument,
  paginaId: string,
  achtergrond: NonNullable<SituatiePagina["achtergrond"]>,
  tekening: PlanTekening,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const bron = PlanTekeningSchema.safeParse(tekening);
  const beeld = AchtergrondSchema.safeParse(achtergrond);
  if (!bron.success || !beeld.success) throw new DocumentFout("ONGELDIG_SCHEMA");
  if (!(beeld.data.breedte_px > 0 && beeld.data.hoogte_px > 0)) throw new DocumentFout("ONGELDIG_SCHEMA");
  return resultaat(doc, (draft) => {
    const pagina = draft.situatie.paginas.find((p) => p.id === paginaId)!;
    const oud = pagina.tekening?.kader;
    const nieuw = bron.data.kader;
    if (oud) for (const plaatsing of pagina.plaatsingen) {
      plaatsing.x = (plaatsing.x / oud.pxPerCm + oud.x_cm - nieuw.x_cm) * nieuw.pxPerCm;
      plaatsing.y = (plaatsing.y / oud.pxPerCm + oud.y_cm - nieuw.y_cm) * nieuw.pxPerCm;
      if (plaatsing.labelOffset) {
        plaatsing.labelOffset.x *= nieuw.pxPerCm / oud.pxPerCm;
        plaatsing.labelOffset.y *= nieuw.pxPerCm / oud.pxPerCm;
      }
    }
    pagina.tekening = bron.data;
    pagina.achtergrond = { ...beeld.data, schaal: { mmPerPx: 10 / nieuw.pxPerCm } };
  });
}

/** Plaatst een node op een pagina; een bestaande plaatsing van die node (op welke pagina ook) vervalt. */
export function plaats(
  doc: InstallatieDocument,
  paginaId: string,
  nodeId: NodeId,
  positie: { x: number; y: number; rotatie: number },
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  if (doc.situatie.paginas.find(p => p.id === paginaId)!.referentie) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "Referentieblad: kies een definitief plan om punten te plaatsen" });
  }
  const node = vereis(doc, nodeId);
  if (!(PLAATSBARE_TYPES as readonly string[]).includes(node.type)) {
    throw new DocumentFout("NIET_PLAATSBAAR", { nodeId, type: node.type });
  }
  const { x, y, rotatie } = positie;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(rotatie)) {
    throw new DocumentFout("ONGELDIG_SCHEMA", {
      reden: "x, y en rotatie moeten eindige getallen zijn",
    });
  }
  // `+ 0` zet -0 om naar 0.
  const genormaliseerd = (((rotatie % 360) + 360) % 360) + 0;
  const bestaand = doc.situatie.paginas.flatMap((p) => p.plaatsingen).find((p) => p.nodeId === nodeId);

  return resultaat(doc, (draft) => {
    for (const pagina of draft.situatie.paginas) {
      if (pagina.plaatsingen.some((p) => p.nodeId === nodeId)) {
        pagina.plaatsingen = pagina.plaatsingen.filter((p) => p.nodeId !== nodeId);
      }
    }
    draft.situatie.paginas
      .find((p) => p.id === paginaId)!
      .plaatsingen.push({ ...bestaand, nodeId, x, y, rotatie: genormaliseerd });
  });
}

/** Onafhankelijke formaten per pagina, met dezelfde standaard voor bestaande documenten. */
export function zetPaginaOpmaak(
  doc: InstallatieDocument,
  paginaId: string,
  opmaak: Pick<SituatiePagina, "symboolSchaal" | "labelSchaal">,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const geparsed = SituatiePaginaSchema.pick({ symboolSchaal: true, labelSchaal: true }).safeParse(opmaak);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  return resultaat(doc, (draft) => {
    Object.assign(draft.situatie.paginas.find((p) => p.id === paginaId)!, geparsed.data);
  });
}

export function zetPaginaAfdruk(doc: InstallatieDocument, paginaId: string, afdruk: NonNullable<SituatiePagina["afdruk"]>): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const parsed = SituatiePaginaSchema.shape.afdruk.unwrap().safeParse(afdruk);
  if (!parsed.success) throw new DocumentFout("ONGELDIG_SCHEMA", { issues: parsed.error.issues });
  const pagina = doc.situatie.paginas.find(p => p.id === paginaId)!;
  if (afdruk.schaalmodus === "gekalibreerd" && !(pagina.achtergrond?.schaal?.mmPerPx && pagina.achtergrond.schaal.mmPerPx > 0)) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "Kalibreer eerst de definitieve uitsnede" });
  }
  return resultaat(doc, draft => { draft.situatie.paginas.find(p => p.id === paginaId)!.afdruk = parsed.data; });
}

export function zetReferentiePagina(doc: InstallatieDocument, paginaId: string, referentie: boolean): OperatieResultaat {
  vereisPagina(doc, paginaId);
  if (referentie && doc.situatie.paginas.find(p => p.id === paginaId)!.plaatsingen.length) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "Een blad met definitieve punten kan geen referentieblad worden" });
  }
  return resultaat(doc, draft => { draft.situatie.paginas.find(p => p.id === paginaId)!.referentie = referentie; });
}

/** Wijzigt uitsluitend het label; het symbool behoudt zijn positie en rotatie. */
export function zetLabelOffset(
  doc: InstallatieDocument,
  paginaId: string,
  nodeId: NodeId,
  offset: { x: number; y: number },
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const huidig = doc.situatie.paginas.find((p) => p.id === paginaId)!.plaatsingen.find((p) => p.nodeId === nodeId);
  if (!huidig) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "de node staat niet op deze pagina", nodeId });
  }
  const geparsed = SituatiePaginaSchema.shape.plaatsingen.element.shape.labelOffset.unwrap().safeParse(offset);
  if (!geparsed.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: geparsed.error.issues });
  }
  if ((huidig.labelOffset?.x ?? 0) === geparsed.data.x && (huidig.labelOffset?.y ?? 0) === geparsed.data.y) {
    return { doc, patches: [], inversePatches: [] };
  }
  return resultaat(doc, (draft) => {
    const plaatsing = draft.situatie.paginas.find((p) => p.id === paginaId)!.plaatsingen.find((p) => p.nodeId === nodeId)!;
    plaatsing.labelOffset = geparsed.data;
  });
}

export function verwijderPlaatsing(doc: InstallatieDocument, nodeId: NodeId): OperatieResultaat {
  if (!doc.situatie.paginas.some((p) => p.plaatsingen.some((pl) => pl.nodeId === nodeId))) {
    return { doc, patches: [], inversePatches: [] };
  }
  return resultaat(doc, (draft) => {
    for (const pagina of draft.situatie.paginas) {
      if (pagina.plaatsingen.some((p) => p.nodeId === nodeId)) {
        pagina.plaatsingen = pagina.plaatsingen.filter((p) => p.nodeId !== nodeId);
      }
    }
  });
}

export function hernoemPagina(
  doc: InstallatieDocument,
  paginaId: string,
  titel: string,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const getrimd = titel.trim();
  if (getrimd === "") {
    throw new DocumentFout("ONGELDIG_SCHEMA", { reden: "de titel mag niet leeg zijn" });
  }
  return resultaat(doc, (draft) => {
    draft.situatie.paginas.find((p) => p.id === paginaId)!.titel = getrimd;
  });
}

/** Verwijdert de pagina met haar plaatsingen; de nodes blijven in het document. */
export function verwijderPagina(doc: InstallatieDocument, paginaId: string): OperatieResultaat {
  vereisPagina(doc, paginaId);
  return resultaat(doc, (draft) => {
    draft.situatie.paginas = draft.situatie.paginas.filter((p) => p.id !== paginaId);
  });
}

/** Zet de schaal (mm per rasterpixel) van de achtergrond; `undefined` verwijdert de schaal. */
export function zetSchaal(
  doc: InstallatieDocument,
  paginaId: string,
  mmPerPx: number | undefined,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  if (!doc.situatie.paginas.find((p) => p.id === paginaId)!.achtergrond) {
    throw new DocumentFout("GEEN_ACHTERGROND", { paginaId });
  }
  if (mmPerPx !== undefined && !(Number.isFinite(mmPerPx) && mmPerPx > 0)) {
    throw new DocumentFout("ONGELDIG_SCHEMA", {
      reden: "mmPerPx moet een eindig getal groter dan 0 zijn",
    });
  }
  return resultaat(doc, (draft) => {
    const achtergrond = draft.situatie.paginas.find((p) => p.id === paginaId)!.achtergrond!;
    if (mmPerPx === undefined) delete achtergrond.schaal;
    else achtergrond.schaal = { mmPerPx };
  });
}

/** Zet de pagina op `nieuweIndex` (0 tot en met aantal - 1) in de paginavolgorde. */
export function verplaatsPagina(
  doc: InstallatieDocument,
  paginaId: string,
  nieuweIndex: number,
): OperatieResultaat {
  vereisPagina(doc, paginaId);
  const paginas = doc.situatie.paginas;
  if (!Number.isInteger(nieuweIndex) || nieuweIndex < 0 || nieuweIndex >= paginas.length) {
    throw new DocumentFout("ONGELDIGE_INDEX", { index: nieuweIndex, lengte: paginas.length });
  }
  const huidig = paginas.findIndex((p) => p.id === paginaId);
  if (huidig === nieuweIndex) return { doc, patches: [], inversePatches: [] };
  return resultaat(doc, (draft) => {
    const [pagina] = draft.situatie.paginas.splice(huidig, 1);
    draft.situatie.paginas.splice(nieuweIndex, 0, pagina!);
  });
}
