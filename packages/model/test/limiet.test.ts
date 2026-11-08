import { expect, test } from "vitest";
import * as m from "../src/index";
import { overschrijdtLimiet, telVoorLimiet } from "../src/limiet";

function testDocument() {
  let doc = m.nieuwProjectDocument({ klantNaam: "Test", stroomtype: "2x230V" });
  const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!.id;
  for (let i = 0; i < 3; i++) doc = m.voegToe(doc, bord, m.NIEUWE_KRING_AUTOMAAT).doc;
  for (let i = 0; i < 2; i++)
    doc = m.voegToe(doc, bord, { type: "zekering", nominaal_A: 16 }).doc;
  doc = m.voegToe(doc, bord, m.STANDAARD.differentieel).doc;
  doc = m.voegPaginaToe(doc, "Pagina 1").doc;
  const blad = m.voegPaginaToe(doc, "Referentieblad");
  doc = m.zetReferentiePagina(blad.doc, blad.id, true).doc;
  return doc;
}

test("telt automaten en zekeringen als kringen", () => {
  const doc = testDocument();
  expect(telVoorLimiet(doc)).toEqual({
    kringen: 5,
    situatieschemas: doc.situatie.paginas.length,
  });
  expect(doc.situatie.paginas.length).toBe(2);
});
test("nieuw project boven de limiet", () =>
  expect(overschrijdtLimiet(null, { kringen: 6, situatieschemas: 1 }, { kringen: 5, situatieschemas: 1 })).toBe(true));
test("binnen de limiet", () =>
  expect(overschrijdtLimiet(null, { kringen: 5, situatieschemas: 1 }, { kringen: 5, situatieschemas: 1 })).toBe(false));
test("boven de limiet maar dalend of gelijk is toegestaan", () => {
  const l = { kringen: 5, situatieschemas: 1 };
  expect(overschrijdtLimiet({ kringen: 8, situatieschemas: 1 }, { kringen: 7, situatieschemas: 1 }, l)).toBe(false);
  expect(overschrijdtLimiet({ kringen: 8, situatieschemas: 1 }, { kringen: 8, situatieschemas: 1 }, l)).toBe(false);
});
test("boven de limiet en stijgend is geweigerd", () =>
  expect(overschrijdtLimiet({ kringen: 5, situatieschemas: 1 }, { kringen: 5, situatieschemas: 2 }, { kringen: 5, situatieschemas: 1 })).toBe(true));
