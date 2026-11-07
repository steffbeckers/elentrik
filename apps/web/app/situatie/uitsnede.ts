import type { SituatiePagina } from "@elentrik/model";
export type Uitsnede = NonNullable<NonNullable<SituatiePagina["achtergrond"]>["bronUitsnede"]>;

export function uitsnedeMaat(u: Uitsnede, breedte: number, hoogte: number) {
  if (![u.x, u.y, u.breedte, u.hoogte].every(Number.isFinite) || u.x < 0 || u.y < 0 || u.breedte < 1 || u.hoogte < 1 || u.x + u.breedte > breedte || u.y + u.hoogte > hoogte || ![0, 90, 180, 270].includes(u.rotatie)) throw new RangeError("Ongeldige bronuitsnede");
  return u.rotatie === 90 || u.rotatie === 270 ? { breedte: u.hoogte, hoogte: u.breedte } : { breedte: u.breedte, hoogte: u.hoogte };
}

/** Coordinates refer to the unrotated source raster, before resampling. */
export async function snijdRaster(blob: Blob, u: Uitsnede): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const maat = uitsnedeMaat(u, bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(maat.breedte); canvas.height = Math.round(maat.hoogte);
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas niet beschikbaar");
      context.translate(canvas.width / 2, canvas.height / 2);
      context.rotate(u.rotatie * Math.PI / 180);
      context.drawImage(bitmap, u.x, u.y, u.breedte, u.hoogte, -u.breedte / 2, -u.hoogte / 2, u.breedte, u.hoogte);
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Raster mislukt")), "image/png"));
    } finally { canvas.width = canvas.height = 0; }
  } finally { bitmap.close(); }
}
