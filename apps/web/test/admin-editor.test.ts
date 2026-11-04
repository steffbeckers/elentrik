import 'fake-indexeddb/auto';
import { beforeEach, expect, test, vi } from 'vitest';
import { clear, get, keys, set } from 'idb-keyval';
import { createPinia, setActivePinia } from 'pinia';
import { nieuwProjectDocument } from '@elentrik/model';
import { bewaarConcept, nieuwsteConcept } from '../app/composables/concepten';
import { useAutosave } from '../app/composables/useAutosave';
import { useEditorStore } from '../app/stores/editor';
import { createSSRApp, h, provide, nextTick } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { editorContextKey, type EditorContext } from '../app/editor/context';
import { useBestandenApi } from '../app/composables/useBestandenApi';
import { maakAdminProjectApi } from '../app/composables/useAdminProjectApi';
beforeEach(async () => { await clear(); setActivePinia(createPinia()); });
const document = () => nieuwProjectDocument({ klantNaam: 'Klant', stroomtype: '2x230V', datum: '2026-11-03' });
test('support drafts never claim legacy/customer work, including the same actor and project', async () => {
  const base = { document: document(), versie: 1, naam: 'Klant', tijd: 1 };
  await set('concept:p1', base);
  expect(await nieuwsteConcept('p1', 'u1', 'admin')).toBeNull();
  expect(await get('concept:p1')).toEqual(base);
  await bewaarConcept({ gebruikerId: 'u1', projectId: 'p1', instantieId: 'w1', modus: 'admin' }, { ...base, naam: 'Support', tijd: 2 });
  expect((await nieuwsteConcept('p1', 'u1'))?.concept.naam).toBe('Klant');
  expect((await nieuwsteConcept('p1', 'u1', 'admin'))?.concept.naam).toBe('Support');
  expect(await keys()).toContain('concept:u:u1:p1:oud');
});
test('unsupported recovery commands do nothing; refused support save retains draft in its own mode', async () => {
  const store = useEditorStore(); store.laad({ id: 'p1', naam: 'Project', versie: 1, document: document() });
  const bewaar = vi.fn().mockRejectedValue({ status: 403 }); const haal = vi.fn(); const naarProject = vi.fn();
  const auto = useAutosave({ store, bewaar, haal, naarProject, gebruikerId: 'u1', modus: 'admin', vertragingMs: 100_000 });
  await auto.bewaarAlsKopie(); await auto.bewaarAlsNieuwProject();
  expect(haal).not.toHaveBeenCalled(); expect(bewaar).not.toHaveBeenCalled(); expect(naarProject).not.toHaveBeenCalled();
  store.wijzigProjectgegevens({ naam: 'Lokale correctie' }); await auto.wachtOpConcept(); await auto.nuOpslaan();
  expect(auto.status.value).toBe('fout'); expect((await nieuwsteConcept('p1', 'u1', 'admin'))?.concept.naam).toBe('Lokale correctie');
  expect(await nieuwsteConcept('p1', 'u1')).toBeNull(); auto.stop();
});
test('nested plan components inherit admin file URLs and uploads through the typed context', async () => {
  const support = maakAdminProjectApi(vi.fn(), 'u1', 'p1');
  const context = { bestanden: support.bestanden } as EditorContext;
  const Child = { setup() { const bestanden = useBestandenApi(); expect(bestanden).toBe(support.bestanden); return () => h('img', { src: bestanden.url('b1') }); } };
  const app = createSSRApp({ setup() { provide(editorContextKey, context); return () => h(Child); } });
  expect(await renderToString(app)).toContain('/api/admin/bestanden/b1?gebruiker=u1');
});

