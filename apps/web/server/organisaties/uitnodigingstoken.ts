// De geheime token in de link van een uitnodigingsmail. Het id van een uitnodiging is geen geheim
// (een lid of eigenaar kan het zien); alleen wie de mail ontvangt, heeft de token. Daarom
// gebruiken de publieke routes (bekijken, registreren) en het aanvaarden de token, nooit het id.
//
// De token is 32 willekeurige bytes in base64url. In de database staat alleen zijn SHA-256-hash,
// in `verification` met identifier `uitnodiging:<hash>` en als waarde het id van de uitnodiging,
// met dezelfde vervaldatum als de uitnodiging. Een nieuwe mail (opnieuw versturen) vervangt de
// vorige token.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import type { Db } from "../db";
import { verification } from "../db/schema";

const VOORVOEGSEL = "uitnodiging:";
const TOKENVORM = /^[A-Za-z0-9_-]{43}$/;

function sleutel(token: string): string {
  return VOORVOEGSEL + createHash("sha256").update(token, "utf8").digest("base64url");
}

/**
 * Maakt een nieuwe token voor deze uitnodiging (en wist de vorige) en geeft hem terug; hij staat
 * alleen in de mail, de database kent alleen de hash.
 */
export async function maakUitnodigingstoken(db: Db, uitnodigingId: string, verlooptOp: Date): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const nu = new Date();
  await db.transaction(async (tx) => {
    await tx
      .delete(verification)
      .where(and(eq(verification.value, uitnodigingId), like(verification.identifier, `${VOORVOEGSEL}%`)));
    await tx.insert(verification).values({
      id: randomUUID(),
      identifier: sleutel(token),
      value: uitnodigingId,
      expiresAt: verlooptOp,
      createdAt: nu,
      updatedAt: nu,
    });
  });
  return token;
}

/**
 * Het id van de uitnodiging bij deze token, of null: een onbekende, misvormde of verlopen token
 * geven allemaal null. De uitnodiging zelf kan intussen gebruikt of ingetrokken zijn; dat
 * controleert de aanroeper.
 */
export async function uitnodigingVanToken(db: Db, token: string): Promise<string | null> {
  if (!TOKENVORM.test(token)) return null;
  const gezocht = sleutel(token);
  const [rij] = await db
    .select({ identifier: verification.identifier, value: verification.value, expiresAt: verification.expiresAt })
    .from(verification)
    .where(eq(verification.identifier, gezocht));
  if (!rij) return null;
  const a = Buffer.from(rij.identifier);
  const b = Buffer.from(gezocht);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (rij.expiresAt.getTime() <= Date.now()) return null;
  return rij.value;
}

/** Wist de token(s) van een uitnodiging: na gebruik is de link niets meer waard. */
export async function wisUitnodigingstokens(db: Db, uitnodigingId: string): Promise<void> {
  await db
    .delete(verification)
    .where(and(eq(verification.value, uitnodigingId), like(verification.identifier, `${VOORVOEGSEL}%`)));
}
