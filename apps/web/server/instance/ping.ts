// De instance-ping: een zelf gehoste kopie meldt dagelijks anoniem dat ze bestaat (willekeurig
// instance-id, hostnaam, versie, of abonnementen aan staan, aantallen organisaties en gebruikers).
// Geen namen, e-mailadressen of inhoud. Uit te zetten met ELENTRIK_INSTANCE_PING=uit. Een fout
// geeft hooguit één waarschuwing per proces en nooit een exception.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import { randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import type { Db } from "../db";
import { instance, organization, user } from "../db/schema";
import { leesOmgeving } from "../../shared/omgeving";
import type { InstanceMelding } from "../../shared/instance";
import { geplandeTakenAan } from "../taken/lock";

export const INSTANCE_PING_URL = "https://elentrik.app/api/instances";

type Env = Record<string, string | undefined>;
export type PingUitkomst = "verstuurd" | "uit" | "mislukt";

let gewaarschuwd = false;

/** Alleen voor tests. */
export function __resetWaarschuwing(): void {
  gewaarschuwd = false;
}

function waarschuw(reden: string): void {
  if (gewaarschuwd) return;
  gewaarschuwd = true;
  console.warn(`[instance-ping] melding mislukt: ${reden}`);
}

/** De hosts van de officiële omgevingen (productie en staging); die sturen zelf nooit een ping. */
export const OFFICIELE_HOSTS = ["elentrik.app", "staging.elentrik.app"];

/**
 * Alleen een productiebuild buiten de officiële omgevingen pingt, tenzij het is uitgezet. Een
 * officiële omgeving heeft `ELENTRIK_OMGEVING` gezet én een officiële host; een kopie van de
 * NAS-stack met een andere `BETTER_AUTH_URL` pingt dus wel.
 */
export function pingActief(env: Env): boolean {
  if (env.NODE_ENV !== "production") return false;
  const host = hostUit(env.BETTER_AUTH_URL);
  if (leesOmgeving(env) !== null && host !== null && OFFICIELE_HOSTS.includes(host)) return false;
  if (env.ELENTRIK_INSTANCE_PING?.trim().toLowerCase() === "uit") return false;
  return geplandeTakenAan(env);
}

/** De hostnaam uit een basis-URL, in kleine letters en zonder blokhaken; `null` als er geen is. */
export function hostUit(basisUrl: string | undefined): string | null {
  if (!basisUrl) return null;
  try {
    const host = new URL(basisUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Het vaste id van deze instance; twee processen tegelijk krijgen hetzelfde id. */
export async function zorgVoorInstanceId(db: Db): Promise<string> {
  await db.insert(instance).values({ id: randomUUID() }).onConflictDoNothing({ target: instance.sleutel });
  const [rij] = await db.select({ id: instance.id }).from(instance);
  if (!rij) throw new Error("instance zonder id");
  return rij.id;
}

export async function bouwMelding(db: Db, env: Env): Promise<InstanceMelding | null> {
  const host = hostUit(env.BETTER_AUTH_URL);
  if (!host) return null;
  const instanceId = await zorgVoorInstanceId(db);
  const [organisaties] = await db.select({ aantal: count() }).from(organization);
  const [gebruikers] = await db.select({ aantal: count() }).from(user);
  const revisie = env.ELENTRIK_REVISIE?.trim();
  return {
    instanceId,
    host,
    versie: revisie && revisie.length <= 64 ? revisie : "onbekend",
    abonnementenAan: Boolean(env.STRIPE_GEHEIME_SLEUTEL?.trim()),
    aantalOrganisaties: organisaties?.aantal ?? 0,
    aantalGebruikers: gebruikers?.aantal ?? 0,
  };
}

export async function verstuurPing(opties: { db: Db; env: Env; fetch?: typeof fetch }): Promise<PingUitkomst> {
  const { db, env } = opties;
  if (!pingActief(env)) return "uit";
  try {
    const melding = await bouwMelding(db, env);
    if (!melding) {
      waarschuw("BETTER_AUTH_URL ontbreekt of is ongeldig");
      return "mislukt";
    }
    const antwoord = await (opties.fetch ?? fetch)(env.ELENTRIK_INSTANCE_PING_URL?.trim() || INSTANCE_PING_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "Elentrik-instance-ping" },
      body: JSON.stringify(melding),
      signal: AbortSignal.timeout(10_000),
    });
    if (!antwoord.ok) {
      waarschuw(`antwoord ${antwoord.status}`);
      return "mislukt";
    }
    return "verstuurd";
  } catch (fout) {
    waarschuw(fout instanceof Error ? fout.message : "onbekende fout");
    return "mislukt";
  }
}
