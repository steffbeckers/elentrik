import { PlanTekeningSchema, type PlanTekening } from '@elentrik/model';
export type PlanResultaat = { png: ArrayBuffer; breedte_px: number; hoogte_px: number; tekening: PlanTekening };
/** Source window and origin are checked by the mounted dialog before this payload validator. */
export function leesPlanResultaat(data: unknown, sessie: string): PlanResultaat | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (d.type !== 'elentrik:result' || d.session !== sessie || !(d.png instanceof ArrayBuffer)) return null;
  if (d.png.byteLength < 8 || d.png.byteLength > 20 * 1024 * 1024) return null;
  const magic = new Uint8Array(d.png, 0, 8);
  if (![137,80,78,71,13,10,26,10].every((v, i) => magic[i] === v)) return null;
  const w = d.breedte_px, h = d.hoogte_px;
  if (typeof w !== 'number' || typeof h !== 'number' || !Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || w > 2400 || h > 2400) return null;
  const bron = PlanTekeningSchema.safeParse(d.tekening);
  if (!bron.success) return null;
  return { png: d.png, breedte_px: w, hoogte_px: h, tekening: bron.data };
}
