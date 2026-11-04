import { expect, test, vi } from 'vitest';
import { nieuwProjectDocument } from '@elentrik/model';
import { maakAdminProjectApi } from '../app/composables/useAdminProjectApi';
import { ConflictFout } from '../app/composables/useProjectenApi';
const doc = () => nieuwProjectDocument({ klantNaam: 'Klant', stroomtype: '2x230V', datum: '2026-11-03' });
const sessie = { id: 'c1', projectId: 'p1', organisatieId: 'o1', reden: 'Correctie', gestart: '2026-11-03T10:00:00Z', verloopt: '2026-11-03T18:00:00Z', beeindigd: null };
const nu = () => Date.parse('2026-11-03T11:00:00Z');

test('support opens read-only; all transports bind actor and explicit project', async () => {
  const fetch = vi.fn().mockResolvedValue(sessie); const api = maakAdminProjectApi(fetch, 'u1', 'p1', nu);
  expect(api.schrijven.value).toBe(false);
  await expect(api.projecten.bewaar('p1', 1, { document: doc() })).rejects.toThrow();
  await expect(api.start(' ')).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  await api.projecten.haal('p1'); await api.start('Correctie');
  expect(api.schrijven.value).toBe(true);
  expect(api.projecten).not.toHaveProperty('dupliceer'); expect(api.projecten).not.toHaveProperty('maak');
  expect(fetch.mock.calls[0]![0]).toBe('/api/admin/projecten/p1/document');
  await expect(api.projecten.bewaar('ander', 1, { document: doc() })).rejects.toThrow();
  const blob = new Blob(['plan'], { type: 'image/png' });
  await api.bestanden.upload('p1', 'plan-raster', blob, 'plan.png');
  const upload = fetch.mock.calls.at(-1)!;
  expect(upload[0]).toBe('/api/admin/projecten/p1/bestanden');
  expect(upload[1].body.get('correctieId')).toBe('c1');
  expect(upload[1].body.get('mutatieId')).toMatch(/^[a-f0-9-]{36}$/);
  expect(api.bestanden.url('b1')).toBe('/api/admin/bestanden/b1?gebruiker=u1');
  for (const [, options] of fetch.mock.calls) expect(options.headers['x-elentrik-gebruiker']).toBe('u1');
});

test('lost save retries immutable payload under same ID; changed content and version get new ID', async () => {
  const fetch = vi.fn().mockResolvedValue(sessie); const api = maakAdminProjectApi(fetch, 'u1', 'p1', nu);
  await api.start('Correctie'); fetch.mockRejectedValue(new Error('offline'));
  const input = { naam: 'Oud', document: doc() };
  await expect(api.projecten.bewaar('p1', 2, input)).rejects.toThrow();
  const first = fetch.mock.calls.at(-1)![1].body;
  await expect(api.projecten.bewaar('p1', 2, input)).rejects.toThrow();
  expect(fetch.mock.calls.at(-1)![1].body).toEqual(first);
  input.naam = 'Nieuw'; await expect(api.projecten.bewaar('p1', 2, input)).rejects.toThrow();
  expect(first.naam).toBe('Oud'); expect(fetch.mock.calls.at(-1)![1].body.mutatieId).not.toBe(first.mutatieId);
  fetch.mockRejectedValue({ status: 409, data: { data: { versie: 9 } } });
  await expect(api.projecten.bewaar('p1', 2, input)).rejects.toBeInstanceOf(ConflictFout);
});

test('expiry, revocation and changed login stop further transport without automatic restart', async () => {
  let klok = nu(); const fetch = vi.fn().mockResolvedValue(sessie); const api = maakAdminProjectApi(fetch, 'u1', 'p1', () => klok);
  await api.start('Correctie'); klok = Date.parse(sessie.verloopt); api.controleer('u1');
  expect(api.schrijven.value).toBe(false); const count = fetch.mock.calls.length;
  await expect(api.projecten.bewaar('p1', 1, { document: doc() })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(count);
  klok = nu(); await api.start('Correctie'); api.controleer('u2'); api.controleer('u1'); expect(api.schrijven.value).toBe(false);
  await api.start('Correctie'); fetch.mockRejectedValue({ status: 403 });
  await expect(api.projecten.bewaar('p1', 1, { document: doc() })).rejects.toBeDefined();
  expect(api.schrijven.value).toBe(false);
});

test('completion waits for pending autosave; failed flush leaves correction active', async () => {
  const fetch = vi.fn().mockResolvedValue(sessie); const api = maakAdminProjectApi(fetch, 'u1', 'p1', nu);
  await api.start('Correctie');
  let klaar!: (v: boolean) => void;
  const done = api.afronden(() => new Promise(resolve => klaar = resolve));
  expect(api.schrijven.value).toBe(false); expect(fetch).toHaveBeenCalledTimes(1);
  klaar(false); await expect(done).rejects.toThrow(); expect(api.schrijven.value).toBe(true);
  const flush = vi.fn(async () => { await api.projecten.bewaar('p1', 1, { document: doc() }); return true; });
  await api.afronden(flush);
  expect(fetch.mock.calls.at(-1)![0]).toBe('/api/admin/correcties/c1/afronden'); expect(api.schrijven.value).toBe(false);
  const count = fetch.mock.calls.length;
  await expect(api.projecten.bewaar('p1', 2, { document: doc() })).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(count);
});
