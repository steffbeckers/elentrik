import { expect, test } from "vitest";
import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { plaats, pasPatchesToe, verwijder, voegOnderdeelToe, voegPaginaToe } from "@elentrik/model";
import { opmaak } from "@elentrik/layout";
import { kringenlijst, NL, printHtml, schemaStripSvg, situatieItems } from "../src/index";

test("aftakkingsreferenties blijven gelijk op schema, plan, kringenlijst en PDF; verwijderen en undo herstellen plaatsingen", () => {
  const basis = installatie().verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(1.5).als("leiding"))).bouw();
  const a = voegOnderdeelToe(basis.doc, { soort: "aftakking", nodeId: basis.ids.leiding! }, "schakelaar", { soort: "wissel" });
  const b = voegOnderdeelToe(a.doc, { soort: "aftakking-einde", nodeId: a.ids[0]! }, "schakelaar", { soort: "wissel" });
  const c = voegOnderdeelToe(b.doc, { soort: "aftakking-einde", nodeId: b.ids[0]! }, "lichtpunt", { aantal: 2 });
  const pagina = voegPaginaToe(c.doc, "Plan");
  let doc = pagina.doc;
  for (const [i, id] of [a.ids[0]!, b.ids[0]!, c.ids[0]!].entries()) doc = plaats(doc, pagina.id, id, { x: i * 100, y: 100, rotatie: i * 90 }).doc;
  const analyse = analyseer(doc);
  expect(kringenlijst(doc, analyse, NL).map((r) => r.punt)).toEqual(["A1", "A1", "A1"]);
  const items = situatieItems(doc, analyse, pagina.id);
  expect(items.map((r) => r.label)).toEqual(["A1", "A1", "A1"]);
  expect(items.map((r) => r.rotatie)).toEqual([0, 90, 180]);
  // Het plan blijft de gewone, afzonderlijk draaibare symbolen gebruiken.
  for (const item of items) expect(item.symbool.maat.in.y).toBe(item.symbool.maat.hoogte);
  const svg = schemaStripSvg(opmaak(doc));
  expect(svg.match(/>A1<\/text>/g)).toHaveLength(1);
  expect(svg).toContain("2×");
  const pdf = printHtml(doc, analyse, [], {
    papier: "A4", onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: false, bijlage: false },
    taal: "nl", datum: "2026-11-01", versieLabel: "v1", installateur: { naam: "Voorbeeld" }, afbeeldingen: {},
  });
  // Eén schemablad, plus de slotpagina met metingen (export zonder bijlage).
  expect(pdf.paginas).toBe(2);
  expect(pdf.html.split('<section class="pagina">').at(-1)).toContain('<div class="bijlage metingen"');
  expect(pdf.html.match(/>A1<\/text>/g)).toHaveLength(1);
  expect(pdf.html.match(/<text class="tekst-aantal"[^>]*font-size="2.5"[^>]*>×2<\/text>/g)).toHaveLength(1);
  const weg = verwijder(doc, a.ids[0]!);
  expect(situatieItems(weg.doc, analyseer(weg.doc), pagina.id)).toEqual([]);
  expect(pasPatchesToe(weg.doc, weg.inversePatches)).toEqual(doc);
});
