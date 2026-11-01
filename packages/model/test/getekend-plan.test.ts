import { expect, test } from 'vitest';
import * as model from '../src/index';
import { kloon } from './hulp';
const achtergrond = { origineelBestandId: 'png', rasterBestandId: 'png', breedte_px: 2000, hoogte_px: 1200 };
const tekening = { formaat: 'openplan3d-v1' as const, project: JSON.stringify({ floors: [] }), kader: { x_cm: -50, y_cm: -50, pxPerCm: 2 } };

test('bewaart een bewerkbaar plan met schaal en maakt de hele wijziging ongedaan', () => {
  const p = model.voegPaginaToe(model.nieuwDocument(), 'Plan');
  const r = model.zetGetekendPlan(p.doc, p.id, achtergrond, tekening);
  expect(r.doc.situatie.paginas[0]?.tekening).toEqual(tekening);
  expect(r.doc.situatie.paginas[0]?.achtergrond?.schaal).toEqual({ mmPerPx: 5 });
  expect(model.pasPatchesToe(r.doc, r.inversePatches)).toEqual(p.doc);
  expect(model.InstallatieDocumentSchema.safeParse(r.doc).success).toBe(true);
});

test('behoudt wereldpositie en rotatie bij een ander kader en resolutie', () => {
  const p = model.voegPaginaToe(model.nieuwDocument(), 'Plan');
  const doc = kloon(model.zetGetekendPlan(p.doc, p.id, achtergrond, tekening).doc);
  doc.situatie.paginas[0]!.plaatsingen.push({ nodeId: doc.rootId, x: 300, y: 500, rotatie: 90, labelOffset: { x: 40, y: -20 } });
  const nieuw = { ...tekening, kader: { x_cm: -100, y_cm: -200, pxPerCm: 1 } };
  const r = model.zetGetekendPlan(doc, p.id, achtergrond, nieuw);
  expect(r.doc.situatie.paginas[0]?.plaatsingen[0]).toMatchObject({ x: 200, y: 400, rotatie: 90, labelOffset: { x: 20, y: -10 } });
});

test('vervangen door een upload verwijdert de oude bewerkbare bron', () => {
  const p = model.voegPaginaToe(model.nieuwDocument(), 'Plan');
  const doc = model.zetGetekendPlan(p.doc, p.id, achtergrond, tekening).doc;
  expect(model.zetAchtergrond(doc, p.id, achtergrond).doc.situatie.paginas[0]?.tekening).toBeUndefined();
});

test('weigert ongeldige brongegevens en niet-eindige of nulschalen', () => {
  const p = model.voegPaginaToe(model.nieuwDocument(), 'Plan');
  for (const project of ['geen json', 'null', '[]', '{}', 'x'.repeat(1_000_001)]) {
    expect(() => model.zetGetekendPlan(p.doc, p.id, achtergrond, { ...tekening, project })).toThrow();
  }
  for (const pxPerCm of [0, -1, Infinity, NaN]) {
    expect(() => model.zetGetekendPlan(p.doc, p.id, achtergrond, { ...tekening, kader: { ...tekening.kader, pxPerCm } })).toThrow();
  }
});
