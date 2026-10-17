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
