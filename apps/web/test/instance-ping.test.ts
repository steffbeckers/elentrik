import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { leesInstanceMelding } from "../shared/instance";
import { instance, user } from "../server/db/schema";
import {
  INSTANCE_PING_URL,
  __resetWaarschuwing,
  bouwMelding,
  hostUit,
  pingActief,
  verstuurPing,
  zorgVoorInstanceId,
} from "../server/instance/ping";
import { maakTestDb, maakTestOrganisatie } from "./db";

describe("pingActief", () => {
  it.each([
    [{ NODE_ENV: "production" }, true],
    [{}, false],
    [{ NODE_ENV: "production", ELENTRIK_OMGEVING: "productie" }, false],
    [{ NODE_ENV: "production", ELENTRIK_OMGEVING: "staging" }, false],
    [{ NODE_ENV: "production", ELENTRIK_INSTANCE_PING: " UIT " }, false],
    [{ NODE_ENV: "production", ELENTRIK_GEPLANDE_TAKEN: "uit" }, false],
    [{ NODE_ENV: "production", ELENTRIK_OMGEVING: "iets-anders" }, true],
  ])("%j geeft %s", (env, verwacht) => {
    expect(pingActief(env)).toBe(verwacht);
  });
});

describe("hostUit", () => {
  it("geeft de hostnaam in kleine letters", () => {
    expect(hostUit("https://Kopie.Example:8443/app")).toBe("kopie.example");
  });
  it("geeft IPv6 zonder blokhaken", () => {
    expect(hostUit("http://[2001:db8::1]:3000")).toBe("2001:db8::1");
  });
  it.each([undefined, "", "geen url"])("geeft null voor %j", (invoer) => {
    expect(hostUit(invoer)).toBeNull();
  });
});

describe("zorgVoorInstanceId", () => {
  it("geeft altijd hetzelfde id", async () => {
    const db = await maakTestDb();
    const [a, b] = await Promise.all([zorgVoorInstanceId(db), zorgVoorInstanceId(db)]);
    const c = await zorgVoorInstanceId(db);
    expect(a).toBe(b);
    expect(c).toBe(a);
    expect(await db.select().from(instance)).toHaveLength(1);
  });
});

describe("bouwMelding", () => {
  it("telt organisaties en gebruikers en leest de versie", async () => {
    const db = await maakTestDb();
    await maakTestOrganisatie(db);
    await maakTestOrganisatie(db, "Tweede");
    await db.insert(user).values({ id: randomUUID(), name: "A", email: "a@example.test", emailVerified: true, createdAt: new Date(), updatedAt: new Date() });
    const env = { BETTER_AUTH_URL: "https://kopie.example", ELENTRIK_REVISIE: "abc1234", STRIPE_GEHEIME_SLEUTEL: "sk_test_x" };
    const melding = await bouwMelding(db, env);
    expect(melding).toMatchObject({ host: "kopie.example", aantalOrganisaties: 2, aantalGebruikers: 1, versie: "abc1234", abonnementenAan: true });
    expect(leesInstanceMelding(melding)).not.toBeNull();
    const zonder = await bouwMelding(db, { BETTER_AUTH_URL: "https://kopie.example" });
    expect(zonder?.versie).toBe("onbekend");
    expect(zonder?.abonnementenAan).toBe(false);
  });
});

describe("verstuurPing", () => {
  const actief = { NODE_ENV: "production", BETTER_AUTH_URL: "https://kopie.example" };
  beforeEach(() => __resetWaarschuwing());
  afterEach(() => vi.restoreAllMocks());

  it("post naar het eindpunt", async () => {
    const db = await maakTestDb();
    const nepFetch = vi.fn(async () => new Response(null, { status: 204 }));
    expect(await verstuurPing({ db, env: actief, fetch: nepFetch as unknown as typeof fetch })).toBe("verstuurd");
    const [url, init] = nepFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(INSTANCE_PING_URL);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toBe("Elentrik-instance-ping");
    expect(headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual(await bouwMelding(db, actief));
  });

  it("gebruikt ELENTRIK_INSTANCE_PING_URL als die gezet is", async () => {
    const db = await maakTestDb();
    const nepFetch = vi.fn(async () => new Response(null, { status: 204 }));
    await verstuurPing({ db, env: { ...actief, ELENTRIK_INSTANCE_PING_URL: "http://127.0.0.1:9/x" }, fetch: nepFetch as unknown as typeof fetch });
    expect((nepFetch.mock.calls[0] as unknown[])[0]).toBe("http://127.0.0.1:9/x");
  });

  it("doet niets als hij uit staat", async () => {
    const db = await maakTestDb();
    const nepFetch = vi.fn();
    expect(await verstuurPing({ db, env: { ...actief, ELENTRIK_INSTANCE_PING: "uit" }, fetch: nepFetch as unknown as typeof fetch })).toBe("uit");
    expect(nepFetch).not.toHaveBeenCalled();
  });

  it("slikt fouten en waarschuwt één keer", async () => {
    const db = await maakTestDb();
    const waarschuw = vi.spyOn(console, "warn").mockImplementation(() => {});
    const faalt = vi.fn(async () => {
      throw new Error("netwerk");
    });
    const status500 = vi.fn(async () => new Response(null, { status: 500 }));
    expect(await verstuurPing({ db, env: actief, fetch: faalt as unknown as typeof fetch })).toBe("mislukt");
    expect(await verstuurPing({ db, env: actief, fetch: status500 as unknown as typeof fetch })).toBe("mislukt");
    expect(waarschuw).toHaveBeenCalledTimes(1);
  });

  it("geeft mislukt zonder BETTER_AUTH_URL en zonder fetch-aanroep", async () => {
    const db = await maakTestDb();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const nepFetch = vi.fn();
    expect(await verstuurPing({ db, env: { NODE_ENV: "production" }, fetch: nepFetch as unknown as typeof fetch })).toBe("mislukt");
    expect(nepFetch).not.toHaveBeenCalled();
  });
});
