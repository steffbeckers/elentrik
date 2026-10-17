import { expect, test } from "vitest";
import { nieuwId, valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { controleer, haalRegelset } from "../src/index";
import { installatie } from "../src/testing/index";
import { kloon } from "./hulp";

// `performance` zit niet in lib ES2023 (geen DOM- of Node-types); Node en Vitest leveren het wel.
declare const performance: { now(): number };

const KRINGEN = 200;
const CONTACTDOZEN_PER_KRING = 8;

/** Bouwt het document met ruwe nodes: `voegToe` is O(n) per aanroep en dus te traag voor 2.000 nodes. */
function bouwGrootDocument(): InstallatieDocument {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
    .bouw();
  const groot = kloon(doc);
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
  return groot;
}

test("controleer op 2.000 nodes: mediaan van 20 runs onder 20 ms (spec 5.4)", { timeout: 60_000 }, () => {
  const doc = bouwGrootDocument();
  expect(valideerStructuur(doc)).toEqual([]);
  expect(Object.keys(doc.nodes)).toHaveLength(KRINGEN * (2 + CONTACTDOZEN_PER_KRING) + 4);
  const regelset = haalRegelset("arei-2020@1");

  for (let i = 0; i < 5; i++) controleer(doc, regelset);
  const tijden: number[] = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    controleer(doc, regelset);
    tijden.push(performance.now() - start);
  }
  tijden.sort((a, b) => a - b);
  const mediaan = ((tijden[9] ?? Infinity) + (tijden[10] ?? Infinity)) / 2;
  expect(mediaan).toBeLessThan(20);
});
