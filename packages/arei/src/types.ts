import type { InstallatieDocument, NodeId } from "@elentrik/model";
import type { Analyse } from "./analyse/index";

export type Ernst = "fout" | "waarschuwing" | "info";

export interface Bevinding {
  regelId: string;
  ernst: Ernst;
  nodeIds: NodeId[];
  berichtSleutel: string;
  parameters: Record<string, string | number>;
  afgeweken: boolean;
}

export interface Regel {
  id: string;
  artikel: string;
  ernst: Ernst;
  nagekeken: boolean;
  berichtSleutels: readonly string[];
  check(analyse: Analyse, doc: InstallatieDocument): Omit<Bevinding, "afgeweken">[];
}

export interface Regelset {
  id: string;
  versie: number;
  gepubliceerd: boolean;
  regels: readonly Regel[];
}
