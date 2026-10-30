// Gedeelde hulp voor de routetests (routes-beveiligd en toegang): welke bestanden Nitro als
// API-route serveert, en hun methode en pad. Expliciete imports (ruling E1).
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { RouterMethod } from "h3";

export const SERVER = join(import.meta.dirname, "..", "server");
export const API = join(SERVER, "api");

/** De enige uitzondering op de toegangswrapper: de catch-all van Better Auth. */
export const AUTH_ROUTE = "auth/[...all].ts";

/**
 * De publieke routes: ze gebruiken de wrapper, maar met `{ publiek: true }` (geen sessie nodig).
 * Elke publieke route staat hier met naam; de statische test en de routetabel controleren dat.
 */
export const PUBLIEKE_ROUTES = [
  "uitnodigingen/[token].get.ts",
  "uitnodigingen/[token]/registreer.post.ts",
  "stripe/webhook.post.ts",
  "gezondheid.get.ts",
];

export function bestandenIn(map: string): string[] {
  return readdirSync(map, { withFileTypes: true }).flatMap((item) => {
    const pad = join(map, item.name);
    return item.isDirectory() ? bestandenIn(pad) : [pad];
  });
}

/** Het pad van een bestand t.o.v. server/api, met `/` als scheidingsteken. */
export function apiPad(bestand: string): string {
  return relative(API, bestand).split(sep).join("/");
}

/** Alle routebestanden onder server/api behalve `auth/[...all].ts`, als absolute paden. */
export function beveiligdeRoutebestanden(): string[] {
  return bestandenIn(API)
    .filter((pad) => apiPad(pad) !== AUTH_ROUTE)
    .sort();
}

export type Route = { sleutel: string; methode: RouterMethod; pad: string; bestand: string };

/** `projecten/[id]/exports.post.ts` wordt `POST /api/projecten/:id/exports`. */
export function routeUit(bestand: string): Route {
  const relatief = apiPad(bestand);
  const treffer = /^(.*?)(?:\/?index)?\.(get|post|put|delete)\.ts$/.exec(relatief);
  if (!treffer) throw new Error(`Onbekende routevorm: ${relatief}`);
  const pad = `/api/${treffer[1]!}`.replace(/\[(\w+)\]/g, ":$1").replace(/\/$/, "");
  const methode = treffer[2] as RouterMethod;
  return { sleutel: `${methode.toUpperCase()} ${pad}`, methode, pad, bestand };
}

/**
 * De bron zonder commentaar en zonder de inhoud van teksten (`"..."`, `'...'` en `` `...` ``): zo telt een
 * aanroep die alleen in commentaar of in een tekst staat niet mee. Lengte en regelovergangen blijven
 * gelijk (alles wat wegvalt wordt een spatie). Een eenvoudige scanner, geen volledige parser: een
 * regex-literal met een ongeëscapete `//` of aanhalingsteken erin valt buiten wat ze begrijpt.
 */
export function zonderCommentaar(bron: string): string {
  const wis = (tekst: string) => tekst.replace(/[^\n]/g, " ");
  let uit = "";
  let i = 0;
  while (i < bron.length) {
    const c = bron[i]!;
    const volgende = bron[i + 1];
    if (c === "/" && volgende === "/") {
      const einde = bron.indexOf("\n", i);
      const stuk = bron.slice(i, einde < 0 ? bron.length : einde);
      uit += wis(stuk);
      i += stuk.length;
    } else if (c === "/" && volgende === "*") {
      const einde = bron.indexOf("*/", i + 2);
      const stuk = bron.slice(i, einde < 0 ? bron.length : einde + 2);
      uit += wis(stuk);
      i += stuk.length;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < bron.length && bron[j] !== c) j += bron[j] === "\\" ? 2 : 1;
      const stuk = bron.slice(i + 1, Math.min(j, bron.length));
      uit += c + wis(stuk) + (j < bron.length ? c : "");
      i = j + 1;
    } else {
      uit += c;
      i++;
    }
  }
  return uit;
}
