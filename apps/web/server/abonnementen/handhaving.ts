// Schrijfrecht: de schrijfroutes voor projecten roepen `vereisSchrijfrecht` aan, na de
// lidmaatschapscontrole en vóór elke wijziging.
//
// Sinds het prijsmodel staat een bedrijf nooit meer volledig op alleen-lezen (spec 4.3): de
// beslissing gebeurt per project. Tot taak 4 van het prijsmodel de handhaving per project invoert,
// laat deze functie daarom alles door.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

/** Laat elke organisatie door: een bedrijf is nooit meer volledig alleen-lezen. */
export async function vereisSchrijfrecht(_organisatieId: string): Promise<void> {}
