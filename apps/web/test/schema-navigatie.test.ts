import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { schemaKeuzes, schemaInvoegKeuzes, invoegpuntBijSelectie } from "../app/editor/schema-navigatie";

const tekst = (key: string, waarden: Record<string, string | number>) => `${key}:${Object.values(waarden).join("/")}`;

test("aftakkingen hebben een kringbestemming en selectie volgt de eigen aftakking", () => {
  const start = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(start.nodes).find(n => n.type === "verdeelbord")!;
  const kring = voegOnderdeelToe(start, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  const eerste = voegOnderdeelToe(kring.doc, { soort: "aftakking", nodeId: kring.ids[1]! }, "schakelaar");
  const tweede = voegOnderdeelToe(eerste.doc, { soort: "aftakking", nodeId: kring.ids[1]! }, "lichtpunt");
  const einde = voegOnderdeelToe(tweede.doc, { soort: "aftakking-einde", nodeId: eerste.ids[0]! }, "lichtpunt");
  const analyse = analyseer(einde.doc);
  const keuzes = schemaInvoegKeuzes(einde.doc, analyse, [
    { soort: "rail-einde", nodeId: bord.id },
    { soort: "aftakking-einde", nodeId: tweede.ids[0]! },
    { soort: "aftakking-einde", nodeId: einde.ids[0]! },
  ], type => type, tekst);
  expect(keuzes.map(k => k.label)).toEqual(["kringBestemming:A/A1", "kringBestemming:A/A2", "rechtstreeksOpBord:verdeelbord 1"]);
  expect(invoegpuntBijSelectie(analyse, keuzes, eerste.ids[0]!)).toEqual(keuzes[0]);
  expect(invoegpuntBijSelectie(analyse, keuzes, tweede.ids[0]!)).toEqual(keuzes[1]);
});

test("invoegen volgt de geselecteerde kring en valt niet terug op een andere kring", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  for (let i = 0; i < 2; i++) doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
  const analyse = analyseer(doc);
  const [a, b] = analyse.kringen;
  const punten = analyse.kringen.map(k => ({ soort: "kring-einde" as const, nodeId: k.puntIds[0]! }));
  expect(invoegpuntBijSelectie(analyse, punten, b!.beveiligingId)).toEqual(punten[1]);
  expect(invoegpuntBijSelectie(analyse, punten.slice(0, 1), b!.puntIds[0]!)).toBeUndefined();
  expect(invoegpuntBijSelectie(analyse, punten, a!.puntIds[0]!)).toEqual(punten[0]);
  expect(invoegpuntBijSelectie(analyse, punten, "ontbreekt")).toBeUndefined();
});

test("invoegkeuzes scheiden bestaande kringen van nieuwe en sorteren Z vóór AA", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  for (let i = 0; i < 28; i++) doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
  const analyse = analyseer(doc);
  const punten = analyse.kringen.map(k => ({ soort: "kring-einde" as const, nodeId: k.puntIds[0]! })).reverse();
  const keuzes = schemaInvoegKeuzes(doc, analyse, [{ soort: "rail-einde", nodeId: bord.id }, ...punten], type => type, tekst);
  expect(keuzes.slice(0, 28).map(k => analyse.puntLabels[k.nodeId])).toEqual(analyse.kringen.map(k => `${k.label}1`));
  expect(keuzes.at(-1)?.nodeId).toBe(bord.id);
  expect(keuzes[0]?.label).toBe("kringBestemming:A/A1");
  expect(punten[0]?.nodeId).toBe(analyse.kringen.at(-1)?.puntIds[0]);
});

test("gelijke differentiëlen hebben verschillende herkenbare labels binnen hun bord", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  for (let i = 0; i < 2; i++) doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "differentieel").doc;
  const diffs = Object.values(doc.nodes).filter(n => n.type === "differentieel" && n.parentId === bord.id);
  doc = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: diffs[0]!.id }, "lichtpunt").doc;
  const keuzes = schemaInvoegKeuzes(doc, analyseer(doc), diffs.map(d => ({ soort: "rail-einde" as const, nodeId: d.id })).reverse(), type => type, tekst);
  expect(keuzes.map(k => k.nodeId)).toEqual(diffs.map(d => d.id));
  expect(keuzes[0]?.label).toMatch(/^differentieel 1 · \d+ A \/ \d+ mA/);
  expect(keuzes[0]?.label).toContain("voorKringen:A");
  expect(keuzes[1]?.label).toMatch(/^differentieel 2 ·/);
  expect(keuzes.every(k => k.bordId === bord.id)).toBe(true);
});

test("de toetsenbordlijst bevat alle structurele nodes in elektrische volgorde", () => {
  const start = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(start.nodes).find(n => n.type === "verdeelbord")!;
  const doc = voegOnderdeelToe(start, { soort: "rail-einde", nodeId: bord.id }, "contactdoos").doc;
  const keuzes = schemaKeuzes(doc, analyseer(doc), type => type);
  expect(keuzes.map(k => k.id).sort()).toEqual(Object.keys(doc.nodes).sort());
  expect(keuzes[0]!.id).toBe(doc.rootId);
  for (const node of Object.values(doc.nodes)) {
    if (node.parentId) expect(keuzes.findIndex(k => k.id === node.parentId)).toBeLessThan(keuzes.findIndex(k => k.id === node.id));
  }
  expect(keuzes.find(k => doc.nodes[k.id]?.type === "automaat")?.label).toContain("A");
  expect(keuzes.find(k => doc.nodes[k.id]?.type === "leiding")?.label).toContain("A");
  expect(keuzes.find(k => doc.nodes[k.id]?.type === "contactdoos")?.label).toContain("A1");
});

test("de keuzelijst behoudt eigen omschrijvingen zonder de kringidentiteit te verliezen", () => {
  const start = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(start.nodes).find(n => n.type === "verdeelbord")!;
  const resultaat = voegOnderdeelToe(start, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt");
  const doc = structuredClone(resultaat.doc);
  const licht = Object.values(doc.nodes).find(n => n.type === "lichtpunt")!;
  licht.label = "Plafond keuken";
  const keuze = schemaKeuzes(doc, analyseer(doc), type => `type:${type}`).find(k => k.id === licht.id)!;
  expect(keuze.label).toBe("A1 · type:lichtpunt · Plafond keuken");
});
