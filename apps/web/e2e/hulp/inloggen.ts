// Een ingelogde testgebruiker met een eigen organisatie voor een e2e-spec. Registreren gaat via de
// API van Better Auth; de bevestigingslink uit Mailpit bevestigt het adres en logt meteen in
// (autoSignInAfterVerification), waarna de eerste organisatie ontstaat met de bedrijfsnaam.
//
// Rate limiting geldt ook in e2e (aanmelden en registreren: 3 per 10 s vanaf 127.0.0.1). Daarom
// maakt `gebruikTestgebruiker` per specbestand één gebruiker in `beforeAll` en hergebruikt elke
// test diens `storageState`; er wordt nooit per test ingelogd.
import type { APIRequestContext, APIResponse, BrowserContextOptions, test as basis } from "@playwright/test";
import { E2E_URL } from "../omgeving";
import { laatsteMailAan, linkUit } from "./mailpit";
import { nieuwSpoor, ruimOp, type E2eSpoor } from "./opruimen";

export type StorageState = Exclude<BrowserContextOptions["storageState"], string | undefined>;

export type Testgebruiker = { naam: string; email: string; bedrijf: string };

export const TESTWACHTWOORD = "e2e-wachtwoord-123";
/** Zo vaak opnieuw proberen na een 429 van de rate limiter. */
const MAX_POGINGEN = 5;

/** Een uniek adres per run en per specbestand, zodat geen twee specs een gebruiker delen. */
export function uniekAdres(voorvoegsel: string): string {
  const willekeurig = Math.random().toString(36).slice(2, 8);
  return `${voorvoegsel}-${Date.now()}-${willekeurig}@e2e.elentrik.test`;
}

/** Een POST naar Better Auth; bij een 429 wachten zoals de server vraagt, en opnieuw. */
async function postAuth(request: APIRequestContext, pad: string, data: unknown): Promise<APIResponse> {
  for (let poging = 1; ; poging++) {
    const antwoord = await request.post(`${E2E_URL}/api/auth${pad}`, {
      data,
      headers: { origin: E2E_URL },
    });
    if (antwoord.status() !== 429 || poging >= MAX_POGINGEN) return antwoord;
    const wacht = Number(antwoord.headers()["x-retry-after"] ?? "2");
    await new Promise((klaar) => setTimeout(klaar, (Number.isFinite(wacht) ? wacht + 0.5 : 2) * 1000));
  }
}

/**
 * Registreert via de API, bevestigt via de link uit Mailpit (wat ook inlogt) en geeft de
 * `storageState` met de sessiecookie terug. De gebruiker is eigenaar van een nieuwe organisatie
 * met de naam `bedrijf`.
 */
export async function maakTestgebruiker(
  request: APIRequestContext,
  gebruiker: Testgebruiker,
): Promise<StorageState> {
  const sinds = new Date(Date.now() - 1000);
  const registratie = await postAuth(request, "/sign-up/email", {
    name: gebruiker.naam,
    email: gebruiker.email,
    password: TESTWACHTWOORD,
    wachtendeBedrijfsnaam: gebruiker.bedrijf,
  });
  if (!registratie.ok()) {
    throw new Error(`Registreren van de testgebruiker mislukt: ${registratie.status()}`);
  }

  const link = linkUit(await laatsteMailAan(gebruiker.email, { na: sinds }));
  const bevestiging = await request.get(link, { maxRedirects: 0 });
  if (bevestiging.status() >= 400) {
    throw new Error(`Bevestigen van de testgebruiker mislukt: ${bevestiging.status()}`);
  }

  // De sessie werkt en de organisatie bestaat: de bedrijfsgegevens zijn bereikbaar.
  const controle = await request.get(`${E2E_URL}/api/bedrijfsgegevens`);
  if (!controle.ok()) {
    throw new Error(`De testgebruiker is niet ingelogd in een organisatie: ${controle.status()}`);
  }
  return request.storageState();
}

/**
 * Eén testgebruiker met een eigen organisatie voor het hele specbestand: aangemaakt in
 * `beforeAll`, en via `storageState` ingelogd in elke test (ook in `page` en `request`).
 *
 * De hulp geeft ook het spoor van het bestand terug, met de gebruiker er al in. Een spec die meer
 * aanmaakt (nog een gebruiker, een gezaaid project) registreert dat daarin, vóór hij het maakt.
 * In `afterAll` wist `ruimOp` alles van het spoor echt uit de e2e-database en de e2e-bestandenmap,
 * ook als een test faalde.
 */
export function gebruikTestgebruiker(
  test: typeof basis,
  opties: { naam?: string; bedrijf?: string; voorvoegsel?: string } = {},
): { gebruiker: () => Testgebruiker; spoor: E2eSpoor } {
  const gebruiker: Testgebruiker = {
    naam: opties.naam ?? "E2E Tester",
    email: uniekAdres(opties.voorvoegsel ?? "e2e"),
    bedrijf: opties.bedrijf ?? "E2E Elektro",
  };
  const spoor = nieuwSpoor();
  // Vóór het aanmaken geregistreerd: ook een halve registratie wordt opgeruimd.
  spoor.emails.add(gebruiker.email);
  let staat: StorageState | undefined;

  test.afterAll(async () => {
    await ruimOp(spoor);
  });

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: E2E_URL });
    try {
      staat = await maakTestgebruiker(request, gebruiker);
    } finally {
      await request.dispose();
    }
  });

  // Lui: Playwright bouwt de testfixtures ook voor de hooks zelf, ook vóór deze beforeAll de
  // gebruiker heeft aangemaakt. Daar is er nog geen sessie (undefined); in de tests wel.
  test.use({
    storageState: async ({}, use) => {
      await use(staat);
    },
  });

  return { gebruiker: () => gebruiker, spoor };
}
