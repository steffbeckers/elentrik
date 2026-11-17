// GET /api/gezondheid: publiek, 200 { ok: true, versie, revisie } met een bereikbare database, anders 503
// { ok: false, versie, revisie } zonder foutdetails. `versie` is de semver uit package.json, `revisie` de
// korte sha uit ELENTRIK_REVISIE, of null.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import pakket from "../package.json";
import { APP_VERSIE, leesRevisie } from "../shared/versie";
import { type Db, zetDb } from "../server/db";
import { maakTestDb } from "./db";

let server: Server;
let basis: string;
let db: Db;

beforeAll(async () => {
  db = await maakTestDb();
  zetDb(db);
  const route = (await import("../server/api/gezondheid.get")) as { default: EventHandler };
  const router = createRouter();
  router.get("/api/gezondheid", route.default);
  const app = createApp();
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 120_000);

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
});

describe("GET /api/gezondheid", () => {
  test("met een bereikbare database: 200 { ok: true }, zonder sessie", async () => {
    zetDb(db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ ok: true, versie: APP_VERSIE, revisie: null });
  });

  test("met een database die gooit: 503 { ok: false }, zonder foutdetails", async () => {
    zetDb({
      execute: async () => {
        throw new Error("connect ECONNREFUSED postgres://gebruiker:geheim-xyz@db:5432/elentrik");
      },
    } as unknown as Db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    const tekst = await antwoord.text();
    expect(antwoord.status).toBe(503);
    expect(JSON.parse(tekst)).toEqual({ ok: false, versie: APP_VERSIE, revisie: null });
    expect(tekst).not.toContain("geheim-xyz");
    expect(tekst).not.toContain("ECONNREFUSED");
  });

  test("een database die niet antwoordt: 503", async () => {
    zetDb({ execute: () => new Promise(() => {}) } as unknown as Db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(antwoord.status).toBe(503);
    expect(await antwoord.json()).toEqual({ ok: false, versie: APP_VERSIE, revisie: null });
  }, 15_000);

  test("met ELENTRIK_REVISIE: de korte sha als revisie", async () => {
    zetDb(db);
    vi.stubEnv("ELENTRIK_REVISIE", "025fc73b1e2d3c4f5a6b7c8d9e0f112233445566");
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(await antwoord.json()).toEqual({ ok: true, versie: APP_VERSIE, revisie: "025fc73" });
  });
});

describe("APP_VERSIE", () => {
  test("is de semver uit package.json", () => {
    expect(APP_VERSIE).toBe(pakket.version);
    expect(APP_VERSIE).toMatch(/^\d+\.\d+\.\d+(-[0-9a-z.-]+)?$/i);
  });
});

describe("leesRevisie", () => {
  test.each([
    ["025FC73B1E2D3C4F5A6B7C8D9E0F112233445566", "025fc73"],
    [" 025fc73 ", "025fc73"],
    ["", null],
    [undefined, null],
    ["abc", null],
    ["geen-sha-maar-tekst", null],
  ] as const)("%j -> %j", (waarde, verwacht) => {
    expect(leesRevisie({ ELENTRIK_REVISIE: waarde })).toBe(verwacht);
  });
});
