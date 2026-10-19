import type { NodeId } from "@elentrik/model";
import type { Symbool } from "@elentrik/symbols";

/** Een element van het schema in strookcoördinaten (mm). De y loopt naar beneden; de voeding staat onderaan en het schema groeit naar boven. */
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

/** Het vak van een getekend symbool in strookcoördinaten (mm). */
export type Vak = { x: number; y: number; breedte: number; hoogte: number };

/** Een plek waar het schema kan uitgebreid worden, in strookcoördinaten (mm). */
export type Aanknoping =
  /** Het einde van een kring: boven de bovenkant van een node zonder kinderen (punt, leiding, automaat of zekering). */
  | { soort: "kring-einde"; nodeId: NodeId; x: number; y: number }
  /** Het einde van de rail van een bord of een differentieel in een bord, rechts van het laatste kind. */
  | { soort: "rail-einde"; nodeId: NodeId; x: number; y: number };

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
  /** Het vak van elk getekend symbool. */
  vakken: Record<NodeId, Vak>;
  /** In pre-order van de nodes. */
  aanknopingen: Aanknoping[];
};

/** Verticale ruimte tussen de bovenkant van een ouder en de onderkant van een kind (erboven), in mm. */
export const VERTICALE_AFSTAND_MM = 4;

/** Extra verticale ruimte boven een ouder met meerdere kinderen, voor de rail, in mm. */
export const RAIL_AFSTAND_MM = 6;

/** Afstand van een `kring-einde` tot de bovenkant van het vak van zijn node, in mm. */
export const KRING_EINDE_AFSTAND_MM = 5;

/** Marge rond de strook, in mm. */
export const STROOK_MARGE_MM = 4;
