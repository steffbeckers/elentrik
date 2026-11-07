import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { expect, test } from "vitest";
import { printHtml, situatieItems, situatieLaagSvg } from "../src/index";
import { kloon } from "./hulp";

test.each([0, 45, 90, 180, 270].flatMap(rotatie => [.25, 4].flatMap(factor => [false, true].map(gekalibreerd => ({ rotatie, factor, gekalibreerd })))))
("afdrukteller behoudt leesbaar kWh in zijn kader en vrij label ($rotatie°, $factor, gekalibreerd=$gekalibreerd)", ({ rotatie, factor, gekalibreerd }) => {
  const doc = kloon(installatie().verdeelbord(b => b.kring(k => k.automaat(16).leiding(2.5).contactdozen(1))).bouw().doc);
  const teller = Object.values(doc.nodes).find(n => n.type === "teller")!;
  doc.situatie.paginas = [{ id: "p", titel: "Plan", symboolSchaal: factor, labelSchaal: .25,
    achtergrond: { origineelBestandId: "o", rasterBestandId: "r", breedte_px: 3000, hoogte_px: 2000, schaal: { mmPerPx: 2 } },
    ...(gekalibreerd ? { afdruk: { papier: "A4", orientatie: "liggend", schaalmodus: "gekalibreerd", schaalNoemer: 100 } as const } : {}),
    plaatsingen: [{ nodeId: teller.id, x: 1200, y: 1000, rotatie, labelOffset: { x: factor === .25 ? -200 : 0, y: 0 } }],
  }];
  const analyse = analyseer(doc);
  const voor = kloon(doc);
  const editor = situatieLaagSvg(situatieItems(doc, analyse, "p"), 50);
  const uit = printHtml(doc, analyse, [], { papier: "A4", onderdelen: { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false },
    versieLabel: "V1", datum: "2026-11-06", taal: "nl", installateur: { naam: "" }, afbeeldingen: { r: "plan.png" } });
  const planSchaal = Number(uit.html.match(/data-plan-breedte-mm="([\d.]+)"/)![1]) / 3000;
  const groep = uit.html.slice(uit.html.indexOf(`data-node-id="${teller.id}"`));
  expect(groep).toContain('transform="translate(1200 1000)"');
  const glyph = /<g transform="rotate\(([^)]+)\) scale\(([^)]+)\) translate\([^)]+\)">([\s\S]*?)<\/g>/.exec(groep)!;
  const glyphSchaal = Number(glyph[2]);
  expect(Number(glyph[1])).toBe(rotatie);
  expect(glyph[3]).toContain('>kWh</text>');
  expect(glyph[3]).toContain('<rect');
  const venster = /<svg x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"/.exec(glyph[3]!)!;
  // Keep the entire 1.5..10.5mm frame and its stroke, but not the external wire stubs at 0/12mm.
  expect(venster).not.toBeNull();
  expect(Number(venster[2])).toBeGreaterThan(1);
  expect(Number(venster[2])).toBeLessThanOrEqual(1.325);
  expect(Number(venster[2]) + Number(venster[4])).toBeGreaterThanOrEqual(10.675);
  expect(Number(venster[2]) + Number(venster[4])).toBeLessThan(11);
  expect(2.5 * glyphSchaal * planSchaal).toBeGreaterThanOrEqual(2.499);
  const label = /<\/g><text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)" text-anchor="(start|end)"/.exec(groep)!;
  const halfBreedte = glyphSchaal * (Math.abs(Math.cos(rotatie * Math.PI / 180)) * 10 + Math.abs(Math.sin(rotatie * Math.PI / 180)) * 12) / 2;
  expect(Math.abs(Number(label[1]))).toBeGreaterThan(halfBreedte);
  expect(label[4]).toBe(Number(label[1]) < 0 ? "end" : "start");
  expect(Number(label[3]) * planSchaal).toBeGreaterThanOrEqual(2.49);
  expect(situatieLaagSvg(situatieItems(doc, analyse, "p"), 50)).toBe(editor);
  expect(doc).toEqual(voor);
});
