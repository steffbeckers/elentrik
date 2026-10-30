// De plaatshouders uit deploy/nas/.env.voorbeeld en apps/web/.env.example. Een waarde die er exact mee
// overeenkomt (na het wegknippen van witruimte) is nog niet ingevuld; elke andere waarde is geldig, ook
// een wachtwoord dat toevallig met "<" begint. test/configuratie.test.ts leidt de lijst uit die twee
// bestanden af en faalt als ze afwijkt: voeg een nieuwe plaatshouder dus ook hier toe.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

export const PLAATSHOUDERS: ReadonlySet<string> = new Set([
  "<vervang-door-een-lange-willekeurige-waarde>",
  "<vervang-door-een-andere-lange-willekeurige-waarde>",
  "<tenant-id>",
  "<client-id>",
  "<client-geheim>",
  "<mailserver>",
  "<gebruikersnaam>",
  "<wachtwoord>",
  "<cidr>",
  "<afzenderadres>",
]);

/** Is deze waarde exact een plaatshouder uit de voorbeeldbestanden? */
export function isPlaatshouder(waarde: string | undefined): boolean {
  return waarde !== undefined && PLAATSHOUDERS.has(waarde.trim());
}
