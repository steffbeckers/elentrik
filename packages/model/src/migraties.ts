import { parseDocument } from "./document";
import { DocumentFout } from "./fouten";
import type { InstallatieDocument } from "./schema";
import { SCHEMA_VERSIE } from "./versie";

/**
 * Migreert een document van versie n naar n+1.
 * Contract: een migratie zet `schemaVersion` zelf niet; `pasMigratiesToe`
 * zet `schemaVersion` op n+1 nadat migratie n is uitgevoerd.
 */
export type Migratie = (doc: Record<string, unknown>) => Record<string, unknown>;

/** De sleutel `n` migreert van versie n naar n+1. Voorlopig leeg. */
export const MIGRATIES: Readonly<Record<number, Migratie>> = {};

export function pasMigratiesToe(
  doc: Record<string, unknown>,
  migraties: Readonly<Record<number, Migratie>>,
  van: number,
  naar: number,
): Record<string, unknown> {
  if (van > naar) throw new DocumentFout("ONBEKENDE_SCHEMAVERSIE", { van, naar });
  let huidig: Record<string, unknown> = { ...doc };
  for (let n = van; n < naar; n++) {
    const migratie = migraties[n];
    if (!migratie) throw new DocumentFout("ONBEKENDE_SCHEMAVERSIE", { ontbrekendeStap: n });
    huidig = { ...migratie(huidig), schemaVersion: n + 1 };
  }
  return huidig;
}

export function migreer(invoer: unknown): InstallatieDocument {
  if (typeof invoer !== "object" || invoer === null || Array.isArray(invoer)) {
    throw new DocumentFout("ONGELDIG_SCHEMA");
  }
  const doc = invoer as Record<string, unknown>;
  const versie = doc.schemaVersion;
  if (typeof versie !== "number" || !Number.isInteger(versie) || versie < 1) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { schemaVersion: versie });
  }
  if (versie > SCHEMA_VERSIE) {
    throw new DocumentFout("ONBEKENDE_SCHEMAVERSIE", { schemaVersion: versie });
  }
  return parseDocument(pasMigratiesToe(doc, MIGRATIES, versie, SCHEMA_VERSIE));
}
