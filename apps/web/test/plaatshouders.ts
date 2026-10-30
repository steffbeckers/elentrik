// De plaatshouders die echt in de voorbeeldbestanden staan, afgeleid uit die bestanden zelf zodat de
// lijst in de code en de tests niet kan afwijken: `NAAM=<...>` (ook als `# NAAM=<...>`) waarvan de hele
// waarde één plaatshouder is. Een waarde als `"Elentrik <noreply@elentrik.app>"` is er geen.
// Expliciete imports (ruling E1).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const WEB = join(import.meta.dirname, "..");

export const VOORBEELDBESTANDEN = [join(WEB, "..", "..", "deploy", "nas", ".env.voorbeeld"), join(WEB, ".env.example")];

/** Alle plaatshouders in de voorbeeldbestanden, zonder dubbelen, in volgorde van voorkomen. */
export function plaatshoudersUitVoorbeelden(): string[] {
  const gevonden = new Set<string>();
  for (const bestand of VOORBEELDBESTANDEN) {
    for (const regel of readFileSync(bestand, "utf8").split(/\r?\n/)) {
      const treffer = /^\s*(?:#\s*)?[A-Z][A-Z0-9_]*=\s*(["']?)(<[^<>\s"']+>)\1\s*(?:#.*)?$/.exec(regel);
      if (treffer) gevonden.add(treffer[2]!);
    }
  }
  return [...gevonden];
}
