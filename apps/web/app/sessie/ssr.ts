// /api/mij tijdens SSR, met de verlengde sessiecookie terug naar de browser.
//
// Better Auth verlengt een sessie bij gebruik (updateAge: 1 dag) en zet dan een nieuwe cookie in
// het antwoord. Tijdens SSR gaat dat antwoord naar de server zelf, niet naar de browser; zonder
// doorsturen schuift de vervaldatum in de database op, maar die van de cookie niet. Daarom gaat
// elke Set-Cookie van /api/mij mee in het antwoord van de pagina.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import type { Mij } from "../stores/sessie";

/** Elke Set-Cookie-header apart (een vervaldatum bevat zelf een komma). */
export function setCookies(headers: Headers): string[] {
  return headers.getSetCookie();
}

export type RuwAntwoord<T> = { _data?: T; headers: Headers };

export type ServerMijOpties = {
  /** `$fetch.raw` van Nuxt: het antwoord met zijn headers. */
  haalRuw: (pad: string, opties: { headers: Record<string, string> }) => Promise<RuwAntwoord<Mij>>;
  /** De Cookie-header van het verzoek van de browser. */
  cookie: string | undefined;
  /** Voegt een Set-Cookie toe aan het antwoord van de pagina. */
  voegCookieToe: (waarde: string) => void;
};

function headersVanFout(fout: unknown): Headers | undefined {
  const antwoord = fout && typeof fout === "object" ? (fout as { response?: { headers?: unknown } }).response : undefined;
  return antwoord?.headers instanceof Headers ? antwoord.headers : undefined;
}

/** GET /api/mij met de cookie van de browser; de Set-Cookies van het antwoord gaan door naar de pagina. */
export async function haalMijOpServer({ haalRuw, cookie, voegCookieToe }: ServerMijOpties): Promise<Mij> {
  try {
    const antwoord = await haalRuw("/api/mij", { headers: cookie ? { cookie } : {} });
    for (const waarde of setCookies(antwoord.headers)) voegCookieToe(waarde);
    return antwoord._data as Mij;
  } catch (fout) {
    const headers = headersVanFout(fout);
    if (headers) for (const waarde of setCookies(headers)) voegCookieToe(waarde);
    throw fout;
  }
}
