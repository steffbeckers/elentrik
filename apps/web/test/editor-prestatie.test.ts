import { installatie } from "@elentrik/arei/testing";
import { nieuwId, valideerStructuur, type InstallatieDocument, type NodeId } from "@elentrik/model";
import { createPinia, setActivePinia } from "pinia";
import { expect, test } from "vitest";
import { useEditorStore } from "../app/stores/editor";

const KRINGEN = 200;
const CONTACTDOZEN_PER_KRING = 8;

function mediaan(waarden: readonly number[]): number {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 1
    ? (gesorteerd[midden] ?? Infinity)
    : ((gesorteerd[midden - 1] ?? Infinity) + (gesorteerd[midden] ?? Infinity)) / 2;
}

/** Bouwt het document met ruwe nodes: `voegToe` is te traag voor 2.000 nodes. */
function bouwGrootDocument(): { doc: InstallatieDocument; bordId: NodeId } {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
    .bouw();
  const groot = structuredClone(doc);
  const bordId = ids["bord"]!;
  const bord = groot.nodes[bordId]!;
  for (let i = 0; i < KRINGEN; i++) {
    const automaatId = nieuwId();
    const leidingId = nieuwId();
    groot.nodes[automaatId] = {
      id: automaatId,
      parentId: bordId,
      kinderen: [leidingId],
      type: "automaat",
      nominaal_A: 16,
      polen: 2,
      curve: "B",
    };
    groot.nodes[leidingId] = {
      id: leidingId,
      parentId: automaatId,
      kinderen: [],
      type: "leiding",
      kabeltype: "XVB",
      doorsnede_mm2: 2.5,
      aantalGeleiders: 3,
    };
    bord.kinderen.push(automaatId);
    let ouderId = leidingId;
    for (let j = 0; j < CONTACTDOZEN_PER_KRING; j++) {
      const id = nieuwId();
      groot.nodes[id] = {
        id,
        parentId: ouderId,
        kinderen: [],
        type: "contactdoos",
        aantal: 1,
        randaarde: true,
        kinderbeveiliging: true,
        waterdicht: false,
      };
      groot.nodes[ouderId]!.kinderen.push(id);
      ouderId = id;
    }
  }
  return { doc: groot, bordId };
}

test("voegToe en svg en bevindingen uitlezen op 2.000 nodes: mediaan van 20 runs onder 100 ms", { timeout: 60_000 }, () => {
  const { doc, bordId } = bouwGrootDocument();
  expect(valideerStructuur(doc)).toEqual([]);
  expect(Object.keys(doc.nodes)).toHaveLength(KRINGEN * (2 + CONTACTDOZEN_PER_KRING) + 4);

  setActivePinia(createPinia());
  const store = useEditorStore();
  store.laad({ id: "groot", naam: "Groot", versie: 1, document: doc });
  expect(store.svg.length).toBeGreaterThan(0);

  // Eén ronde: een wijziging, en daarna de svg en de bevindingen uitlezen. Zo lopen
  // analyse, controleer, opmaak en render allemaal (global constraint: < 100 ms).
  const ronde = (): void => {
    store.voegToe({ soort: "rail-einde", nodeId: bordId });
    void store.svg;
    void store.aantalFouten;
  };
  for (let i = 0; i < 5; i++) ronde();
  const tijden: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    ronde();
    tijden.push(performance.now() - start);
  }
  expect(mediaan(tijden)).toBeLessThan(100);
});
