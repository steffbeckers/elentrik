import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { dossierStatus, kiesOngeplaatst, ongeplaatsteOnderdelen } from "../app/editor/dossierstatus";

function document() {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
  doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "aardingsonderbreker").doc;
  return doc;
}

test("de checklist noemt elk ongeplaatst onderdeel bij naam", () => {
  const doc = document();
  const analyse = analyseer(doc);
  const status = dossierStatus(doc, analyse);
  const namen = ongeplaatsteOnderdelen(doc, analyse, status.ongeplaatsteIds, "nl").map(o => o.naam);
  expect(namen).toHaveLength(status.ongeplaatst);
  expect(namen.some(n => /A1|^[A-Z]\d/.test(n))).toBe(true);
  expect(namen.join("|").toLowerCase()).toContain("aardingsonderbreker");
  expect(namen.every(n => n !== "")).toBe(true);
});

test("een klik selecteert het onderdeel op het eendraadschema", () => {
  const store = { selectie: [] as string[], tabblad: "situatieschema" };
  kiesOngeplaatst(store, "n1");
  expect(store).toEqual({ selectie: ["n1"], tabblad: "eendraadschema" });
});
