import { expect, test } from "vitest";
import { analyseer } from "@elentrik/arei";
import { NodeSchema, nieuwProjectDocument, voegOnderdeelToe, voegToe, wijzigEigenschappen, wijzigProject, pasPatchesToe, materiaallijst, PLAATSBARE_TYPES, valideerStructuur } from "@elentrik/model";
import { maakStrook } from "../src/kolommen";

function basis() {
  const doc = nieuwProjectDocument({ klantNaam: "Bron", stroomtype: "3N400V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  return { doc, bord };
}

test("aarding voegt eigen plaatsbare onderdelen toe zonder eindkring of puntnummer", () => {
  const { doc, bord } = basis();
  const a = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "aardingsonderbreker");
  const e = voegOnderdeelToe(a.doc, { soort: "kring-einde", nodeId: a.ids[0]! }, "aardelektrode");
  expect(valideerStructuur(e.doc)).toEqual([]);
  expect(analyseer(e.doc).kringen).toHaveLength(0);
  expect(PLAATSBARE_TYPES).toEqual(expect.arrayContaining(["teller", "aardingsonderbreker", "aardelektrode"]));
  expect(materiaallijst(e.doc).map(r => r.type)).toEqual(expect.arrayContaining(["aardingsonderbreker", "aardelektrode"]));
  expect(maakStrook(e.doc).elementen.filter(e => e.soort === "symbool")).toHaveLength(Object.keys(e.doc.nodes).length);
  expect(pasPatchesToe(e.doc, e.inversePatches)).toEqual(a.doc);
});

test("aarding krijgt een afzonderlijke PE-sectie zonder elektrische verbinding naar de faserail", () => {
  const { doc, bord } = basis();
  const c = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "contactdoos");
  const a = voegOnderdeelToe(c.doc, { soort: "rail-einde", nodeId: bord.id }, "aardingsonderbreker");
  const e = voegOnderdeelToe(a.doc, { soort: "kring-einde", nodeId: a.ids[0]! }, "aardelektrode");
  const strook = maakStrook(e.doc);
  const earth = strook.vakken[e.ids[0]!]!;
  const disc = strook.vakken[a.ids[0]!]!;
  expect(strook.elementen.some(e => e.soort === "tekst" && e.tekst.startsWith("PE"))).toBe(true);
  const voedingsLijnen = strook.elementen.filter(e => e.soort === "lijn" && e.rol !== "aarding");
  expect(voedingsLijnen.every(e => e.soort !== "lijn" || Math.max(e.x1, e.x2) < disc.x)).toBe(true);
  expect(earth.y).toBeGreaterThan(disc.y);
  expect(strook.elementen.some(e => e.soort === "lijn" && e.rol === "aarding" && e.y1 === disc.y + disc.hoogte && e.y2 === earth.y)).toBe(true);
});

test("bronparameters verschijnen bij glyphs zonder kVA naar W om te zetten", () => {
  const { doc, bord } = basis();
  const c = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "toestel", { soort: "omvormer" });
  const omvormer = c.ids.at(-1)!;
  const w = wijzigEigenschappen(c.doc, omvormer, { schijnbaarVermogen_kVA: 10 });
  const pv = voegToe(w.doc, omvormer, { type: "toestel", soort: "pvPaneel", aantalPanelen: 20, puntReferentie: "geen" });
  const ev = voegToe(pv.doc, pv.id, { type: "toestel", soort: "laadpaal", dcDetectie_mA: 6 });
  const teller = Object.values(ev.doc.nodes).find(n => n.type === "teller")!;
  const t = wijzigEigenschappen(ev.doc, teller.id, { nominaal_A: 40 });
  const f = wijzigProject(t.doc, { frequentie_Hz: 50 });
  const tekst = maakStrook(f.doc).elementen.flatMap(e => e.soort === "tekst" ? [e.tekst] : []).join(" | ");
  expect(tekst).toContain("10 kVA");
  expect(tekst).toContain("×20");
  expect(tekst).toContain("6 mA DC");
  expect(tekst).toContain("40 A");
  expect(tekst).toContain("50 Hz");
  expect(f.doc.nodes[omvormer]).not.toHaveProperty("vermogen_W");
  const analyse = analyseer(f.doc);
  expect(analyse.puntLabels[omvormer]).toBe("A1");
  expect(analyse.puntLabels[pv.id]).toBeUndefined();
  expect(analyse.puntLabels[ev.id]).toBe("A2");
  expect(analyse.kringen[0]!.puntIds).toContain(pv.id);
  expect(analyse.nietGeplaatst).toContain(pv.id);
  expect(materiaallijst(f.doc).find(r => r.eigenschappen.soort === "pvPaneel")?.hoeveelheid).toBe(20);
});

test.each([{ aantalPanelen: 0 }, { aantalPanelen: 1.5 }, { schijnbaarVermogen_kVA: -1 }, { dcDetectie_mA: 0 }])("bronparameters weigeren ongeldige waarden %o", data => {
  expect(NodeSchema.safeParse({ id: "p", parentId: "l", kinderen: [], type: "toestel", soort: "pvPaneel", ...data }).success).toBe(false);
});

test("technische annotaties blijven zichtbaar in horizontale puntgroepen en onbekende bronidentiteit blijft gemarkeerd", () => {
  const { doc, bord } = basis();
  const c = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  const a = voegToe(c.doc, c.ids.at(-1)!, { type: "toestel", soort: "laadpaal", aftakking: true, dcDetectie_mA: 6 });
  const b = voegToe(a.doc, a.id, { type: "toestel", soort: "onbekendDrieblad", aftakking: true });
  const strook = maakStrook(b.doc);
  const teksten = strook.elementen.flatMap(e => e.soort === "tekst" ? [e.tekst] : []);
  expect(teksten).toContain("6 mA DC");
  expect(teksten).toContain("?");
});

test("een onderdrukte groepsreferentie splitst de gedeelde nummering van andere onderdelen niet", () => {
  const { doc, bord } = basis();
  const c = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  const a = voegToe(c.doc, c.ids.at(-1)!, { type: "toestel", soort: "pvPaneel", aftakking: true, puntReferentie: "geen" });
  const b = voegToe(a.doc, a.id, { type: "toestel", soort: "omvormer", aftakking: true });
  const d = voegToe(b.doc, b.id, { type: "toestel", soort: "pvPaneel", aftakking: true, puntReferentie: "geen" });
  const e = voegToe(d.doc, d.id, { type: "toestel", soort: "omvormer", aftakking: true });
  const analyse = analyseer(e.doc);
  expect(analyse.puntLabels[a.id]).toBeUndefined();
  expect(analyse.puntLabels[d.id]).toBeUndefined();
  expect(analyse.puntLabels[b.id]).toBe("A1");
  expect(analyse.puntLabels[e.id]).toBe("A1");
  expect(maakStrook(e.doc).elementen.filter(e => e.soort === "tekst" && e.rol === "punt").map(e => e.soort === "tekst" && e.tekst)).toEqual(["A1"]);
});
