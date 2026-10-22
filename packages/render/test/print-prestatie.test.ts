import { analyseer, controleer, haalRegelset } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { nieuwId, valideerStructuur, type InstallatieDocument } from "@elentrik/model";
import { expect, test } from "vitest";
import { printHtml } from "../src/index";
import { kloon } from "./hulp";

// `performance` zit niet in lib ES2023 (geen DOM- of Node-types); Node en Vitest leveren het wel.
declare const performance: { now(): number };

const KRINGEN = 200;
const CONTACTDOZEN_PER_KRING = 8;

function mediaan(waarden: readonly number[]): number {
  const gesorteerd = [...waarden].sort((a, b) => a - b);
  const midden = Math.floor(gesorteerd.length / 2);
  return gesorteerd.length % 2 === 1
    ? (gesorteerd[midden] ?? Infinity)
    : ((gesorteerd[midden - 1] ?? Infinity) + (gesorteerd[midden] ?? Infinity)) / 2;
}

/** 2.000 nodes met ruwe nodes (`voegToe` is te traag), plus een situatiepagina met 200 plaatsingen. */
function bouwGrootDocument(): InstallatieDocument {
  const { doc, ids } = installatie()
    .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
    .bouw();
  const groot = kloon(doc);
  const bordId = ids["bord"]!;
  const bord = groot.nodes[bordId]!;
  const plaatsingen: InstallatieDocument["situatie"]["paginas"][number]["plaatsingen"] = [];
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
      if (j === 0) plaatsingen.push({ nodeId: id, x: (i % 20) * 150, y: Math.floor(i / 20) * 150, rotatie: 0 });
    }
  }
  groot.situatie.paginas.push({
    id: "p1",
    titel: "Gelijkvloers",
    achtergrond: { origineelBestandId: "o1", rasterBestandId: "r1", breedte_px: 3000, hoogte_px: 2000 },
    plaatsingen,
  });
  return groot;
}

test("printHtml op 2.000 nodes met alle onderdelen: mediaan van 10 runs onder 200 ms", { timeout: 60_000 }, () => {
  const doc = bouwGrootDocument();
  expect(valideerStructuur(doc)).toEqual([]);
  expect(Object.keys(doc.nodes)).toHaveLength(KRINGEN * (2 + CONTACTDOZEN_PER_KRING) + 4);
  const analyse = analyseer(doc);
  const bevindingen = controleer(doc, haalRegelset(doc.regelset));
  const opties = {
    papier: "A4",
    onderdelen: { eendraadschema: true, situatieschema: true, kringenlijst: true, bijlage: true },
    versieLabel: "v1",
    datum: "2026-10-19",
    taal: "nl",
    installateur: { naam: "Elektro Peeters bv" },
    afbeeldingen: { r1: "plan.png" },
    logo: "logo.png",
  } as const;

  for (let i = 0; i < 3; i++) printHtml(doc, analyse, bevindingen, opties);
  const tijden: number[] = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    printHtml(doc, analyse, bevindingen, opties);
    tijden.push(performance.now() - start);
  }
  expect(mediaan(tijden)).toBeLessThan(200);
});
