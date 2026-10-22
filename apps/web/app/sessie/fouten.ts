// De foutcode en de HTTP-status uit een fout, ongeacht waar ze vandaan komt:
// - `$fetch` op een eigen route: het antwoord is een h3-fout, met de code in `data.data.code`;
// - een h3-fout of een antwoordlichaam van een eigen route: `data.code`;
// - de Better Auth-client (`{ error }`): de code bovenaan, in `code`.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

function veld(waarde: unknown, sleutel: string): unknown {
  return waarde !== null && typeof waarde === "object" ? (waarde as Record<string, unknown>)[sleutel] : undefined;
}

function alsTekst(waarde: unknown): string | undefined {
  return typeof waarde === "string" && waarde !== "" ? waarde : undefined;
}

/** De foutcode (bv. `LAATSTE_EIGENAAR` of `EMAIL_NOT_VERIFIED`), of undefined. */
export function foutCode(fout: unknown): string | undefined {
  const data = veld(fout, "data");
  return alsTekst(veld(veld(data, "data"), "code")) ?? alsTekst(veld(data, "code")) ?? alsTekst(veld(fout, "code"));
}

/** De HTTP-status (`status` of `statusCode`), of undefined. */
export function foutStatus(fout: unknown): number | undefined {
  const waarde = veld(fout, "status") ?? veld(fout, "statusCode");
  return typeof waarde === "number" ? waarde : undefined;
}
