import { expect, test } from "vitest";
import { nieuwProjectDocument, voegOnderdeelToe, voegSjabloonToe } from "@elentrik/model";
import { analyseer, controleer, haalRegelset } from "../src/index";

const regelset = haalRegelset("arei-2020@1");
function onbeschermd(context?: "nieuw" | "bestaand" | "onbekend") {
  const origineel = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const doc: typeof origineel = JSON.parse(JSON.stringify(origineel));
  delete doc.meta.installatieContext;
  if (context) doc.meta.installatieContext = context;
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  return voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "lichtpunt").doc;
}
test("gewone verlichting zonder aanvullende 30 mA wordt een fout voor nieuwe installatie", () => {
  const doc = onbeschermd("nieuw");
  expect(controleer(doc, regelset)).toContainEqual(expect.objectContaining({
    regelId: "arei.differentieel.aanvullend", ernst: "fout", afgeweken: false,
  }));
});
test("een algemeen differentieel van 30 mA vervangt de aanvullende differentieel niet", () => {
  const origineel = onbeschermd("nieuw");
  const doc: typeof origineel = JSON.parse(JSON.stringify(origineel));
  const algemeen = doc.nodes[analyseer(doc).algemeenDifferentieelId!];
  if (algemeen?.type !== "differentieel") throw new Error("test vereist algemeen differentieel");
  algemeen.gevoeligheid_mA = 30;
  expect(controleer(doc, regelset)).toContainEqual(expect.objectContaining({ regelId: "arei.differentieel.aanvullend", ernst: "fout" }));
});
test.each([undefined, "bestaand", "onbekend"] as const)("context %s kent geen automatische uitzondering toe", context => {
  expect(controleer(onbeschermd(context), regelset)).toContainEqual(expect.objectContaining({
    regelId: "arei.differentieel.aanvullend", ernst: "waarschuwing", afgeweken: false,
  }));
});
test.each(["kring-stopcontacten", "kring-verlichting"])("sjabloon %s beschermt alle gewone punten aanvullend", naam => {
  const doc = nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  const gebouwd = voegSjabloonToe(doc, bord.id, naam).doc;
  for (const keten of Object.values(analyseer(gebouwd).ketens)) {
    expect(keten.differentielen.some(id => {
      const n = gebouwd.nodes[id]; return n?.type === "differentieel" && n.gevoeligheid_mA <= 30;
    })).toBe(true);
  }
  expect(controleer(gebouwd, regelset).filter(b => b.regelId === "arei.differentieel.aanvullend")).toEqual([]);
});
