import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe } from "@elentrik/model";
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
  doc = structuredClone(doc);
  doc.meta.installatieContext = "nieuw";
  doc.meta.werfadres = { straat: "Teststraat", nummer: "1", postcode: "1000", gemeente: "Brussel", land: "België" };
  const ids = [...analyseer(doc).nietGeplaatst, bord.id];
  doc.situatie.paginas = [{ id: "plan", titel: "Test", achtergrond: { origineelBestandId: "test", rasterBestandId: "test", breedte_px: 100, hoogte_px: 100 }, plaatsingen: ids.map(nodeId => ({ nodeId, x: 10, y: 10, rotatie: 0 })) }];
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: true, ongeplaatst: 0, plannen: 1, ontbreekt: [] });
  doc.situatie.paginas.push({ id: "verdieping", titel: "Verdieping", plaatsingen: [] });
  expect(dossierStatus(doc, analyseer(doc))).toMatchObject({ volledig: false, zonderPlan: 1 });
});
