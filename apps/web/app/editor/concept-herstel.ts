// Het herstel van een lokaal concept. Een concept kan van een oudere schemaversie zijn (de gebruiker
// werkte voor een update): het document gaat eerst door `migreer`, zoals een document van de server.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks (ruling E1).
import { migreer, type InstallatieDocument } from "@elentrik/model";

/**
 * Het gemigreerde document van een concept, of null als het niet te migreren is (een onbekende of
 * kapotte schemaversie). De aanroeper laadt dan niets en wist het concept niet.
 * `migreerFn` is injecteerbaar voor de test.
 */
export function herstelDocument(
  document: unknown,
  migreerFn: (invoer: unknown) => InstallatieDocument = migreer,
): InstallatieDocument | null {
  try {
    return migreerFn(document);
  } catch {
    return null;
  }
}
