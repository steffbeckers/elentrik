import { DocumentFout } from "./fouten";
import { nieuwId } from "./ids";
import { resultaat, vereis, type OperatieResultaat } from "./operaties";
import {
  SituatiePaginaSchema,
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
    draft.situatie.paginas.find((p) => p.id === paginaId)!.achtergrond = nieuw;
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

  return resultaat(doc, (draft) => {
    for (const pagina of draft.situatie.paginas) {
      if (pagina.plaatsingen.some((p) => p.nodeId === nodeId)) {
        pagina.plaatsingen = pagina.plaatsingen.filter((p) => p.nodeId !== nodeId);
      }
    }
    draft.situatie.paginas
      .find((p) => p.id === paginaId)!
      .plaatsingen.push({ nodeId, x, y, rotatie: genormaliseerd });
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
