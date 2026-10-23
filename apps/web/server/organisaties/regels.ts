// De regels voor leden en organisaties die op twee paden gelden: de eigen routes onder
// /api/organisaties en de endpoints van Better Auth onder /api/auth/organization (ruling R5).
// Daarom zonder Better Auth- of h3-import: server/auth en server/organisaties/leden gebruiken ze
// allebei.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { member } from "../db/schema";

/** De foutcode wanneer een actie de organisatie zonder eigenaar zou laten. */
export const LAATSTE_EIGENAAR = "LAATSTE_EIGENAAR";

export const LAATSTE_EIGENAAR_BOODSCHAP = "Er moet minstens één eigenaar blijven.";

/** Een organisatienaam: 1 tot 80 tekens na trimmen. */
export const MAX_NAAMLENGTE = 80;

/** `owner` (ook in een lijst als `owner,member`) is eigenaar. */
export function isEigenaarRol(rol: string | null | undefined): boolean {
  return (rol ?? "").split(",").some((r) => r.trim() === "owner");
}

/** De getrimde naam als die 1 tot 80 tekens telt, anders null. */
export function geldigeNaam(naam: unknown): string | null {
  if (typeof naam !== "string") return null;
  const getrimd = naam.trim();
  return getrimd.length >= 1 && getrimd.length <= MAX_NAAMLENGTE ? getrimd : null;
}

/**
 * Zou deze wijziging de laatste eigenaar weghalen? Waar: het lid is eigenaar, zijn nieuwe rol
 * (null = hij verdwijnt) is geen eigenaar meer, en er is geen andere eigenaar.
 */
export async function haaltLaatsteEigenaarWeg(
  db: Db,
  organisatieId: string,
  lid: { rol: string },
  nieuweRol: string | null,
): Promise<boolean> {
  if (!isEigenaarRol(lid.rol)) return false;
  if (nieuweRol !== null && isEigenaarRol(nieuweRol)) return false;
  const rollen = await db.select({ rol: member.role }).from(member).where(eq(member.organizationId, organisatieId));
  return rollen.filter((r) => isEigenaarRol(r.rol)).length <= 1;
}
