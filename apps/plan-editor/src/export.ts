import { get } from 'svelte/store';
import type { Project } from '$lib/models/types';
import { projectSettings } from '$lib/stores/settings';
import { planContentBounds } from '$lib/utils/planContentBounds';
import { resolveRooms, getRoomPolygon } from '$lib/utils/roomDetection';
import { drawWall, drawWallJoints, drawRooms, drawDoorOnWall, drawWindowOnWall, drawTextAnnotations, drawAnnotations, drawPersistedMeasurements } from '$lib/utils/canvasRenderer';

export type Frame = { x_cm: number; y_cm: number; pxPerCm: number };
export type Previous = { kader: Frame; breedte_px: number; hoogte_px: number };

export async function exportPlan(project: Project, previous?: Previous) {
  const floor = project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
  if (!floor || floor.walls.length === 0) throw new Error('empty');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const rooms = resolveRooms(floor);
  const labels = rooms.map(room => ({ room, polygon: getRoomPolygon(room, floor.walls) }));
  const settings = get(projectSettings);
  const bounds = planContentBounds(floor, { context: ctx, entourageAspect: () => 1, roomLabels: labels,
    measurementsVisible: true, textAnnotationsVisible: true, dimensionsVisible: true,
    automaticDimensions: { external: true, internal: false, edge: false }, units: 'metric' });
  if (!bounds) throw new Error('empty');
  let x = bounds.minX - 60, y = bounds.minY - 60, right = bounds.maxX + 60, bottom = bounds.maxY + 60;
  // Never crop an existing raster: electrical symbols may lie outside the current walls.
  if (previous) {
    x = Math.min(x, previous.kader.x_cm); y = Math.min(y, previous.kader.y_cm);
    right = Math.max(right, previous.kader.x_cm + previous.breedte_px / previous.kader.pxPerCm);
    bottom = Math.max(bottom, previous.kader.y_cm + previous.hoogte_px / previous.kader.pxPerCm);
  }
  const span = Math.max(right - x, bottom - y);
  if (!Number.isFinite(span) || span > 100_000 || span <= 0) throw new Error('size');
  const scale = Math.min(2, 2400 / span);
  canvas.width = Math.ceil((right - x) * scale); canvas.height = Math.ceil((bottom - y) * scale);
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cs = { ctx, width: canvas.width, height: canvas.height, zoom: scale,
    camX: x + canvas.width / (2 * scale), camY: y + canvas.height / (2 * scale) };
  drawRooms(cs, floor, rooms, null, true, true, settings);
  for (const wall of floor.walls) drawWall(cs, wall, false, true, settings, floor.walls);
  drawWallJoints(cs, floor, null);
  for (const door of floor.doors) { const wall = floor.walls.find(w => w.id === door.wallId); if (wall) drawDoorOnWall(cs, wall, door); }
  for (const win of floor.windows) { const wall = floor.walls.find(w => w.id === win.wallId); if (wall) drawWindowOnWall(cs, wall, win); }
  drawTextAnnotations(cs, floor, null, null);
  drawAnnotations(cs, floor, null, settings);
  drawPersistedMeasurements(cs, floor, null, settings);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('png')), 'image/png'));
  return { png: await blob.arrayBuffer(), breedte_px: canvas.width, hoogte_px: canvas.height,
    tekening: { formaat: 'openplan3d-v1', project: JSON.stringify(project), kader: { x_cm: x, y_cm: y, pxPerCm: scale } } };
}
