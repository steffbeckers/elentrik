// De omgeving (plan 10, Task 1): ELENTRIK_OMGEVING leest als productie, staging of niets. Bij staging
// krijgt elk antwoord (pagina, API, asset) X-Robots-Tag, geeft /robots.txt Disallow en toont de app
// een balk en het titelvoorvoegsel. Productie en leeg gedragen zich als vandaag.
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { createApp, createRouter, defineEventHandler, setResponseHeader, toNodeListener, type EventHandler, type H3Event } from "h3";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  NIET_INDEXEREN,
  ROBOTS_TXT,
  isStaging,
  leesOmgeving,
  titelVoor,
  toonBalk,
  type Omgeving,
} from "../shared/omgeving";

// Nitro draait niet in Vitest: defineNitroPlugin geeft de functie van de plugin terug.
vi.mock("nitropack/runtime", () => ({ defineNitroPlugin: (f: unknown) => f }));

describe("leesOmgeving", () => {
  test.each([
    ["staging", "staging"],
    ["productie", "productie"],
    ["", null],
    ["onzin", null],
    ["Staging", null],
  ] as const)("%j -> %j", (waarde, verwacht) => {
    expect(leesOmgeving({ ELENTRIK_OMGEVING: waarde })).toBe(verwacht);
  });

  test("een ontbrekende variabele is null; blanco rond de waarde telt niet", () => {
    expect(leesOmgeving({})).toBeNull();
    expect(leesOmgeving({ ELENTRIK_OMGEVING: " staging " })).toBe("staging");
  });
});

describe("isStaging, toonBalk en titelVoor", () => {
  test("alleen staging is staging en toont de balk", () => {
    const gevallen: [Omgeving, boolean][] = [
      ["staging", true],
      ["productie", false],
      [null, false],
    ];
    for (const [omgeving, staging] of gevallen) {
      expect(isStaging(omgeving)).toBe(staging);
      expect(toonBalk(omgeving)).toBe(staging);
    }
  });

  test("het titelvoorvoegsel staat er alleen bij staging", () => {
    expect(titelVoor("Projecten · Elentrik", "staging")).toBe("[Staging] Projecten · Elentrik");
    expect(titelVoor("Projecten · Elentrik", "productie")).toBe("Projecten · Elentrik");
    expect(titelVoor("Projecten · Elentrik", null)).toBe("Projecten · Elentrik");
    expect(titelVoor(undefined, null)).toBeNull();
    expect(titelVoor(undefined, "staging")).toBe("[Staging]");
  });
});

