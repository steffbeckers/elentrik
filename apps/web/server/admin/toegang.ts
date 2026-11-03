import { eq } from "drizzle-orm";
import { setResponseHeader, type H3Event } from "h3";
import { gebruikDb } from "../db";
import { user } from "../db/schema";
import { maakFout } from "../fouten";
import { vereisVerwachteGebruiker } from "../utils/toegang";

export type AdminActor = { id: string; naam: string; sessieId: string };

/** Geen rolcache: intrekken geldt ook voor een al geopend beheervenster. */
export async function vereisSuperuser(event: H3Event): Promise<AdminActor> {
  setResponseHeader(event, "cache-control", "no-store");
  const sessie = await vereisVerwachteGebruiker(event);
  const [rij] = await gebruikDb().select({ superuser: user.superuser, naam: user.name, bevestigd: user.emailVerified })
    .from(user).where(eq(user.id, sessie.gebruiker.id));
  if (!rij?.superuser || !rij.bevestigd) throw maakFout(403, "Alleen een systeembeheerder mag dit", "NIET_TOEGELATEN");
  return { id: sessie.gebruiker.id, naam: rij.naam, sessieId: sessie.sessieId };
}
