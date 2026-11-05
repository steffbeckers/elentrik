import { expect, test } from 'vitest';
import { nieuwDocument, parseDocument } from '../src/index';

test('een ingelezen referentieblad kan geen definitieve plaatsingen verbergen', () => {
  const doc = nieuwDocument();
  doc.situatie.paginas = [{ id: 'bron', titel: 'Bron', referentie: true, plaatsingen: [{ nodeId: doc.rootId, x: 1, y: 1, rotatie: 0 }] }];
  expect(() => parseDocument(doc)).toThrow();
  doc.situatie.paginas[0]!.plaatsingen = [];
  expect(parseDocument(doc).situatie.paginas[0]!.referentie).toBe(true);
});
