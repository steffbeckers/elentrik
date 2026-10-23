// De centrale vertaling van een fout van de server in de client (plan 8, Task 4). De server stuurt
// een code (`data.code` van een eigen route, `code` van Better Auth); de client toont
// `fouten.<CODE>` uit de vertaalbestanden. Een onbekende code, een netwerkfout of een fout zonder
// code geeft `fouten.onbekend`. De `statusMessage` van de server is Nederlands en alleen voor logs:
// die komt nooit in beeld.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { isFoutcode, type Foutcode } from "../shared/foutcodes";
import { foutCode, foutStatus } from "./sessie/fouten";

/** De rate limiter van Better Auth antwoordt 429 zonder code; voor de gebruiker is dat dit. */
const TE_VEEL_POGINGEN: Foutcode = "TE_VEEL_POGINGEN";

/** De code uit `FOUTCODES` die bij deze fout hoort, of undefined (dan is de fout onbekend). */
export function bekendeFoutcode(fout: unknown): Foutcode | undefined {
  const code = foutCode(fout);
  if (isFoutcode(code)) return code;
  return foutStatus(fout) === 429 ? TE_VEEL_POGINGEN : undefined;
}

/** De vertaalde melding bij een fout: `fouten.<CODE>`, anders `fouten.onbekend`. */
export function vertaalFout(fout: unknown, t: (sleutel: string) => string): string {
  const code = bekendeFoutcode(fout);
  return t(code ? `fouten.${code}` : "fouten.onbekend");
}
