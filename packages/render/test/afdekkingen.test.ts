import { expect, test } from "vitest";
import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import type { InstallatieDocument } from "@elentrik/model";
import { printHtml, situatieAfdekkingenSvg } from "../src/index";

test("afdekkingen zijn vaste witte SVG-vlakken zonder bronmarkup", () => {
  expect(situatieAfdekkingenSvg(undefined)).toBe("");
  expect(situatieAfdekkingenSvg([{ id: "vlak", x: 1, y: 2, breedte: 3, hoogte: 4 }])).toBe('<rect x="1" y="2" width="3" height="4" fill="white"/>');
});
test("afdruk zet afdekkingen boven bronbeeld en onder geplaatste symbolen", () => {
  const doc = JSON.parse(JSON.stringify(installatie().verdeelbord(b => b.kring(k => k.automaat(16).leiding(2.5).contactdozen(1))).bouw().doc)) as InstallatieDocument;
  const nodeId = analyseer(doc).kringen[0]!.puntIds[0]!;
  doc.situatie.paginas.push({ id: "p", titel: "Plan", achtergrond: { origineelBestandId: "o", rasterBestandId: "r", breedte_px: 1000, hoogte_px: 800 },
    plaatsingen: [{ nodeId, x: 10, y: 20, rotatie: 0 }], afdekkingen: [{ id: "a", x: 1, y: 2, breedte: 30, hoogte: 40 }] });
  const { html } = printHtml(doc, analyseer(doc), [], { papier: "A4", onderdelen: { situatieschema: true, eendraadschema: false, kringenlijst: false, bijlage: false }, versieLabel: "v1", datum: "2026-11-06", taal: "nl", installateur: { naam: "Test" }, afbeeldingen: { r: "plan.png" } });
  const afbeelding = html.indexOf('src="plan.png"');
  const vlak = html.indexOf('<rect x="1" y="2" width="30" height="40" fill="white"/>');
  const symbool = html.indexOf(`data-node-id="${nodeId}"`);
  expect(afbeelding).toBeGreaterThan(-1);
  expect(vlak).toBeGreaterThan(afbeelding);
  expect(symbool).toBeGreaterThan(vlak);
});
