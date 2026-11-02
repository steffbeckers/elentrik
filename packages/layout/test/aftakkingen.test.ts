import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe, voegToe } from "@elentrik/model";
import { maakStrook, STANDAARD_PAPIER_A4, type SchemaElement } from "../src/index";
import { pagineer } from "../src/paginering";

function voorbeeld(lengtes = [2, 3, 1]) {
  let doc = nieuwProjectDocument({ klantNaam: "Voorbeeld", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  const kring = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  doc = kring.doc;
  const leiding = kring.ids[1]!;
  const takken: string[][] = [];
  for (const lengte of lengtes) {
    const ids: string[] = [];
    for (let i = 0; i < lengte; i++) {
      const r = voegOnderdeelToe(doc, { soort: i ? "aftakking-einde" : "aftakking", nodeId: i ? ids.at(-1)! : leiding },
        i === lengte - 1 && lengte > 1 ? "lichtpunt" : "schakelaar", { soort: i === lengte - 1 && lengte > 1 ? "led" : "wissel" });
      doc = r.doc;
      ids.push(r.ids[0]!);
    }
    takken.push(ids);
  }
  return { doc, takken, leiding, bord: bord.id };
}
type SymboolElement = Extract<SchemaElement, { soort: "symbool" }>;

test("drie aftakkingen staan van onder naar boven, elke keten loopt horizontaal naar rechts", () => {
  const { doc, takken, leiding } = voorbeeld();
  const s = maakStrook(doc);
  const symbolen = s.elementen.filter((e): e is SymboolElement => e.soort === "symbool");
  const sym = (id: string) => symbolen.find((e) => e.nodeId === id)!;
  const midden = (id: string) => { const e = sym(id); return e.y + e.symbool.maat.in.y; };
  for (const ids of takken) {
    for (const [i, id] of ids.entries()) {
      expect(midden(id)).toBeCloseTo(midden(ids[0]!));
      expect(sym(id).x).toBeGreaterThan(i ? sym(ids[i - 1]!).x + sym(ids[i - 1]!).symbool.maat.breedte : sym(leiding).x);
      expect(s.vakken[id]).toEqual({ x: sym(id).x, y: sym(id).y, breedte: sym(id).symbool.maat.breedte, hoogte: sym(id).symbool.maat.hoogte });
    }
    const laatste = sym(ids.at(-1)!);
    const a = s.aanknopingen.find((a) => a.nodeId === laatste.nodeId)!;
    expect(a.soort).toBe("aftakking-einde");
    expect(a.y).toBeCloseTo(midden(laatste.nodeId));
    expect(a.x).toBeGreaterThan(laatste.x + laatste.symbool.maat.breedte);
  }
  expect(midden(takken[0]![0]!)).toBeGreaterThan(midden(takken[1]![0]!));
  expect(midden(takken[1]![0]!)).toBeGreaterThan(midden(takken[2]![0]!));
  expect(s.elementen.filter((e) => e.soort === "tekst" && e.rol === "punt").map((e) => e.soort === "tekst" && e.tekst)).toEqual(["A1", "A2", "A3"]);
});

test("een bestaande verticale keten en een naburige kring blijven vrij van de aftakkingen", () => {
  const v = voorbeeld([4, 2]);
  const oud = voegToe(v.doc, v.leiding, { type: "lichtpunt", aantal: 1 });
  const buur = voegOnderdeelToe(oud.doc, { soort: "rail-einde", nodeId: v.bord }, "contactdoos");
  const s = maakStrook(buur.doc);
  const vakken = Object.values(s.vakken);
  for (let i = 0; i < vakken.length; i++) for (let j = i + 1; j < vakken.length; j++) {
    const a = vakken[i]!, b = vakken[j]!;
    expect(a.x + a.breedte <= b.x || b.x + b.breedte <= a.x || a.y + a.hoogte <= b.y || b.y + b.hoogte <= a.y).toBe(true);
  }
  const topTak = s.vakken[v.takken[1]![0]!]!;
  expect(s.vakken[oud.id]!.y + s.vakken[oud.id]!.hoogte).toBeLessThan(topTak.y);
});

test("lange aftakkingen krijgen veilige PDF-knippen tussen symbolen", () => {
  const { doc } = voorbeeld([30, 12]);
  const strook = maakStrook(doc);
  const paginas = pagineer(strook, STANDAARD_PAPIER_A4).paginas;
  expect(paginas.length).toBeGreaterThan(1);
  const ids = paginas.flatMap((p) => p.elementen.filter((e) => e.soort === "symbool").map((e) => e.soort === "symbool" && e.nodeId));
  expect(new Set(ids).size).toBe(Object.keys(doc.nodes).length);
  for (const p of paginas) for (const e of p.elementen) if (e.soort === "symbool") {
    expect(e.x).toBeGreaterThanOrEqual(p.xVan);
    expect(e.x + e.symbool.maat.breedte).toBeLessThanOrEqual(p.xTot);
  }
  expect(paginas.flatMap((p) => p.elementen).some((e) => e.soort === "vervolg")).toBe(true);
});

test("PDF-knippen zijn veilig voor alle aftakkingsblokken in dezelfde kolom", () => {
  const v = voorbeeld([30]);
  const l = voegToe(v.doc, v.leiding, { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 1.5, aantalGeleiders: 3 });
  let doc = l.doc;
  let vorige = l.id;
  for (let i = 0; i < 30; i++) {
    const r = voegOnderdeelToe(doc, { soort: i ? "aftakking-einde" : "aftakking", nodeId: vorige }, "lichtpunt", { aantal: 99999999999999 });
    doc = r.doc;
    vorige = r.ids[0]!;
  }
  const strook = maakStrook(doc);
  const paginas = pagineer(strook, STANDAARD_PAPIER_A4).paginas;
  for (const p of paginas) for (const e of p.elementen) if (e.soort === "symbool") {
    expect(e.x, `linkerrand ${e.nodeId} op pagina ${p.index}`).toBeGreaterThanOrEqual(p.xVan);
    expect(e.x + e.symbool.maat.breedte, `rechterrand ${e.nodeId} op pagina ${p.index}`).toBeLessThanOrEqual(p.xTot);
  }
});
