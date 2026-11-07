import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { maakStrook, STANDAARD_PAPIER_A4, type SchemaElement } from "@elentrik/layout";
import { expect, test } from "vitest";
import { printHtml } from "../src/print/print-html";
import { kloon } from "./hulp";
import { leesbareSchemaOpmaak } from "../src/print/leesbaar";

function voorbeeld() {
 const doc = kloon(installatie().differentieel(300, d => d.verdeelbord(b => b.kring(k => k.automaat(20).leiding(2.5).contactdozen(2)))).bouw().doc);
 Object.values(doc.nodes).filter(n => n.type === 'contactdoos').forEach((n, i) => { n.aantal = i === 0 ? 2 : 12; });
 return doc;
}

test.each([false, true])("printaantallen blijven2,5mm buiten hun symbool zonder schema- of editorgeometrie te wijzigen (aftakking=%s)", aftakking => {
 const doc = kloon(voorbeeld());
 if (aftakking) for (const n of Object.values(doc.nodes)) if (n.type === 'contactdoos') n.aftakking = true;
 const analyse = analyseer(doc);
 const voor = maakStrook(doc, analyse, 2.5);
 const uit = leesbareSchemaOpmaak(doc, STANDAARD_PAPIER_A4, analyse);
 const symbolen = uit.strook.elementen.filter(e => e.soort === 'symbool');
 expect(symbolen.map(e => [e.nodeId, e.x, e.y, e.symbool.maat])).toEqual(voor.elementen.filter(e => e.soort === 'symbool').map(e => [e.nodeId, e.x, e.y, e.symbool.maat]));
 const aantallen = uit.strook.elementen.filter((e): e is Extract<SchemaElement, { soort: 'tekst' }> => e.soort === 'tekst' && e.rol === 'aantal');
 expect(aantallen.map(e => e.tekst).sort()).toEqual(['×12', '×2']);
 for (const tekst of aantallen) {
  expect(tekst.grootte).toBeGreaterThanOrEqual(2.5);
  const eigen = symbolen.find(e => aftakking ? e.x + e.symbool.maat.breedte / 2 === tekst.x : e.x - 1 === tekst.x && Math.abs(tekst.y - (e.y + e.symbool.maat.hoogte - 1)) < .01)!;
  expect(eigen).toBeDefined();
  if (aftakking) expect(tekst.y - tekst.grootte).toBeGreaterThanOrEqual(eigen.y + eigen.symbool.maat.hoogte);
  else expect(tekst.anker).toBe('end');
  expect(eigen.symbool.svg).not.toContain('data-rol="aantal"');
 }
 expect(maakStrook(doc, analyse, 2.5)).toEqual(voor);
 expect(voor.elementen.some(e => e.soort === 'symbool' && e.symbool.svg.includes('data-rol="aantal"'))).toBe(true);
});

test.each([0, 90, 180].flatMap(rotatie => [.25, 4].map(factor => ({ rotatie, factor }))))("geroteerde plansymbolen houden aantallen op papier leesbaar ($rotatie graden, factor $factor)", ({ rotatie, factor }) => {
 const doc = kloon(voorbeeld());
 const ids = Object.values(doc.nodes).filter(n => n.type === 'contactdoos').map(n => n.id);
 doc.situatie.paginas = [{ id: 'p', titel: 'Plan', symboolSchaal: factor, labelSchaal: .25, achtergrond: { origineelBestandId: 'o', rasterBestandId: 'r', breedte_px: 3000, hoogte_px: 2000 }, plaatsingen: ids.map((nodeId,i) => ({ nodeId, x: 400 + i * 1500, y: 800, rotatie })) }];
 const voor = kloon(doc);
 const uit = printHtml(doc, analyseer(doc), [], { papier: 'A4', onderdelen: { eendraadschema: false, situatieschema: true, kringenlijst: false, bijlage: false }, versieLabel: 'V1', datum: '2026-11-05', taal: 'nl', installateur: { naam: '' }, afbeeldingen: { r: 'p.png' } });
 const schaal = Number(uit.html.match(/data-plan-breedte-mm="([\d.]+)"/)![1]) / 3000;
 const aantallen = [...uit.html.matchAll(/<text class="tekst-aantal" x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"[^>]*>([^<]+)<\/text>/g)];
 expect(aantallen.map(m => m[4])).toEqual(['×2', '×12']);
 for (const aantal of aantallen) {
  const font = Number(aantal[3]);
  expect(font * schaal).toBeGreaterThanOrEqual(2.49);
  // Count and reference occupy separate baselines; the count is outside its rotated glyph.
  const half = 50 * factor / 2;
  expect(Number(aantal[1])).toBeGreaterThan(half * (rotatie === 90 ? 10 / 14 : 1));
  const referentieY = 50 * factor * .15;
  expect(Number(aantal[2]) - referentieY).toBeGreaterThan(font * 1.29);
 }
 for (const id of ids) expect(uit.html).toContain(`data-node-id="${id}" transform="translate(`);
 expect(uit.html).toContain(`rotate(${rotatie})`);
 expect(uit.html).not.toContain('data-rol="aantal"');
 expect(doc).toEqual(voor);
});