// Een Nitro-app in het klein, in de volgorde van Nitro: de hook `request` vóór alles, dan de
// statische bestanden (die het antwoord beëindigen), dan de middleware, dan de routes.
describe("niet indexeren", () => {
  let server: Server | undefined;
  let basis = "";

  async function start(omgeving: string | undefined) {
    vi.resetModules();
    vi.stubEnv("ELENTRIK_OMGEVING", omgeving ?? "");
    const haken: Record<string, (event: H3Event) => void | Promise<void>> = {};
    const plugin = ((await import("../server/plugins/omgeving")) as { default: (app: unknown) => void }).default;
    plugin({ hooks: { hook: (naam: string, f: (event: H3Event) => void) => (haken[naam] = f) } });
    const robots = ((await import("../server/middleware/robots")) as { default: EventHandler }).default;

    const app = createApp({ onRequest: (event) => haken.request?.(event) });
    app.use(
      defineEventHandler((event) => {
        if (event.path.startsWith("/_nuxt/")) {
          setResponseHeader(event, "content-type", "text/javascript");
          return "export {}";
        }
      }),
    );
    app.use(robots);
    const router = createRouter();
    router.get(
      "/api/gezondheid",
      defineEventHandler(() => ({ ok: true })),
    );
    router.get(
      "/",
      defineEventHandler(() => "<html></html>"),
    );
    app.use(router);
    app.use(
      defineEventHandler((event) => {
        event.node.res.statusCode = 404;
        return "niet gevonden";
      }),
    );
    server = createServer(toNodeListener(app));
    await new Promise<void>((klaar) => server!.listen(0, "127.0.0.1", klaar));
    basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  afterEach(async () => {
    vi.unstubAllEnvs();
    await new Promise((klaar) => (server ? server.close(klaar) : klaar(undefined)));
    server = undefined;
  });

  test.each(["/", "/api/gezondheid", "/_nuxt/entry.js", "/bestaat-niet"])("staging: %s heeft X-Robots-Tag", async (pad) => {
    await start("staging");
    const antwoord = await fetch(`${basis}${pad}`);
    expect(antwoord.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  test("staging: /robots.txt geeft Disallow: / als tekst, ook met X-Robots-Tag", async () => {
    await start("staging");
    const antwoord = await fetch(`${basis}/robots.txt`);
    expect(antwoord.status).toBe(200);
    expect(antwoord.headers.get("content-type")).toContain("text/plain");
    expect(antwoord.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(await antwoord.text()).toBe("User-agent: *\nDisallow: /");
  });

  test("de constanten zijn de waarden uit het ontwerp", () => {
    expect(NIET_INDEXEREN).toBe("noindex, nofollow");
    expect(ROBOTS_TXT).toBe("User-agent: *\nDisallow: /");
  });

  test.each(["productie", "", undefined])("omgeving %j: geen header en /robots.txt is 404 zoals vandaag", async (omgeving) => {
    await start(omgeving);
    for (const pad of ["/", "/api/gezondheid", "/_nuxt/entry.js"]) {
      expect((await fetch(`${basis}${pad}`)).headers.get("x-robots-tag"), pad).toBeNull();
    }
    const robots = await fetch(`${basis}/robots.txt`);
    expect(robots.status).toBe(404);
    expect(await robots.text()).toBe("niet gevonden");
    expect(robots.headers.get("x-robots-tag")).toBeNull();
  });

  test("een onbekende waarde gedraagt zich als leeg", async () => {
    await start("onzin");
    expect((await fetch(`${basis}/`)).headers.get("x-robots-tag")).toBeNull();
    expect((await fetch(`${basis}/robots.txt`)).status).toBe(404);
  });
});

// De bedrading in de app: de balk en het titelvoorvoegsel staan in app.vue én error.vue, en de balk heeft
// zijn tekst in elke taal.
describe("de balk en de titel in de app", () => {
  const WEB = join(import.meta.dirname, "..");
  const lees = (pad: string) => readFileSync(join(WEB, pad), "utf8");

  test.each(["app/app.vue", "app/error.vue"])("%s toont de balk en zet de titel via titleTemplate", (pad) => {
    const bron = lees(pad);
    expect(bron).toContain("<StagingBalk />");
    expect(bron).toMatch(/titleTemplate:[^\n]*titelVoor\(/);
  });

  test("de balk is niet wegklikbaar en toont alleen op staging", () => {
    const bron = lees("app/components/StagingBalk.vue");
    expect(bron).toContain('v-if="toonBalk(omgeving)"');
    expect(bron).toContain("omgeving.staging");
    expect(bron).not.toMatch(/UButton|@click|close|dismiss/i);
  });

  test("de balk heeft donkere tekst op de waarschuwingskleur en is geen live-gebied", () => {
    const bron = lees("app/components/StagingBalk.vue");
    expect(bron).toContain("text-black");
    expect(bron).not.toContain("text-inverted");
    expect(bron).toContain('role="note"');
    expect(bron).not.toContain('role="status"');
  });

  test.each(["nl", "fr", "en"])("%s.json heeft omgeving.staging", (taal) => {
    const json = JSON.parse(lees(`i18n/locales/${taal}.json`)) as { omgeving?: { staging?: string } };
    expect(json.omgeving?.staging).toMatch(/^Staging/);
  });

  test("de Franse tekst heeft een vaste spatie voor de dubbele punt", () => {
    const json = JSON.parse(lees("i18n/locales/fr.json")) as { omgeving: { staging: string } };
    expect(json.omgeving.staging).toContain("Staging\u00a0: ");
  });
});
