// De omhulling van `fetch` voor het compatibiliteitsgetal (zie shared/clientversie.ts): een eigen
// /api-verzoek krijgt `X-Elentrik-Client`, en actuele API-antwoorden geven hun
// `X-Elentrik-Client-Minimum` en een 426 NIEUWE_VERSIE_VEREIST door.
//
// Het zit op `fetch` en niet op `$fetch`: de auto-import `$fetch` van Nuxt is een vaste verwijzing
// naar het eerste `$fetch`, die een latere `globalThis.$fetch = ...` niet meer volgt. ofetch roept
// `globalThis.fetch` wel bij elk verzoek aan, dus wie dáár omheen zit, ziet alle verzoeken van de app
// (`$fetch`, `useFetch`).
//
// De routes van Better Auth (`/api/auth/`) krijgen de header niet mee: de server laat een verzoek
// zonder header altijd door, zodat inloggen en uitloggen nooit door een verouderde client geweigerd
// worden. Hun antwoorden tellen wel mee.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).
import { CLIENT_HEADER, CLIENT_MINIMUM_HEADER } from "../../shared/clientversie";
import { isNieuweVersieFout } from "./regels";

export type OmhullingOpties = {
  /** De origin van de pagina; alleen daar naartoe gaat de header. */
  origin: string;
  /** Het eigen compatibiliteitsgetal. */
  eigenGetal: number;
  /** De waarde van `X-Elentrik-Client-Minimum` van een antwoord. */
  bijServerversie: (waarde: string) => void;
  /** Een 426 NIEUWE_VERSIE_VEREIST. */
  bijVereist: () => void;
};

export function omhulFetch(origineel: typeof fetch, opties: OmhullingOpties): typeof fetch {
  return async (invoer, init) => {
    const url = new URL(invoer instanceof Request ? invoer.url : String(invoer), opties.origin);
    if (url.origin !== opties.origin || !url.pathname.startsWith("/api/")) return origineel(invoer, init);

    let verzoek = init;
    if (!url.pathname.startsWith("/api/auth/")) {
      const headers = new Headers(init?.headers ?? (invoer instanceof Request ? invoer.headers : undefined));
      headers.set(CLIENT_HEADER, String(opties.eigenGetal));
      verzoek = { ...init, headers };
    }

    const antwoord = await origineel(invoer, verzoek);

    // Iconen en bestanden mogen lang in de browsercache blijven. Hun headers kunnen daardoor
    // bij een vorige serverversie horen; alleen actuele API-antwoorden bepalen compatibiliteit.
    // Mutaties en expliciete 426-antwoorden blijven wel meetellen, ook op deze routes.
    const methode = (init?.method ?? (invoer instanceof Request ? invoer.method : "GET")).toUpperCase();
    const cachebaarAsset = (methode === "GET" || methode === "HEAD") &&
      ["/api/_nuxt_icon/", "/api/bestanden/", "/api/admin/bestanden/"].some(prefix => url.pathname.startsWith(prefix));
    const minimum = antwoord.headers.get(CLIENT_MINIMUM_HEADER);
    if (minimum !== null && !cachebaarAsset) opties.bijServerversie(minimum);
    if (antwoord.status === 426) {
      // Een kopie lezen: het antwoord zelf blijft voor de aanroeper bruikbaar.
      const data: unknown = await antwoord.clone().json().catch(() => null);
      if (isNieuweVersieFout({ status: antwoord.status, data })) opties.bijVereist();
    }
    return antwoord;
  };
}
