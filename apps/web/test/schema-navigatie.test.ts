import { invoegBestemmingen } from "../app/editor/invoegen";
import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe, wijzigEigenschappen, voegToe } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { schemaKeuzes, schemaInvoegKeuzes, invoegpuntBijSelectie, invoegDoelKeuzes } from "../app/editor/schema-navigatie";

const tekst = (key: string, waarden: Record<string, string | number>) => `${key}:${Object.values(waarden).join("/")}`;

test("gegenereerde volgnummers botsen niet met een bestaande genummerde omschrijving", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  let einde = { soort: "rail-einde" as const, nodeId: bord.id } as Parameters<typeof voegOnderdeelToe>[1];
  const ids: string[] = [];
  for (const label of ["Keuken", "Keuken", "Keuken 1"]) {
    const resultaat = voegOnderdeelToe(doc, einde, "schakelaar");
    doc = structuredClone(resultaat.doc);
    const id = resultaat.ids.at(-1)!;
    doc.nodes[id]!.label = label;
    ids.push(id);
    einde = { soort: "kring-einde", nodeId: id };
  }
  const analyse = analyseer(doc);
  for (const id of ids) analyse.puntLabels[id] = "B2";
  const keuzes = schemaKeuzes(doc, analyse, type => type).filter(k => ids.includes(k.id));
  expect(new Set(keuzes.map(k => k.label)).size).toBe(3);
  expect(keuzes.map(k => k.id)).toEqual(ids);
  expect(ids.map(id => doc.nodes[id]!.label)).toEqual(["Keuken", "Keuken", "Keuken 1"]);
  expect(ids.map(id => analyse.puntLabels[id])).toEqual(["B2", "B2", "B2"]);
});

test("gelijke puntnamen blijven onderscheidbaar zonder opgeslagen codes te wijzigen", () => {
  const start = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(start.nodes).find(n => n.type === "verdeelbord")!;
  const eerste = voegOnderdeelToe(start, { soort: "rail-einde", nodeId: bord.id }, "schakelaar");
  const tweede = voegOnderdeelToe(eerste.doc, { soort: "kring-einde", nodeId: eerste.ids.at(-1)! }, "schakelaar");
  const analyse = analyseer(tweede.doc);
  const schakelaars = Object.values(tweede.doc.nodes).filter(n => n.type === "schakelaar");
  for (const n of schakelaars) analyse.puntLabels[n.id] = "B2";
  const keuzes = schemaKeuzes(tweede.doc, analyse, type => type).filter(k => schakelaars.some(n => n.id === k.id));
  expect(keuzes.map(k => k.label)).toEqual(["B2 · schakelaar 1", "B2 · schakelaar 2"]);
  expect(schakelaars.map(n => analyse.puntLabels[n.id])).toEqual(["B2", "B2"]);
});

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

test('all destination selectors preserve explicit RCD reference F', () => {
  const start = nieuwProjectDocument({ klantNaam: 'Test', stroomtype: '2x230V' });
  const bord = Object.values(start.nodes).find(n => n.type === 'verdeelbord')!;
  const added = voegOnderdeelToe(start, { soort: 'rail-einde', nodeId: bord.id }, 'differentieel');
  const doc = structuredClone(added.doc);
  const diff = doc.nodes[added.ids[0]!]!;
  if (diff.type !== 'differentieel') throw new Error('expected differential');
  diff.referentie = 'F';
  const analyse = analyseer(doc);
  expect(schemaKeuzes(doc, analyse, type => type).find(k => k.id === diff.id)!.label).toContain('F');
  expect(schemaInvoegKeuzes(doc, analyse, [{ soort:'rail-einde', nodeId:diff.id }], type => type, tekst)[0]!.label).toContain('F');
  expect(invoegDoelKeuzes(doc, analyse, [{soort:'bestaande-differentieel',nodeId:diff.id}], type => type, soort => soort)[0]!.label).toContain('F');
});

test('template and lighting targets distinguish equal boards and unnamed differentials without ordinal collisions', () => {
  let doc = nieuwProjectDocument({ klantNaam:'Test',stroomtype:'2x230V' });
  const bord = Object.values(doc.nodes).find(n => n.type === 'verdeelbord')!;
  doc = wijzigEigenschappen(doc, bord.id, {naam:'Garage'}).doc;
  const tweede = voegToe(doc, bord.parentId!, {type:'verdeelbord',naam:'Garage'});
  const derde = voegToe(tweede.doc, bord.parentId!, {type:'verdeelbord',naam:'Garage 1'});
  doc = derde.doc;
  for (const label of [undefined, undefined, 'Keuken', 'Keuken', 'Keuken 1']) {
    const r = voegOnderdeelToe(doc,{soort:'rail-einde',nodeId:bord.id},'differentieel');
    doc = label ? wijzigEigenschappen(r.doc,r.ids[0]!,{label}).doc : r.doc;
  }
  const analyse = analyseer(doc);
  const doelen = invoegBestemmingen(doc);
  const before = JSON.stringify(doc);
  const keuzes = invoegDoelKeuzes(doc,analyse,doelen,type=>type,soort=>soort);
  expect(new Set(keuzes.map(k=>k.label)).size).toBe(keuzes.length);
  expect(keuzes.map(k=>k.value)).toEqual(doelen.map(d=>`${d.soort}:${d.nodeId}`));
  const diffKeuzes = keuzes.filter(k=>k.value.startsWith('bestaande-differentieel:'));
  expect(diffKeuzes.every(k=>k.label.includes('Garage'))).toBe(true);
  const navigatie = schemaInvoegKeuzes(doc,analyse,doelen.map(d=>({soort:'rail-einde',nodeId:d.nodeId})),type=>type,tekst);
  expect(new Set(navigatie.filter(k=>doc.nodes[k.nodeId]!.type==='verdeelbord').map(k=>k.bord)).size).toBe(3);
  for (const k of navigatie.filter(k => doc.nodes[k.nodeId]!.type === 'verdeelbord')) {
    expect(keuzes.find(item => item.value === `nieuw-op-bord:${k.nodeId}`)!.label).toContain(k.bord);
  }
  expect(JSON.stringify(doc)).toBe(before);
});
