import { expect, test } from "vitest";
import { nieuwProjectDocument, parseDocument, pasPatchesToe, voegOnderdeelToe } from "@elentrik/model";
import { analyseer } from "@elentrik/arei";
import { maakStrook } from "../src/index";

test("een contactdoos met aangesloten toestellen deelt één punt, blijft apart plaatsbaar en wordt horizontaal getekend", () => {
  const begin = nieuwProjectDocument({ klantNaam: "Bron", stroomtype: "3N400V" });
  const bord = Object.values(begin.nodes).find(n => n.type === "verdeelbord")!;
  const kring = voegOnderdeelToe(begin, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  const doos = voegOnderdeelToe(kring.doc, { soort: "aftakking", nodeId: kring.ids[1]! }, "contactdoos", { aantal: 2 });
  const koelkast = voegOnderdeelToe(doos.doc, { soort: "aftakking-einde", nodeId: doos.ids[0]! }, "toestel", { soort: "koelkast" });
  const vriezer = voegOnderdeelToe(koelkast.doc, { soort: "aftakking-einde", nodeId: koelkast.ids[0]! }, "toestel", { soort: "diepvriezer" });
  const analyse = analyseer(vriezer.doc);
  expect([doos.ids[0], koelkast.ids[0], vriezer.ids[0]].map(id => analyse.puntLabels[id!])).toEqual(["A1", "A1", "A1"]);
  expect(analyse.nietGeplaatst).toEqual([doos.ids[0], koelkast.ids[0], vriezer.ids[0]]);
  expect(parseDocument(JSON.parse(JSON.stringify(vriezer.doc)))).toEqual(vriezer.doc);
  expect(pasPatchesToe(vriezer.doc, vriezer.inversePatches)).toEqual(koelkast.doc);
  const strook = maakStrook(vriezer.doc);
  const symbolen = [doos.ids[0], koelkast.ids[0], vriezer.ids[0]].map(id => strook.elementen.find(e => e.soort === "symbool" && e.nodeId === id)!);
  for (const [i, symbool] of symbolen.entries()) {
    expect(symbool.soort).toBe("symbool");
    if (symbool.soort !== "symbool") continue;
    if (i > 0) expect(symbool.x).toBeGreaterThan((symbolen[i-1] as typeof symbool).x);
    expect(symbool.y + symbool.symbool.maat.in.y).toBeCloseTo((symbolen[0] as typeof symbool).y + (symbolen[0] as typeof symbool).symbool.maat.in.y);
  }
});
