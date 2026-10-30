import { describe, expect, test } from "vitest";
import {
  ConflictFout,
  httpStatus,
  maakProjectenApi,
  type ProjectenFetch,
} from "../app/composables/useProjectenApi";
import { relatieveTijd } from "../app/utils/relatieveTijd";

type Oproep = Parameters<ProjectenFetch>;

function maakApi(antwoord: unknown | (() => never)) {
  const oproepen: Oproep[] = [];
  const api = maakProjectenApi(async (...argumenten) => {
    oproepen.push(argumenten);
    if (typeof antwoord === "function") antwoord();
    return antwoord;
  });
  return { api, oproepen };
}

describe("useProjectenApi", () => {
  test("bewaar stuurt de versie mee als If-Match", async () => {
    const { api, oproepen } = maakApi({ versie: 4 });
    const document = {} as never;
    expect(await api.bewaar("abc", 3, { naam: "Nieuw", document })).toEqual({ versie: 4 });
    expect(oproepen).toEqual([
      [
        "/api/projecten/abc",
        { method: "PUT", headers: { "If-Match": "3" }, body: { naam: "Nieuw", document } },
      ],
    ]);
  });

  test("bewaar gooit bij een 409 een ConflictFout met de huidige versie", async () => {
    const { api } = maakApi(() => {
      throw Object.assign(new Error("409"), { status: 409, data: { data: { versie: 9 } } });
    });
    const fout = await api.bewaar("abc", 3, { document: {} as never }).catch((f: unknown) => f);
    expect(fout).toBeInstanceOf(ConflictFout);
    expect((fout as ConflictFout).huidigeVersie).toBe(9);
  });

  test("bewaar laat andere fouten ongemoeid", async () => {
    const eigen = Object.assign(new Error("422"), { status: 422 });
    const { api } = maakApi(() => {
      throw eigen;
    });
    await expect(api.bewaar("abc", 3, { document: {} as never })).rejects.toBe(eigen);
  });

  test("met een gebruiker: bewaar en dupliceer zeggen voor wie ze werken", async () => {
    const oproepen: Oproep[] = [];
    const api = maakProjectenApi(
      async (...argumenten) => {
        oproepen.push(argumenten);
        return { versie: 4, id: "kopie" };
      },
      { gebruikerId: "g1" },
    );
    const document = {} as never;
    await api.bewaar("abc", 3, { document });
    await api.dupliceer("abc");
    expect(oproepen).toEqual([
      [
        "/api/projecten/abc",
        { method: "PUT", headers: { "If-Match": "3", "x-elentrik-gebruiker": "g1" }, body: { document } },
      ],
      ["/api/projecten/abc/dupliceer", { method: "POST", headers: { "x-elentrik-gebruiker": "g1" }, body: { bestandIds: [] } }],
    ]);
  });

  test("dupliceer stuurt altijd een body mee: de id's van de planbestanden, of een lege lijst", async () => {
    const oproepen: Parameters<ProjectenFetch>[] = [];
    const api = maakProjectenApi(async (...argumenten) => {
      oproepen.push(argumenten);
      return { id: "kopie" };
    });
    await api.dupliceer("abc", ["b1", "b2"]);
    await api.dupliceer("abc", []);
    expect(oproepen).toEqual([
      ["/api/projecten/abc/dupliceer", { method: "POST", body: { bestandIds: ["b1", "b2"] } }],
      ["/api/projecten/abc/dupliceer", { method: "POST", body: { bestandIds: [] } }],
    ]);
  });

  test("maakUitDocument post naam en document, met de gebruiker en de actieve organisatie", async () => {
    const oproepen: Oproep[] = [];
    const api = maakProjectenApi(
      async (...argumenten) => {
        oproepen.push(argumenten);
        return { id: "nieuw", versie: 1, documentId: "d", bestandIds: {} };
      },
      { gebruikerId: "g1", actieveOrganisatieId: () => "org-1" },
    );
    const document = {} as never;
    await api.maakUitDocument({ naam: "Woning", document });
    expect(oproepen).toEqual([
      [
        "/api/projecten/uit-document",
        {
          method: "POST",
          body: { naam: "Woning", document },
          headers: { "x-elentrik-gebruiker": "g1", "x-elentrik-organisatie": "org-1" },
        },
      ],
    ]);
  });

  test("dupliceer en verwijder gebruiken de juiste routes", async () => {
    const { api, oproepen } = maakApi({ id: "kopie" });
    expect(await api.dupliceer("abc")).toEqual({ id: "kopie" });
    await api.verwijder("abc");
    expect(oproepen).toEqual([
      ["/api/projecten/abc/dupliceer", { method: "POST", body: { bestandIds: [] } }],
      ["/api/projecten/abc", { method: "DELETE" }],
    ]);
  });
});

describe("httpStatus", () => {
  test("leest status of statusCode van een fout", () => {
    expect(httpStatus({ status: 404 })).toBe(404);
    expect(httpStatus({ statusCode: 409 })).toBe(409);
    expect(httpStatus({ status: 422, statusCode: 500 })).toBe(422);
  });

  test("geeft undefined zonder numerieke status", () => {
    expect(httpStatus(new Error("netwerk"))).toBeUndefined();
    expect(httpStatus({ status: "404" })).toBeUndefined();
    expect(httpStatus(null)).toBeUndefined();
    expect(httpStatus("fout")).toBeUndefined();
  });
});

describe("relatieveTijd", () => {
  const nu = new Date("2026-10-18T12:00:00Z");

  test.each([
    ["2026-10-18T12:00:00Z", "nu"],
    ["2026-10-18T11:58:00Z", "2 min. geleden"],
    ["2026-10-18T09:00:00Z", "3 uur geleden"],
    ["2026-10-17T12:00:00Z", "gisteren"],
  ])("%s", (iso, verwacht) => {
    expect(relatieveTijd(iso, "nl", nu)).toBe(verwacht);
  });

  test("volgt de taal: fr-BE en en-GB", () => {
    expect(relatieveTijd("2026-10-17T12:00:00Z", "fr", nu)).toBe("hier");
    expect(relatieveTijd("2026-10-18T09:00:00Z", "fr", nu)).toBe(
      new Intl.RelativeTimeFormat("fr-BE", { numeric: "auto", style: "short" }).format(-3, "hour"),
    );
    expect(relatieveTijd("2026-10-17T12:00:00Z", "en", nu)).toBe("yesterday");
  });
});
