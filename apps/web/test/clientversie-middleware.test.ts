// De middleware clientversie: elk /api-antwoord meldt het minimum, en een schrijfactie van een
// client met een ander getal krijgt 426 NIEUWE_VERSIE_VEREIST. Zonder header (de Stripe-webhook,
// de Docker-healthcheck) of buiten /api gebeurt er niets.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, defineEventHandler, toNodeListener, type EventHandler } from "h3";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { CLIENT_HEADER, CLIENT_MINIMUM_HEADER } from "../shared/clientversie";

// De server staat op 3, zodat er ook een lager geldig getal bestaat (bij 1 is 0 ongeldig).
vi.mock("../shared/clientversie", async (origineel) => ({
  ...(await origineel<typeof import("../shared/clientversie")>()),
  CLIENT_COMPATIBILITEIT: 3,
}));

let server: Server;
let basis: string;

beforeAll(async () => {
  const middleware = (await import("../server/middleware/clientversie")) as { default: EventHandler };
  const router = createRouter();
  const ok = defineEventHandler(() => ({ ok: true }));
  router.post("/api/x", ok);
  router.get("/api/x", ok);
  router.post("/buiten", ok);
  const app = createApp();
  app.use(middleware.default);
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
});

const MINIMUM = "3";
const LAGER = "2";
const HOGER = "4";

describe("clientversie-middleware", () => {
  test("elk /api-antwoord heeft X-Elentrik-Client-Minimum", async () => {
    const goed = await fetch(`${basis}/api/x`);
    expect(goed.headers.get(CLIENT_MINIMUM_HEADER)).toBe(MINIMUM);
    const geweigerd = await fetch(`${basis}/api/x`, { method: "POST", headers: { [CLIENT_HEADER]: HOGER } });
    expect(geweigerd.status).toBe(426);
    expect(geweigerd.headers.get(CLIENT_MINIMUM_HEADER)).toBe(MINIMUM);
  });

  test("POST met een lager getal: 426 NIEUWE_VERSIE_VEREIST", async () => {
    const antwoord = await fetch(`${basis}/api/x`, { method: "POST", headers: { [CLIENT_HEADER]: LAGER } });
    expect(antwoord.status).toBe(426);
    const lichaam = (await antwoord.json()) as { data?: { code?: string } };
    expect(lichaam.data?.code).toBe("NIEUWE_VERSIE_VEREIST");
  });

  test("POST met een hoger getal: 426", async () => {
    const antwoord = await fetch(`${basis}/api/x`, { method: "POST", headers: { [CLIENT_HEADER]: HOGER } });
    expect(antwoord.status).toBe(426);
  });

  test("POST met hetzelfde getal gaat door", async () => {
    const antwoord = await fetch(`${basis}/api/x`, { method: "POST", headers: { [CLIENT_HEADER]: MINIMUM } });
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ ok: true });
  });

  test("GET met een ander getal gaat door", async () => {
    const antwoord = await fetch(`${basis}/api/x`, { headers: { [CLIENT_HEADER]: HOGER } });
    expect(antwoord.status).toBe(200);
  });

  test("POST zonder header gaat door", async () => {
    const antwoord = await fetch(`${basis}/api/x`, { method: "POST" });
    expect(antwoord.status).toBe(200);
  });

  test("buiten /api geen header en geen controle", async () => {
    const antwoord = await fetch(`${basis}/buiten`, { method: "POST", headers: { [CLIENT_HEADER]: HOGER } });
    expect(antwoord.status).toBe(200);
    expect(antwoord.headers.get(CLIENT_MINIMUM_HEADER)).toBeNull();
  });
});
