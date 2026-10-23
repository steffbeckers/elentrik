// De client stuurt bij elke schrijfactie op de actieve organisatie mee welke organisatie de pagina
// bedoelt (header x-elentrik-organisatie), en reageert op een 409 ANDERE_ORGANISATIE.
import { describe, expect, test, vi } from "vitest";
import { maakBedrijfApi, type BedrijfFetch } from "../app/composables/useBedrijfApi";
import { maakOrganisatieApi, type OrganisatieFetch } from "../app/composables/useOrganisatieApi";
import { maakProjectenApi, type ProjectenFetch } from "../app/composables/useProjectenApi";
import { behandelAndereOrganisatie, isAndereOrganisatie, voorOrganisatie } from "../app/sessie/organisatie";

const HEADER = "x-elentrik-organisatie";

/** Een fetch die elke oproep onthoudt. */
function opnemer() {
  const oproepen: [string, { method?: string; headers?: Record<string, string>; body?: unknown }?][] = [];
  const haal = vi.fn(async (url: string, opties?: { method?: string; headers?: Record<string, string>; body?: unknown }) => {
    oproepen.push(opties === undefined ? [url] : [url, opties]);
    return {};
  });
  return { haal, oproepen };
}

describe("voorOrganisatie", () => {
  test("met een id: de header; zonder: niets", () => {
    expect(voorOrganisatie("o1")).toEqual({ headers: { [HEADER]: "o1" } });
    expect(voorOrganisatie(null)).toEqual({});
    expect(voorOrganisatie(undefined)).toEqual({});
  });
});

describe("de header op de schrijfacties", () => {
  test("bedrijfsgegevens bewaren en het logo opladen sturen de actieve organisatie mee; lezen niet", async () => {
    const { haal, oproepen } = opnemer();
    const api = maakBedrijfApi(haal as BedrijfFetch, { actieveOrganisatieId: () => "o1" });
    await api.haal();
    await api.bewaar({ naam: "Elektro" });
    await api.uploadLogo(new Blob([new Uint8Array([1])]), "logo.png");
    expect(oproepen[0]).toEqual(["/api/bedrijfsgegevens"]);
    expect(oproepen[1]).toEqual(["/api/bedrijfsgegevens", { method: "PUT", body: { naam: "Elektro" }, headers: { [HEADER]: "o1" } }]);
    expect(oproepen[2]![1]).toMatchObject({ method: "POST", headers: { [HEADER]: "o1" } });
  });

  test("een nieuw project stuurt de actieve organisatie mee; de projectroutes zelf niet", async () => {
    const { haal, oproepen } = opnemer();
    const api = maakProjectenApi(haal as ProjectenFetch, { gebruikerId: "u1", actieveOrganisatieId: () => "o1" });
    await api.maak({ naam: "Woning", klantnaam: "", stroomtype: "2x230V" });
    await api.bewaar("p1", 1, { document: {} as never });
    await api.verwijder("p1");
    expect(oproepen[0]).toEqual([
      "/api/projecten",
      { method: "POST", body: { naam: "Woning", klantnaam: "", stroomtype: "2x230V" }, headers: { [HEADER]: "o1" } },
    ]);
    expect(oproepen[1]![1]!.headers).not.toHaveProperty(HEADER);
    expect(oproepen[2]![1]).toEqual({ method: "DELETE" });
  });

  test("hernoemen, rollen, verwijderen, uitnodigen, intrekken en verlaten sturen de organisatie van dat moment mee", async () => {
    const { haal, oproepen } = opnemer();
    let actief: string | null = "o1";
    const api = maakOrganisatieApi(haal as OrganisatieFetch, { actieveOrganisatieId: () => actief });
    await api.hernoem("Nieuwe naam");
    await api.wijzigRol("lid/1", "eigenaar");
    await api.verwijderLid("lid/1");
    await api.nodigUit("gast@voorbeeld.be", "lid");
    await api.trekIn("u 1");
    actief = "o2";
    await api.verlaat();
    expect(oproepen).toEqual([
      ["/api/organisaties/naam", { method: "PUT", body: { naam: "Nieuwe naam" }, headers: { [HEADER]: "o1" } }],
      ["/api/organisaties/leden/lid%2F1", { method: "PUT", body: { rol: "eigenaar" }, headers: { [HEADER]: "o1" } }],
      ["/api/organisaties/leden/lid%2F1", { method: "DELETE", headers: { [HEADER]: "o1" } }],
      [
        "/api/organisaties/uitnodigingen",
        { method: "POST", body: { email: "gast@voorbeeld.be", rol: "lid" }, headers: { [HEADER]: "o1" } },
      ],
      ["/api/organisaties/uitnodigingen/u%201", { method: "DELETE", headers: { [HEADER]: "o1" } }],
      ["/api/organisaties/verlaten", { method: "POST", headers: { [HEADER]: "o2" } }],
    ]);
  });

  test("zonder actieve organisatie: geen header", async () => {
    const { haal, oproepen } = opnemer();
    await maakOrganisatieApi(haal as OrganisatieFetch, { actieveOrganisatieId: () => null }).verlaat();
    expect(oproepen).toEqual([["/api/organisaties/verlaten", { method: "POST" }]]);
  });
});

describe("een 409 ANDERE_ORGANISATIE", () => {
  const andere = { status: 409, data: { statusCode: 409, data: { code: "ANDERE_ORGANISATIE" } } };

  test("isAndereOrganisatie herkent alleen die fout", () => {
    expect(isAndereOrganisatie(andere)).toBe(true);
    expect(isAndereOrganisatie({ status: 409, data: { data: { code: "LAATSTE_EIGENAAR" } } })).toBe(false);
    expect(isAndereOrganisatie({ status: 409, data: { data: { versie: 3 } } })).toBe(false);
    expect(isAndereOrganisatie(new Error("netwerk"))).toBe(false);
  });

  test("de sessie wordt opnieuw gelezen en de melding noemt de nieuwe organisatie; niets wordt herhaald", async () => {
    let naam = "Oud";
    const laad = vi.fn(async () => {
      naam = "Nieuw BV";
    });
    const meld = vi.fn();
    expect(await behandelAndereOrganisatie(andere, { laad, organisatieNaam: () => naam, meld })).toBe(true);
    expect(laad).toHaveBeenCalledTimes(1);
    expect(meld).toHaveBeenCalledWith("Nieuw BV");
  });

  test("lukt het lezen van de sessie niet, dan een melding zonder naam", async () => {
    const meld = vi.fn();
    const laad = vi.fn(async () => Promise.reject(new Error("netwerk")));
    expect(await behandelAndereOrganisatie(andere, { laad, organisatieNaam: () => "Oud", meld })).toBe(true);
    expect(meld).toHaveBeenCalledWith(null);
  });

  test("een andere fout: niets", async () => {
    const laad = vi.fn(async () => {});
    const meld = vi.fn();
    expect(await behandelAndereOrganisatie({ status: 500 }, { laad, organisatieNaam: () => "X", meld })).toBe(false);
    expect(laad).not.toHaveBeenCalled();
    expect(meld).not.toHaveBeenCalled();
  });
});
