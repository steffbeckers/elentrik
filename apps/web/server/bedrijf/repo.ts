// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { PartijSchema, type Partij } from "@elentrik/model";
import { eq } from "drizzle-orm";
import { afmetingen, herkenSoort, MAX_LOGO_BYTES, type BestandInfo } from "../../shared/bestandsinhoud";
import { BestandFout, schrijfBestandMetRij } from "../bestanden/repo";
import type { BestandOpslag } from "../bestanden/opslag";
import type { Db } from "../db";
import { bedrijfsinstellingen } from "../db/schema";

/** De bedrijfsgegevens staan in één rij met dit id. */
const BEDRIJF_ID = 1;

export type BedrijfFoutCode = "ONGELDIG";

export class BedrijfFout extends Error {
  readonly code: BedrijfFoutCode;
  readonly details?: unknown;

  constructor(code: BedrijfFoutCode, details?: unknown) {
    super(code);
    this.name = "BedrijfFout";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** De gegevens van de installateur; zonder rij een lege naam. */
export async function haalBedrijf(db: Db): Promise<Partij> {
  const [rij] = await db
    .select({ installateur: bedrijfsinstellingen.installateur })
    .from(bedrijfsinstellingen)
    .where(eq(bedrijfsinstellingen.id, BEDRIJF_ID));
  return rij ? PartijSchema.parse(rij.installateur) : { naam: "" };
}

async function schrijfBedrijf(db: Db, installateur: Partij): Promise<void> {
  const gewijzigd = new Date();
  await db
    .insert(bedrijfsinstellingen)
    .values({ id: BEDRIJF_ID, installateur, gewijzigd })
    .onConflictDoUpdate({ target: bedrijfsinstellingen.id, set: { installateur, gewijzigd } });
}

/**
 * Bewaart de bedrijfsgegevens (upsert van rij 1). Een meegestuurde `logoBestandId` wordt
 * genegeerd: alleen `bewaarLogo` zet het, en een bestaand logo blijft staan.
 */
export async function bewaarBedrijf(db: Db, partij: Partij): Promise<Partij> {
  const resultaat = PartijSchema.safeParse(partij);
  if (!resultaat.success) throw new BedrijfFout("ONGELDIG", resultaat.error.issues);
  const { logoBestandId: _genegeerd, ...invoer } = resultaat.data;
  const { logoBestandId } = await haalBedrijf(db);
  const bewaard: Partij = { ...invoer, ...(logoBestandId !== undefined ? { logoBestandId } : {}) };
  await schrijfBedrijf(db, bewaard);
  return bewaard;
}

/**
 * Bewaart het logo van de installateur (PNG of JPEG, hoogstens `MAX_LOGO_BYTES`) onder
 * `bedrijf/<bestandId>` en zet `installateur.logoBestandId`. Het bestand en de verwijzing
 * komen samen tot stand, of niet.
 */
export async function bewaarLogo(
  db: Db,
  opslag: BestandOpslag,
  data: Uint8Array,
): Promise<BestandInfo> {
  if (data.length > MAX_LOGO_BYTES) throw new BestandFout("TE_GROOT");
  const type = herkenSoort(data);
  if (type !== "png" && type !== "jpeg") throw new BestandFout("ONGELDIG_TYPE");
  // Een logo met onleesbare of nulafmetingen mag nooit in de PDF-keten terechtkomen.
  const maten = afmetingen(data, type);
  if (!maten || maten.breedte === 0 || maten.hoogte === 0) throw new BestandFout("ONGELDIG_TYPE");

  return schrijfBestandMetRij(
    db,
    opslag,
    { projectId: null, soort: "logo", map: "bedrijf", type, data },
    async (tx, info) => {
      const huidig = await haalBedrijf(tx);
      await schrijfBedrijf(tx, { ...huidig, logoBestandId: info.id });
    },
  );
}
