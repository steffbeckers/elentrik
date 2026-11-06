<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { get } from 'svelte/store';
  import FloorPlanCanvas from '$lib/components/editor/FloorPlanCanvas.svelte';
  import { currentProject, activeFloor, createDefaultProject, loadProject, selectedTool, selectedElementId, selectedElementIds, panMode, undo, redo, removeElement, updateWall, updateDoor, updateWindow, resizeWallLength } from '$lib/stores/project';
  import { readProject } from '$lib/utils/projectValidation';
  import { projectSettings } from '$lib/stores/settings';
  import { exportPlan, type Previous } from './export';
  import { locale } from '$lib/i18n';
  import { zetMaatTaal } from './settings';

  let ready = $state(false);
  let session = '';
  let previous: Previous | undefined;
  let labels = $state<Record<string, string>>({});
  let error = $state('');
  let busy = $state(false);
  const selection = $derived($activeFloor?.walls.find(w => w.id === $selectedElementId));
  const opening = $derived($activeFloor?.doors.find(w => w.id === $selectedElementId) ?? $activeFloor?.windows.find(w => w.id === $selectedElementId));

  function post(type: string, data: Record<string, unknown> = {}) { window.parent.postMessage({ type, session, ...data }, window.location.origin); }
  async function save() {
    if (busy || !get(currentProject)) return;
    busy = true; error = '';
    try {
      // Inline names and labels commit on blur, including saves requested with Ctrl+S.
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      await tick();
      const data = await exportPlan(get(currentProject)!, previous);
      if (data.tekening.project.length > 1_000_000) throw new Error('size');
      post('elentrik:result', data);
    } catch { error = labels.exportError; post('elentrik:error'); }
    finally { busy = false; }
  }
  function choose(tool: 'select' | 'wall' | 'door' | 'window' | 'text' | 'measure') {
    selectedTool.set(tool); panMode.set(false); selectedElementId.set(null); selectedElementIds.set(new Set());
  }
  function change(event: Event, kind: 'length' | 'thickness' | 'width') {
    const value = Number((event.target as HTMLInputElement).value);
    if (!Number.isFinite(value) || value <= 0 || value > 10000) return;
    if (selection && kind === 'length') resizeWallLength(selection.id, value);
    if (selection && kind === 'thickness') updateWall(selection.id, { thickness: value });
    if (opening && kind === 'width') {
      if ($activeFloor?.doors.some(d => d.id === opening.id)) updateDoor(opening.id, { width: value });
      else updateWindow(opening.id, { width: value });
    }
  }
  onMount(() => {
    let unsubscribe = () => {};
    function receive(event: MessageEvent) {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      const m = event.data;
      if (m?.type === 'elentrik:init' && !ready) {
        session = m.session; labels = m.labels; previous = m.previous;
        try {
          const project = m.project ? readProject(JSON.parse(m.project)) : createDefaultProject(m.title);
          if (!m.project) project.floors[0].name = m.title;
          projectSettings.reset();
          const taal = m.language === 'nl' || m.language === 'fr' ? m.language : 'en';
          locale.set(taal); zetMaatTaal(taal === 'en' ? 'en-GB' : `${taal}-BE`);
          loadProject(project); choose('wall'); ready = true;
          unsubscribe = currentProject.subscribe(() => { if (ready) post('elentrik:changed'); });
        } catch { error = labels.loadError; post('elentrik:error'); }
      }
      if (m?.session === session && m?.type === 'elentrik:save') void save();
    }
    function keyboard(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); event.stopImmediatePropagation(); post('elentrik:save-request');
      }
      // Tab is focus navigation, never switch to upstream's unmounted 3D view.
      if (event.key === 'Tab') event.stopImmediatePropagation();
    }
    window.addEventListener('message', receive);
    window.addEventListener('keydown', keyboard, true);
    window.parent.postMessage({ type: 'elentrik:ready' }, window.location.origin);
    return () => { unsubscribe(); window.removeEventListener('message', receive); window.removeEventListener('keydown', keyboard, true); };
  });
</script>

{#if error}<p role="alert" class="error">{error}</p>{/if}
{#if ready}
  <main>
    <div class="tools" aria-label={labels.tools}>
      {#each ['select', 'wall', 'door', 'window', 'text', 'measure'] as tool}
        <button type="button" aria-pressed={$selectedTool === tool} onclick={() => choose(tool as any)}>{labels[tool]}</button>
      {/each}
      <span class="divider"></span>
      <button type="button" onclick={undo}>{labels.undo}</button>
      <button type="button" onclick={redo}>{labels.redo}</button>
      <button type="button" disabled={!$selectedElementId} onclick={() => { if ($selectedElementId) removeElement($selectedElementId); }}>{labels.delete}</button>
    </div>
    <div class="properties">
      {#if selection}
        <label>{labels.length} <input aria-label={labels.length} type="number" min="1" max="10000" value={Math.round(Math.hypot(selection.end.x - selection.start.x, selection.end.y - selection.start.y))} onchange={e => change(e, 'length')}> cm</label>
        <label>{labels.thickness} <input aria-label={labels.thickness} type="number" min="1" max="10000" value={selection.thickness} onchange={e => change(e, 'thickness')}> cm</label>
      {:else if opening}
        <label>{labels.width} <input aria-label={labels.width} type="number" min="1" max="10000" value={opening.width} onchange={e => change(e, 'width')}> cm</label>
      {:else}<p>{labels.hint}</p>{/if}
    </div>
    <div class="canvas"><FloorPlanCanvas /></div>
  </main>
{/if}
<style>
  main { height: 100%; display: flex; flex-direction: column; }
  .tools { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid #d1d5db; }
  .tools button { border: 1px solid transparent; border-radius: 6px; padding: 6px 10px; font-size: 14px; }
  .tools button:hover { background: #f3f4f6; }
  .tools button[aria-pressed=true] { background: #ecfdf5; color: #065f46; border-color: #047857; }
  .divider { border-left: 1px solid #d1d5db; margin: 2px 6px; }
  .properties { min-height: 44px; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; background: #f8fafc; }
  .properties p { margin: 0; color: #475569; }
  input { width: 88px; border: 1px solid #94a3b8; border-radius: 4px; padding: 2px 6px; background: white; }
  .canvas { flex: 1; position: relative; min-height: 0; }
  .error { margin: 0; padding: 12px; color: #991b1b; background: #fef2f2; }
</style>
