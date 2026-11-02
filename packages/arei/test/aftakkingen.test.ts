import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe } from "@elentrik/model";
import { analyseer } from "../src/index";

test("aftakkingen delen één puntnummer maar behouden fysieke aantallen en afzonderlijke ketens", () => {
  let doc = nieuwProjectDocument({ klantNaam: "Voorbeeld", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
  const kring = voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "leiding");
  doc = kring.doc;
  const leiding = kring.ids[1]!;
  const takken: string[][] = [];
  for (const lengte of [2, 3, 1]) {
    const ids: string[] = [];
    for (let i = 0; i < lengte; i++) {
      const r = voegOnderdeelToe(doc, { soort: i === 0 ? "aftakking" : "aftakking-einde", nodeId: i === 0 ? leiding : ids.at(-1)! },
        i === lengte - 1 && lengte > 1 ? "lichtpunt" : "schakelaar", i === 1 && lengte === 2 ? { aantal: 2 } : undefined);
      doc = r.doc;
      ids.push(r.ids[0]!);
    }
    takken.push(ids);
  }
  const a = analyseer(doc);
  expect(takken.map((ids) => ids.map((id) => a.puntLabels[id]))).toEqual([["A1", "A1"], ["A2", "A2", "A2"], ["A3"]]);
  expect(a.kringen[0]!.tellingen).toEqual({ contactdozen: 0, lichtpunten: 3, schakelaars: 4, toestellen: 0 });
  expect(a.kringen[0]!.puntIds).toHaveLength(6);
  for (const id of takken.flat()) expect(a.ketens[id]!.leidingId).toBe(leiding);
});
