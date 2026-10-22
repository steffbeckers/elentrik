// De bedrijfsgegevens van de organisatie van de ingelogde testgebruiker op een bekende basislijn
// zetten. Elke spec heeft een eigen organisatie, dus niets hoeft achteraf hersteld te worden.
import type { APIRequestContext } from "@playwright/test";

/** Een bekende uitgangstoestand voor elke test: enkel de naam, zonder adres of contactgegevens. */
export async function zetBedrijfBasislijn(request: APIRequestContext): Promise<void> {
  const antwoord = await request.put("/api/bedrijfsgegevens", { data: { naam: "E2E" } });
  if (!antwoord.ok()) throw new Error(`Basislijn bewaren mislukt: ${antwoord.status()}`);
}
