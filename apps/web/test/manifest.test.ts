// GET /manifest.webmanifest: het manifest van de app, met een andere naam op staging zodat die zich
// als een aparte app laat installeren.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp, createRouter, toNodeListener, type EventHandler } from "h3";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

let server: Server;
let basis: string;

beforeAll(async () => {
  const route = (await import("../server/routes/manifest.webmanifest")) as { default: EventHandler };
  const router = createRouter();
  router.get("/manifest.webmanifest", route.default);
  const app = createApp();
  app.use(router);
  server = createServer(toNodeListener(app));
  await new Promise<void>((klaar) => server.listen(0, "127.0.0.1", klaar));
  basis = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  if (server) await new Promise((klaar) => server.close(klaar));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

type Icoon = { src: string; sizes: string; type: string; purpose?: string };
type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Icoon[];
};

async function haal(): Promise<{ antwoord: Response; manifest: Manifest }> {
  const antwoord = await fetch(`${basis}/manifest.webmanifest`);
  return { antwoord, manifest: (await antwoord.json()) as Manifest };
}

describe("GET /manifest.webmanifest", () => {
  test("lokaal (zonder ELENTRIK_OMGEVING): Elentrik", async () => {
    vi.stubEnv("ELENTRIK_OMGEVING", undefined);
    const { manifest } = await haal();
    expect(manifest.name).toBe("Elentrik");
  });

  test("op productie: Elentrik", async () => {
    vi.stubEnv("ELENTRIK_OMGEVING", "productie");
    const { manifest } = await haal();
    expect(manifest.name).toBe("Elentrik");
  });

  test("op staging: Elentrik (staging)", async () => {
    vi.stubEnv("ELENTRIK_OMGEVING", "staging");
    const { manifest } = await haal();
    expect(manifest.name).toBe("Elentrik (staging)");
  });

  test("type, cache-control en de vaste velden", async () => {
    const { antwoord, manifest } = await haal();
    expect(antwoord.status).toBe(200);
    expect(antwoord.headers.get("content-type")).toMatch(/^application\/manifest\+json/);
    expect(antwoord.headers.get("cache-control")).toBe("no-cache");
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#3b82f6");
  });

  test("iconen voor 192 en 512 px, en een maskable", async () => {
    const { manifest } = await haal();
    const maten = manifest.icons.map((icoon) => icoon.sizes);
    expect(maten).toContain("192x192");
    expect(maten).toContain("512x512");
    expect(manifest.icons.filter((icoon) => icoon.purpose === "maskable")).toHaveLength(1);
  });
});
