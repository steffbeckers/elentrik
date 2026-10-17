import type { NodeId, Ruimte } from "@elentrik/model";

export type Kring = {
  /** Gelijk aan `beveiligingId`. */
  id: NodeId;
  label: string;
  beveiligingId: NodeId;
  /** Dichtstbijzijnde `verdeelbord` boven de beveiliging. */
  verdeelbordId: NodeId;
  /** Punten van de kring, in pre-order. */
  puntIds: NodeId[];
  leidingIds: NodeId[];
  /** `contactdozen` en `lichtpunten` zijn sommen van `aantal`; schakelaars en toestellen tellen nodes. */
  tellingen: { contactdozen: number; lichtpunten: number; schakelaars: number; toestellen: number };
  ruimtes: Ruimte[];
  minDoorsnede_mm2: number | null;
};

export type Keten = {
  leidingId: NodeId | null;
  beveiligingId: NodeId | null;
  /** Begint bij het dichtstbijzijnde differentieel. */
  differentielen: NodeId[];
};

export type Analyse = {
  /** In pre-order van de beveiligingen. */
  kringen: Kring[];
  /** Per node in een kring: het id van de dichtstbijzijnde kringbeveiliging (de node zelf of een voorouder). */
  kringVanNode: Record<NodeId, NodeId>;
  puntLabels: Record<NodeId, string>;
  ketens: Record<NodeId, Keten>;
  /** Punten zonder kringbeveiliging erboven, in pre-order. */
  zonderKring: NodeId[];
  tellerId: NodeId | null;
  algemeenDifferentieelId: NodeId | null;
  nietGeplaatst: NodeId[];
};
