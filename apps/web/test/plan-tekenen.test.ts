import { expect, test } from 'vitest';
import { leesPlanResultaat } from '../app/situatie/plan-tekenen';
const data = () => ({ type: 'elentrik:result', session: 'sessie', breedte_px: 200, hoogte_px: 100,
  png: new Uint8Array([137,80,78,71,13,10,26,10]).buffer,
  tekening: { formaat: 'openplan3d-v1', project: '{"floors":[]}', kader: { x_cm: 0, y_cm: 0, pxPerCm: 2 } } });
test('accepteert alleen het begrensde PNG- en bronformaat van de huidige sessie', () => {
  expect(leesPlanResultaat(data(), 'sessie')?.tekening.kader.pxPerCm).toBe(2);
  expect(leesPlanResultaat(data(), 'andere')).toBeNull();
  expect(leesPlanResultaat({ ...data(), png: 'https://example.com/plan' }, 'sessie')).toBeNull();
  expect(leesPlanResultaat({ ...data(), png: new ArrayBuffer(8) }, 'sessie')).toBeNull();
  expect(leesPlanResultaat({ ...data(), breedte_px: 100000 }, 'sessie')).toBeNull();
  expect(leesPlanResultaat({ ...data(), tekening: {} }, 'sessie')).toBeNull();
  expect(leesPlanResultaat(null, 'sessie')).toBeNull();
});
