import { computed, ref, shallowRef } from 'vue';
import { createError } from 'h3';
import type { AdminCorrectie } from '../../shared/admin/projecten';
import type { BestandInfo } from '../../shared/bestandsinhoud';
import type { ExportInfo } from '../../shared/exports';
import { VERWACHTE_GEBRUIKER_HEADER } from '../../shared/gebruiker';
import type { BestandenApi, BestandenSoort } from './useBestandenApi';
import { ConflictFout, httpStatus, huidigeVersieUitConflict, type BewaarInvoer, type Project, type ProjectenApi } from './useProjectenApi';

export type AdminProjectFetch = (pad: string, opties: { method?: string; headers: Record<string, string>; body?: unknown; signal?: AbortSignal }) => Promise<unknown>;

/** Eén venster, één actor, één project. Een herladen pagina start altijd alleen-lezen. */
export function maakAdminProjectApi(haal: AdminProjectFetch, gebruikerId: string, projectId: string, nu = Date.now) {
  const headers = { [VERWACHTE_GEBRUIKER_HEADER]: gebruikerId };
  const basis = `/api/admin/projecten/${encodeURIComponent(projectId)}`;
  const correctie = shallowRef<AdminCorrectie | null>(null);
  const geblokkeerd = ref(false); const afsluiten = ref(false); const starten = ref(false); const klok = ref(nu());
  const geldig = () => !!correctie.value && !correctie.value.beeindigd && !geblokkeerd.value && nu() < Date.parse(correctie.value.verloopt);
  const schrijven = computed(() => { void klok.value; return geldig() && !afsluiten.value; });
  const pending = new Map<string, { inhoud: string; body: Record<string, unknown> }>();
  async function verzoek<T>(pad: string, opties: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {}): Promise<T> {
    try { return await haal(pad, { ...opties, headers: { ...headers, ...opties.headers } }) as T; }
    catch (fout) { if ([401, 403].includes(httpStatus(fout) ?? 0)) geblokkeerd.value = true; throw fout; }
  }
  async function mutatie<T>(pad: string, body: object, method = 'POST', extraHeaders?: Record<string, string>): Promise<T> {
    const inhoud = JSON.stringify({ body, extraHeaders });
    let p = pending.get(pad);
    if (!p || p.inhoud !== inhoud) { p = { inhoud, body: { ...JSON.parse(JSON.stringify(body)), mutatieId: crypto.randomUUID() } }; pending.set(pad, p); }
    const antwoord = await verzoek<T>(pad, { method, body: p.body, headers: extraHeaders });
    if (pending.get(pad) === p) pending.delete(pad);
    return antwoord;
  }
  function eisProject(id: string) { if (id !== projectId) throw createError({ statusCode: 403 }); }
  function eisCorrectie(id: string) {
    eisProject(id);
    if (!geldig()) throw createError({ statusCode: 403, data: { code: 'ADMIN_CORRECTIE_ONGELDIG' } });
    return correctie.value!.id;
  }
  function controleer(huidigeGebruiker: string | null) {
    klok.value = nu();
    if (huidigeGebruiker !== gebruikerId || (correctie.value && klok.value >= Date.parse(correctie.value.verloopt))) geblokkeerd.value = true;
  }
  async function start(reden: string) {
    if (!reden.trim() || reden.trim().length > 1000 || starten.value || afsluiten.value) throw createError({ statusCode: 400 });
    starten.value = true;
    try {
      correctie.value = await mutatie<AdminCorrectie>(`${basis}/correcties`, { reden: reden.trim() });
      geblokkeerd.value = false; klok.value = nu();
    } finally { starten.value = false; }
  }
  async function afronden(wachtOpOpslaan: () => Promise<boolean>) {
    if (afsluiten.value || !correctie.value) return;
    afsluiten.value = true;
    try {
      if (!await wachtOpOpslaan()) throw new Error('De laatste wijzigingen zijn nog niet opgeslagen.');
      const id = correctie.value.id;
      await mutatie<AdminCorrectie>(`/api/admin/correcties/${encodeURIComponent(id)}/afronden`, {});
      correctie.value = null; geblokkeerd.value = true;
    } finally { afsluiten.value = false; }
  }
  const projecten: Pick<ProjectenApi, 'haal' | 'bewaar'> = {
    haal: (id) => { eisProject(id); return verzoek<Project>(`${basis}/document`); },
    async bewaar(id: string, versie: number, invoer: BewaarInvoer) {
      const correctieId = eisCorrectie(id);
      try { return await mutatie<{ versie: number }>(`${basis}/document`, { ...invoer, correctieId }, 'PUT', { 'If-Match': String(versie) }); }
      catch (fout) { const huidige = huidigeVersieUitConflict(fout); if (huidige !== undefined) throw new ConflictFout(huidige); throw fout; }
    },
  };
  const bestandUrl = (id: string) => `/api/admin/bestanden/${encodeURIComponent(id)}?gebruiker=${encodeURIComponent(gebruikerId)}`;
  const uploads = new WeakMap<Blob, Map<string, FormData>>();
  const bestanden: BestandenApi = {
    url: bestandUrl,
    async upload(id: string, soort: BestandenSoort, bestand: Blob, naam: string, signal?: AbortSignal) {
      const correctieId = eisCorrectie(id); const sleutel = JSON.stringify([correctieId, soort, naam]);
      let perBlob = uploads.get(bestand); if (!perBlob) { perBlob = new Map(); uploads.set(bestand, perBlob); }
      let body = perBlob.get(sleutel);
      if (!body) { body = new FormData(); body.append('bestand', bestand, naam); body.append('soort', soort); body.append('correctieId', correctieId); body.append('mutatieId', crypto.randomUUID()); perBlob.set(sleutel, body); }
      const resultaat = await verzoek<BestandInfo>(`${basis}/bestanden`, { method: 'POST', body, signal });
      perBlob.delete(sleutel); return resultaat;
    },
  };
  return { projecten, bestanden, bestandUrl, exportLijst: (id: string) => { eisProject(id); return verzoek<ExportInfo[]>(`${basis}/exports`); },
    correctie, schrijven, geblokkeerd, afsluiten, starten, controleer, start, afronden };
}
export type AdminProjectApi = ReturnType<typeof maakAdminProjectApi>;
