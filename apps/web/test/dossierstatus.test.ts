import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe, PLAATSBARE_TYPES } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { dossierStatus } from "../app/editor/dossierstatus";

test("een dossier zonder plan is onvolledig, los van elektrische fouten", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
  const s = dossierStatus(doc, analyseer(doc));
  expect(s.plannen).toBe(0);
  expect(s.ongeplaatst).toBeGreaterThanOrEqual(1);
  expect(s.ontbreekt).toContain("werfadres");
  expect(s.ontbreekt).toContain("context");
  expect(s.volledig).toBe(false);
});

test("nul of lege gegevens worden niet als een afgewerkt dossier voorgesteld", () => {
  expect(dossierStatus(null, null).volledig).toBe(false);
  const doc = nieuwProjectDocument({ klantNaam: "  ", stroomtype: "2x230V" });
  expect(dossierStatus(doc, analyseer(doc)).ontbreekt).toContain("klant");
});

test("ingevulde gegevens en geplaatste onderdelen maken de checklist compleet; een pagina zonder plan niet", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
  const aarding = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "aardingsonderbreker");
  const elektrode = voegOnderdeelToe(aarding.doc, { soort: "kring-einde", nodeId: aarding.ids[0]! }, "aardelektrode");
  doc = elektrode.doc;
  doc = structuredClone(doc);
  doc.meta.installatieContext = "nieuw";
  doc.meta.werfadres = { straat: "Teststraat", nummer: "1", postcode: "1000", gemeente: "Brussel", land: "België" };
  const ids = Object.values(doc.nodes).filter(n => (PLAATSBARE_TYPES as readonly string[]).includes(n.type)).map(n => n.id);
  doc.situatie.paginas = [{ id: "plan", titel: "Test", achtergrond: { origineelBestandId: "test", rasterBestandId: "test", breedte_px: 100, hoogte_px: 100 }, plaatsingen: ids.map(nodeId => ({ nodeId, x: 10, y: 10, rotatie: 0 })) }];
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: true, ongeplaatst: 0, plannen: 1, ontbreekt: [] });
  const allePlaatsingen = doc.situatie.paginas[0]!.plaatsingen;
  const teller = Object.values(doc.nodes).find(n => n.type === "teller")!;
  doc.situatie.paginas[0]!.plaatsingen = allePlaatsingen.filter(p => p.nodeId !== teller.id);
  expect(analyseer(doc).nietGeplaatst).toEqual([]);
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: false, ongeplaatst: 1 });
  doc.situatie.paginas[0]!.plaatsingen = allePlaatsingen.filter(p => ![aarding.ids[0], elektrode.ids[0]].includes(p.nodeId));
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: false, ongeplaatst: 2 });
  doc.situatie.paginas[0]!.plaatsingen = allePlaatsingen;
  doc.situatie.paginas.push({ id: "verdieping", titel: "Verdieping", plaatsingen: [] });
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: false, zonderPlan: 1 });
});
