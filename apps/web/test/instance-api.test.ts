// POST /api/instances: de route draait in een echte h3-app op 127.0.0.1 met de database op PGlite,
// zoals een server-naar-server-aanroep (zonder Origin, Sec-Fetch-Site of client-versie-header).
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type Db, zetDb } from "../server/db";
import { instanceMeldingen } from "../server/db/schema";
import { maakTestDb } from "./db";
import { apiPad, beveiligdeRoutebestanden, routeUit } from "./routes";

let db: Db;
let server: Server;
let basis: string;
/** Aantal verzoeken dat de limiet van 127.0.0.1 al telde (alleen verzoeken op productie). */
let geteld = 0;

const geldig = () =>
  JSON.stringify({
    instanceId: crypto.randomUUID(),
    host: "elentrik.voorbeeld.be",
    versie: "abc1234",
    abonnementenAan: false,
    aantalOrganisaties: 1,
    aantalGebruikers: 2,
  });

async function stuur(lichaam: string | Uint8Array): Promise<Response> {
  geteld++;
  return fetch(`${basis}/api/instances`, {
    method: "POST",
    // Geen keep-alive: bij een vroege weigering (413) sluit de server de verbinding.
    headers: { "content-type": "application/json", connection: "close" },
    body: lichaam,
  });
}

beforeAll(async () => {
  const app = createApp();
  const router = createRouter();
  for (const bestand of beveiligdeRoutebestanden()) {
    if (apiPad(bestand) !== "instances.post.ts") continue;
    const route = routeUit(bestand);
    const handler = (await import(/* @vite-ignore */ bestand)).default as EventHandler;
    router[route.methode](route.pad, handler);
  }
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((klaar) => server.close(() => klaar())));

beforeEach(async () => {
  db = await maakTestDb();
  zetDb(db);
  vi.stubEnv("ELENTRIK_OMGEVING", "productie");
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/instances", () => {
  test("zonder ELENTRIK_OMGEVING=productie: 404 en niets opgeslagen", async () => {
    vi.stubEnv("ELENTRIK_OMGEVING", "");
    const antwoord = await stuur(geldig());
    geteld--; // buiten productie telt de limiet niet
    expect(antwoord.status).toBe(404);
    expect(await db.select().from(instanceMeldingen)).toHaveLength(0);
  });

  test("een geldige melding geeft 204 en een rij", async () => {
    const antwoord = await stuur(geldig());
    expect(antwoord.status).toBe(204);
    expect(await db.select().from(instanceMeldingen)).toHaveLength(1);
  });

  test.each(["geen json", "[]", "null"])("het lichaam %s geeft 400", async (lichaam) => {
    const antwoord = await stuur(lichaam);
    expect(antwoord.status).toBe(400);
    expect(await db.select().from(instanceMeldingen)).toHaveLength(0);
  });

  test("een lichaam van 2049 bytes geeft 413", async () => {
    const antwoord = await stuur(new Uint8Array(2049).fill(0x20));
    expect(antwoord.status).toBe(413);
  });

  test("een chunked lichaam boven 2048 bytes geeft 413", async () => {
    geteld++;
    const stroom = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 3; i++) controller.enqueue(new Uint8Array(1000).fill(0x20));
        controller.close();
      },
    });
    const antwoord = await fetch(`${basis}/api/instances`, {
      method: "POST",
      headers: { "content-type": "application/json", connection: "close" },
      body: stroom,
      duplex: "half",
    } as RequestInit);
    expect(antwoord.status).toBe(413);
    expect(await db.select().from(instanceMeldingen)).toHaveLength(0);
  });

  test("de 11de melding van hetzelfde IP binnen het uur geeft 429", async () => {
    // De eerdere tests telden al mee voor 127.0.0.1: vul aan tot 10 en controleer de 11de.
    while (geteld < 10) expect((await stuur(geldig())).status).toBe(204);
    expect((await stuur(geldig())).status).toBe(429);
  });
});
