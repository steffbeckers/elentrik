// GET /api/gezondheid: publiek, 200 { ok: true, versie, revisie } met een bereikbare database, anders 503
// { ok: false, versie, revisie } zonder foutdetails. `versie` is de semver uit ELENTRIK_VERSIE, `revisie`
// de korte sha uit ELENTRIK_REVISIE; elk null als onbekend.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { leesRevisie, leesVersie, versieTekst } from "../shared/versie";
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

beforeEach(() => {
  vi.stubEnv("ELENTRIK_VERSIE", "");
  vi.stubEnv("ELENTRIK_REVISIE", "");
});

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
    expect(await antwoord.json()).toEqual({ ok: true, versie: null, revisie: null });
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
    expect(JSON.parse(tekst)).toEqual({ ok: false, versie: null, revisie: null });
    expect(tekst).not.toContain("geheim-xyz");
    expect(tekst).not.toContain("ECONNREFUSED");
  });

  test("een database die niet antwoordt: 503", async () => {
    zetDb({ execute: () => new Promise(() => {}) } as unknown as Db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(antwoord.status).toBe(503);
    expect(await antwoord.json()).toEqual({ ok: false, versie: null, revisie: null });
  }, 15_000);

  test("met ELENTRIK_VERSIE en ELENTRIK_REVISIE: de semver en de korte sha", async () => {
    zetDb(db);
    vi.stubEnv("ELENTRIK_VERSIE", "1.1.0");
    vi.stubEnv("ELENTRIK_REVISIE", "025fc73b1e2d3c4f5a6b7c8d9e0f112233445566");
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(await antwoord.json()).toEqual({ ok: true, versie: "1.1.0", revisie: "025fc73" });
  });
});

describe("leesVersie", () => {
  test.each([
    ["1.1.0", "1.1.0"],
    [" 1.1.0-staging ", "1.1.0-staging"],
    ["1.1.0-dev", "1.1.0-dev"],
    ["", null],
    [undefined, null],
    ["v1.1.0", null],
    ["1.1", null],
  ] as const)("%j -> %j", (waarde, verwacht) => {
    expect(leesVersie({ ELENTRIK_VERSIE: waarde })).toBe(verwacht);
  });
});

describe("versieTekst", () => {
  test.each([
    [{ versie: "1.1.0", revisie: "025fc73" }, "1.1.0 025fc73"],
    [{ versie: "1.1.0", revisie: null }, "1.1.0"],
    [{ versie: null, revisie: "025fc73" }, "025fc73"],
    [{ versie: null, revisie: null }, ""],
  ] as const)("%j -> %j", (appVersie, verwacht) => {
    expect(versieTekst(appVersie)).toBe(verwacht);
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
