// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { PartijSchema, type Partij } from "@elentrik/model";
import { eq } from "drizzle-orm";
import { afmetingen, herkenSoort, MAX_LOGO_BYTES, type BestandInfo } from "../../shared/bestandsinhoud";
import { BestandFout, schrijfBestandMetRij } from "../bestanden/repo";
import type { BestandOpslag } from "../bestanden/opslag";
import type { Db } from "../db";
import { bedrijfsinstellingen } from "../db/schema";

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

/**
 * De gegevens van de installateur van een organisatie (de rij met dit `organisatie_id`); zonder
 * rij een lege naam.
 */
export async function haalBedrijf(db: Db, organisatieId: string): Promise<Partij> {
  const [rij] = await db
    .select({ installateur: bedrijfsinstellingen.installateur })
    .from(bedrijfsinstellingen)
    .where(eq(bedrijfsinstellingen.organisatieId, organisatieId));
  return rij ? PartijSchema.parse(rij.installateur) : { naam: "" };
}

/** Schrijft de rij van de organisatie; ontbreekt ze nog, dan wordt ze aangemaakt. */
async function schrijfBedrijf(db: Db, organisatieId: string, installateur: Partij): Promise<void> {
  const gewijzigd = new Date();
  await db
    .insert(bedrijfsinstellingen)
    .values({ organisatieId, installateur, gewijzigd })
    .onConflictDoUpdate({ target: bedrijfsinstellingen.organisatieId, set: { installateur, gewijzigd } });
}

/**
 * Bewaart de bedrijfsgegevens van een organisatie (upsert op `organisatie_id`). Een meegestuurde
 * `logoBestandId` wordt genegeerd: alleen `bewaarLogo` zet het, en een bestaand logo blijft staan.
 */
export async function bewaarBedrijf(db: Db, organisatieId: string, partij: Partij): Promise<Partij> {
  const resultaat = PartijSchema.safeParse(partij);
  if (!resultaat.success) throw new BedrijfFout("ONGELDIG", resultaat.error.issues);
  const { logoBestandId: _genegeerd, ...invoer } = resultaat.data;
  const { logoBestandId } = await haalBedrijf(db, organisatieId);
  const bewaard: Partij = { ...invoer, ...(logoBestandId !== undefined ? { logoBestandId } : {}) };
  await schrijfBedrijf(db, organisatieId, bewaard);
  return bewaard;
}

/**
 * Bewaart het logo van de installateur van een organisatie (PNG of JPEG, hoogstens
 * `MAX_LOGO_BYTES`) onder `org/<organisatieId>/<bestandId>`, met `organisatie_id` op de
 * bestandsrij en zonder project, en zet `installateur.logoBestandId`. Het bestand en de
 * verwijzing komen samen tot stand, of niet. Een bestaand logo met een oude sleutel blijft staan.
 */
export async function bewaarLogo(
  db: Db,
  opslag: BestandOpslag,
  organisatieId: string,
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
    { projectId: null, organisatieId, soort: "logo", map: `org/${organisatieId}`, type, data },
    async (tx, info) => {
      const huidig = await haalBedrijf(tx, organisatieId);
      await schrijfBedrijf(tx, organisatieId, { ...huidig, logoBestandId: info.id });
    },
  );
}
