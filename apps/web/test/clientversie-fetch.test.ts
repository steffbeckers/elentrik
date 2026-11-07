// De omhulling van `fetch` voor het compatibiliteitsgetal: header mee op een eigen /api-verzoek, en
// de header en een 426 van het antwoord naar de versie-store.
import { describe, expect, test, vi } from "vitest";
import { omhulFetch } from "../app/versie/fetch";

const ORIGIN = "https://elentrik.test";

function maak(antwoord: Response | (() => Response)) {
  const origineel = vi.fn<typeof fetch>(async () => (typeof antwoord === "function" ? antwoord() : antwoord));
  const bijServerversie = vi.fn<(waarde: string) => void>();
  const bijVereist = vi.fn<() => void>();
  const omhuld = omhulFetch(origineel, { origin: ORIGIN, eigenGetal: 1, bijServerversie, bijVereist });
  return { origineel, omhuld, bijServerversie, bijVereist };
}

function verzonden(origineel: ReturnType<typeof maak>["origineel"]): Headers {
  const init = origineel.mock.calls[0]![1];
  return new Headers(init?.headers);
}

describe("omhulFetch", () => {
  test.each([
    ["/api/_nuxt_icon/lucide.json?icons=map", "public, max-age=604800, s-maxage=604800"],
    ["/api/bestanden/oud-raster", "private, max-age=31536000, immutable"],
    ["/api/admin/bestanden/oud-raster?gebruiker=test", "private, max-age=31536000, immutable"],
  ])("een oude cacheheader van asset %s forceert geen nieuwe appversie", async (url, cache) => {
    const { omhuld, bijServerversie, bijVereist } = maak(new Response("cached asset", { headers: {
      "cache-control": cache, "x-elentrik-client-minimum": "99",
    } }));
    const antwoord = await omhuld(url);
    expect(await antwoord.text()).toBe("cached asset");
    expect(bijServerversie).not.toHaveBeenCalled();
    expect(bijVereist).not.toHaveBeenCalled();
  });

  test("HEAD via Request op een asset is evenmin een actuele serverversie", async () => {
    const { omhuld, bijServerversie } = maak(new Response(null, { headers: { "x-elentrik-client-minimum": "99" } }));
    await omhuld(new Request(`${ORIGIN}/api/bestanden/raster`, { method: "HEAD" }));
    expect(bijServerversie).not.toHaveBeenCalled();
  });

  test.each(["/api/projecten/x/bestanden", "/api/bestandenlijst", "/api/gezondheid"])("actuele API-route %s blijft een versiebron", async url => {
    const { omhuld, bijServerversie } = maak(new Response("{}", { headers: { "x-elentrik-client-minimum": "99" } }));
    await omhuld(url);
    expect(bijServerversie).toHaveBeenCalledWith("99");
  });

  test("een mutatie op een assetroute blijft versiecontrole uitvoeren", async () => {
    const { omhuld, bijServerversie } = maak(new Response("{}", { headers: { "x-elentrik-client-minimum": "99" } }));
    await omhuld("/api/bestanden/raster", { method: "DELETE" });
    expect(bijServerversie).toHaveBeenCalledWith("99");
  });

  test("een expliciete 426 op een assetroute wordt nooit genegeerd", async () => {
    const { omhuld, bijVereist } = maak(() => new Response(JSON.stringify({ data: { code: "NIEUWE_VERSIE_VEREIST" } }), { status: 426 }));
    await omhuld("/api/_nuxt_icon/lucide.json");
    expect(bijVereist).toHaveBeenCalledOnce();
  });

  test("een eigen /api-verzoek krijgt X-Elentrik-Client, met de bestaande headers", async () => {
    const { origineel, omhuld } = maak(new Response("{}"));
    await omhuld("/api/projecten", { headers: { "content-type": "application/json" }, method: "PUT" });
    const headers = verzonden(origineel);
    expect(headers.get("x-elentrik-client")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(origineel.mock.calls[0]![1]?.method).toBe("PUT");
  });

  test("ook met een volledige URL van de eigen origin", async () => {
    const { origineel, omhuld } = maak(new Response("{}"));
    await omhuld(`${ORIGIN}/api/mij`);
    expect(verzonden(origineel).get("x-elentrik-client")).toBe("1");
  });

  test("een Request-object behoudt zijn headers", async () => {
    const { origineel, omhuld } = maak(new Response("{}"));
    await omhuld(new Request(`${ORIGIN}/api/mij`, { headers: { "x-iets": "ja" } }));
    const headers = verzonden(origineel);
    expect(headers.get("x-elentrik-client")).toBe("1");
    expect(headers.get("x-iets")).toBe("ja");
  });

  test.each([
    "/_nuxt/builds/latest.json",
    "/api",
    "/apiary/x",
    "https://andere.test/api/x",
    "/api/auth/sign-in/email",
  ])("%s krijgt de header niet", async (url) => {
    const { origineel, omhuld } = maak(new Response("{}"));
    await omhuld(url);
    expect(origineel.mock.calls[0]![1]?.headers).toBeUndefined();
  });

  test("elk eigen /api-antwoord met een minimumversie gaat naar de store, ook een foutstatus", async () => {
    const { omhuld, bijServerversie } = maak(new Response("{}", { status: 500, headers: { "x-elentrik-client-minimum": "2" } }));
    const antwoord = await omhuld("/api/gezondheid");
    expect(antwoord.status).toBe(500);
    expect(bijServerversie).toHaveBeenCalledWith("2");
  });

  test("een antwoord van een auth-route meldt de minimumversie ook", async () => {
    const { omhuld, bijServerversie } = maak(new Response("{}", { headers: { "x-elentrik-client-minimum": "2" } }));
    await omhuld("/api/auth/get-session");
    expect(bijServerversie).toHaveBeenCalledWith("2");
  });

  test("een antwoord zonder de header meldt niets", async () => {
    const { omhuld, bijServerversie, bijVereist } = maak(new Response("{}"));
    await omhuld("/api/gezondheid");
    expect(bijServerversie).not.toHaveBeenCalled();
    expect(bijVereist).not.toHaveBeenCalled();
  });

  test("een 426 NIEUWE_VERSIE_VEREIST zet 'vereist', en het antwoord is nog te lezen", async () => {
    const lichaam = { statusCode: 426, data: { code: "NIEUWE_VERSIE_VEREIST" } };
    const { omhuld, bijVereist } = maak(() => new Response(JSON.stringify(lichaam), { status: 426 }));
    const antwoord = await omhuld("/api/projecten/1", { method: "PUT" });
    expect(bijVereist).toHaveBeenCalledTimes(1);
    expect(await antwoord.json()).toEqual(lichaam);
  });

  test("een 426 met een andere code, of geen JSON, zet 'vereist' niet", async () => {
    const een = maak(() => new Response(JSON.stringify({ data: { code: "IETS_ANDERS" } }), { status: 426 }));
    await een.omhuld("/api/x", { method: "POST" });
    expect(een.bijVereist).not.toHaveBeenCalled();

    const twee = maak(() => new Response("geen json", { status: 426 }));
    await twee.omhuld("/api/x", { method: "POST" });
    expect(twee.bijVereist).not.toHaveBeenCalled();
  });

  test("een mislukt verzoek (geen verbinding) gaat ongewijzigd door", async () => {
    const origineel = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    const omhuld = omhulFetch(origineel, { origin: ORIGIN, eigenGetal: 1, bijServerversie: vi.fn(), bijVereist: vi.fn() });
    await expect(omhuld("/api/gezondheid")).rejects.toThrow("Failed to fetch");
  });
});
