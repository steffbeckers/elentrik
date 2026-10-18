import type { NodeId } from "@elentrik/model";
import type { Symbool } from "@elentrik/symbols";

/** Een element van het schema in strookcoördinaten (mm). */
export type SchemaElement =
  | { soort: "symbool"; nodeId: NodeId; x: number; y: number; symbool: Symbool }
  | { soort: "lijn"; x1: number; y1: number; x2: number; y2: number; rol: "verbinding" | "rail" }
  | {
      soort: "tekst";
      x: number;
      y: number;
      tekst: string;
      grootte: number;
      anker: "start" | "middle" | "end";
      rol: "kring" | "punt" | "leiding" | "beveiliging" | "onderbord";
    }
  | { soort: "vervolg"; x: number; y: number; richting: "links" | "rechts"; paginaNummer: number };

export type Strook = {
  breedte: number;
  hoogte: number;
  /** In pre-order van de nodes. */
  elementen: SchemaElement[];
  /** Kolomindex per node. */
  kolomVan: Record<NodeId, number>;
  /** x-posities (mm) waar een kringsubboom begint, oplopend en uniek. */
  kringGrenzen: number[];
  /** Linkerrand (mm) van elke bladkolom, gevolgd door `breedte`; oplopend. */
  kolomGrenzen: number[];
};

/** Verticale ruimte tussen de onderkant van een ouder en de bovenkant van een kind, in mm. */
export const VERTICALE_AFSTAND_MM = 4;

/** Extra verticale ruimte onder een ouder met meerdere kinderen, voor de rail, in mm. */
export const RAIL_AFSTAND_MM = 6;

/** Marge rond de strook, in mm. */
export const STROOK_MARGE_MM = 4;