test.each([false, true])('support settles lost responses before newer edits; third-party conflict=%s', async (andereSchrijver) => {
  const store = useEditorStore(); store.laad({ id: 'p1', naam: 'Project', versie: 1, document: document() });
  let serverVersie = 1;
  const receipts = new Map<string, { versie: number }>();
  const commits: string[] = [];
  const pogingen: Array<{ naam: string; versie: number; mutatieId: string }> = [];
  const fetch = vi.fn(async (pad, options) => {
    if (pad.endsWith('/correcties')) return { id: 'c1', verloopt: '2099-01-01T00:00:00Z', beeindigd: null };
    if (pad.endsWith('/afronden')) return {};
    const body = options.body;
    pogingen.push({ naam: body.naam, versie: Number(options.headers['If-Match']), mutatieId: body.mutatieId });
    if (receipts.has(body.mutatieId)) return receipts.get(body.mutatieId);
    if (Number(options.headers['If-Match']) !== serverVersie) throw { status: 409, data: { data: { versie: serverVersie } } };
    commits.push(body.naam); receipts.set(body.mutatieId, { versie: ++serverVersie });
    // Elke nieuwe bewaring slaagt op de server, maar verliest haar eerste antwoord.
    throw new Error('Antwoord verloren');
  });
  const support = maakAdminProjectApi(fetch, 'u1', 'p1'); await support.start('Correctie');
  const auto = useAutosave({ store, bewaar: support.projecten.bewaar, haal: support.projecten.haal, naarProject: vi.fn(), gebruikerId: 'u1', modus: 'admin', vertragingMs: 100_000, herprobeerMs: 100_000 });
  try {
    store.wijzigProjectgegevens({ naam: 'Eerste wijziging' }); await nextTick(); await auto.nuOpslaan();
    expect(auto.status.value).toBe('lokaal'); expect(store.versie).toBe(1);
    store.wijzigProjectgegevens({ naam: 'Verder gewerkt' }); await nextTick();
    if (andereSchrijver) serverVersie++;
    await auto.nuOpslaan();
    expect(pogingen[1]).toEqual(pogingen[0]);
    expect(store.versie).toBe(2);
    if (andereSchrijver) {
      expect(auto.status.value).toBe('conflict'); expect(commits).toEqual(['Eerste wijziging']);
      expect(auto.conflict.value?.huidigeVersie).toBe(3);
      await auto.wachtOpConcept();
      expect((await nieuwsteConcept('p1', 'u1', 'admin'))?.concept.naam).toBe('Verder gewerkt');
    } else {
      expect(auto.status.value).toBe('lokaal'); expect(commits).toEqual(['Eerste wijziging', 'Verder gewerkt']);
      store.wijzigProjectgegevens({ naam: 'Laatste wijziging' }); await nextTick(); await auto.nuOpslaan();
      expect(store.versie).toBe(3); expect(auto.status.value).toBe('lokaal');
      await support.afronden(async () => { await auto.nuOpslaan(); return auto.status.value === 'opgeslagen'; });
      expect(store.versie).toBe(4); expect(auto.status.value).toBe('opgeslagen');
      expect(commits).toEqual(['Eerste wijziging', 'Verder gewerkt', 'Laatste wijziging']);
      expect(await nieuwsteConcept('p1', 'u1', 'admin')).toBeNull();
    }
  } finally { auto.stop(); }
});

test('support also preserves edits made while the uncertain request is still in flight', async () => {
  const store = useEditorStore(); store.laad({ id: 'p1', naam: 'Project', versie: 1, document: document() });
  let verlies!: (fout: Error) => void;
  const bewaar = vi.fn().mockImplementationOnce(() => new Promise((_, reject) => { verlies = reject; }))
    .mockResolvedValueOnce({ versie: 2 }).mockResolvedValueOnce({ versie: 3 });
  const auto = useAutosave({ store, bewaar, haal: vi.fn(), naarProject: vi.fn(), gebruikerId: 'u1', modus: 'admin', vertragingMs: 100_000 });
  try {
    store.wijzigProjectgegevens({ naam: 'Onderweg' }); await nextTick();
    const eerste = auto.nuOpslaan();
    store.wijzigProjectgegevens({ naam: 'Tijdens verzoek' }); await nextTick();
    verlies(new Error('Antwoord verloren')); await eerste; await auto.nuOpslaan();
    expect(bewaar.mock.calls.map(c => [c[1], c[2].naam])).toEqual([[1, 'Onderweg'], [1, 'Onderweg'], [2, 'Tijdens verzoek']]);
    expect(store.versie).toBe(3); expect(auto.status.value).toBe('opgeslagen');
  } finally { auto.stop(); }
});

test.each(['weigering', 'herladen'])('support discards obsolete retry content after %s', async (gebeurtenis) => {
  const store = useEditorStore(); store.laad({ id: 'p1', naam: 'Project', versie: 1, document: document() });
  const bewaar = vi.fn().mockRejectedValueOnce(gebeurtenis === 'weigering' ? { status: 422 } : new Error('offline')).mockResolvedValue({ versie: 9 });
  const auto = useAutosave({ store, bewaar, haal: vi.fn(), naarProject: vi.fn(), gebruikerId: 'u1', modus: 'admin', vertragingMs: 100_000 });
  try {
    store.wijzigProjectgegevens({ naam: 'Verouderd' }); await nextTick(); await auto.nuOpslaan();
    if (gebeurtenis === 'herladen') { store.laad({ id: 'p2', naam: 'Ander project', versie: 8, document: document() }); await nextTick(); }
    store.wijzigProjectgegevens({ naam: 'Actuele inhoud' }); await nextTick(); await auto.nuOpslaan();
    expect(bewaar.mock.calls[1]![2].naam).toBe('Actuele inhoud');
    expect(bewaar.mock.calls[1]![0]).toBe(gebeurtenis === 'herladen' ? 'p2' : 'p1');
    expect(auto.status.value).toBe('opgeslagen');
  } finally { auto.stop(); }
});
