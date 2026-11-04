import { expect, test } from 'vitest';
import { adminVerschillen } from '../app/admin/verschillen';
test('only changes are shown and oversized structures are bounded', () => {
  expect(adminVerschillen({ naam: 'Voor', gelijk: 1 }, { naam: 'Na', gelijk: 1 }).items).toEqual([{ pad: 'naam', voor: 'Voor', na: 'Na' }]);
  const huge = Array.from({ length: 100000 }, (_, i) => ({ waarde: i }));
  const result = adminVerschillen({}, { huge });
  expect(result.beperkt).toBe(true); expect(result.items.length).toBeLessThanOrEqual(200);
});
