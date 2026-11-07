import { expect, test } from "vitest";
import { nieuwDocument, voegPaginaToe, zetAchtergrond, voegAfdekkingToe, verwijderAfdekking, pasPatchesToe, parseDocument, zetReferentiePagina } from "../src/index";

const achtergrond = { origineelBestandId: "bron", rasterBestandId: "raster", breedte_px: 1000, hoogte_px: 800 };
function opzet() {
  const pagina = voegPaginaToe(nieuwDocument(), "Plan");
  return { id: pagina.id, doc: zetAchtergrond(pagina.doc, pagina.id, achtergrond).doc };
}
test("afdekken behoudt bron en plaatsingen, overleeft JSON en kan ongedaan", () => {
  const { doc, id } = opzet();
  const r = voegAfdekkingToe(doc, id, { x: 20, y: 30, breedte: 40, hoogte: 50 });
  const geladen = parseDocument(JSON.parse(JSON.stringify(r.doc)));
  expect(geladen.situatie.paginas[0]).toMatchObject({ achtergrond, plaatsingen: [], afdekkingen: [{ id: r.id, x: 20, y: 30, breedte: 40, hoogte: 50 }] });
  expect(pasPatchesToe(r.doc, r.inversePatches)).toEqual(doc);
  const weg = verwijderAfdekking(r.doc, id, r.id);
  expect(weg.doc.situatie.paginas[0]!.afdekkingen ?? []).toEqual([]);
  expect(pasPatchesToe(weg.doc, weg.inversePatches)).toEqual(r.doc);
  expect(verwijderAfdekking(weg.doc, id, r.id).patches).toEqual([]);
});
test("afdekken weigert ongeldige of buitenliggende vlakken en referentiebladen", () => {
  const { doc, id } = opzet();
  for (const rechthoek of [
    { x: -1, y: 0, breedte: 10, hoogte: 10 }, { x: 999, y: 0, breedte: 10, hoogte: 10 },
    { x: 0, y: 799, breedte: 10, hoogte: 10 }, { x: 0, y: 0, breedte: 0, hoogte: 10 },
    { x: NaN, y: 0, breedte: 10, hoogte: 10 },
  ]) expect(() => voegAfdekkingToe(doc, id, rechthoek)).toThrow();
  expect(() => voegAfdekkingToe(zetReferentiePagina(doc, id, true).doc, id, { x: 0, y: 0, breedte: 10, hoogte: 10 })).toThrow();
});
test("een andere achtergrond verwijdert afdekkingen, undo herstelt beide", () => {
  const { doc, id } = opzet();
  const bedekt = voegAfdekkingToe(doc, id, { x: 1, y: 2, breedte: 3, hoogte: 4 }).doc;
  const vervangen = zetAchtergrond(bedekt, id, { ...achtergrond, rasterBestandId: "ander" });
  expect(vervangen.doc.situatie.paginas[0]!.afdekkingen).toBeUndefined();
  expect(pasPatchesToe(vervangen.doc, vervangen.inversePatches)).toEqual(bedekt);
});
test("laden weigert afdekkingen buiten het raster en dubbele ids", () => {
  const { doc, id } = opzet();
  const bedekt = voegAfdekkingToe(doc, id, { x: 1, y: 2, breedte: 3, hoogte: 4 }).doc;
  const buiten = JSON.parse(JSON.stringify(bedekt));
  buiten.situatie.paginas[0].afdekkingen[0].breedte = 1000;
  expect(() => parseDocument(buiten)).toThrow();
  const dubbel = JSON.parse(JSON.stringify(bedekt));
  dubbel.situatie.paginas[0].afdekkingen.push(dubbel.situatie.paginas[0].afdekkingen[0]);
  expect(() => parseDocument(dubbel)).toThrow();
});
