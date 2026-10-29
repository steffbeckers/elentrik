// GET /api/gezondheid: publiek, 200 { ok: true } met een bereikbare database, anders 503 { ok: false }
// zonder foutdetails.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

afterAll(async () => {
  await new Promise((klaar) => server?.close(klaar));
});

describe("GET /api/gezondheid", () => {
  test("met een bereikbare database: 200 { ok: true }, zonder sessie", async () => {
    zetDb(db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(antwoord.status).toBe(200);
    expect(await antwoord.json()).toEqual({ ok: true });
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
    expect(JSON.parse(tekst)).toEqual({ ok: false });
    expect(tekst).not.toContain("geheim-xyz");
    expect(tekst).not.toContain("ECONNREFUSED");
  });

  test("een database die niet antwoordt: 503", async () => {
    zetDb({ execute: () => new Promise(() => {}) } as unknown as Db);
    const antwoord = await fetch(`${basis}/api/gezondheid`);
    expect(antwoord.status).toBe(503);
    expect(await antwoord.json()).toEqual({ ok: false });
  }, 15_000);
});
