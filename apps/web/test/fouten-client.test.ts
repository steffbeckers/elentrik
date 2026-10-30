// De centrale vertaling van een fout in de client (plan 8, Task 4): de code wordt `fouten.<CODE>`,
// al de rest `fouten.onbekend`. De Nederlandse statusMessage van de server komt nooit in beeld.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, test } from "vitest";
import { bekendeFoutcode, vertaalFout } from "../app/fouten";

/** Een `t` die de sleutel zichtbaar teruggeeft: zo ziet de test welke sleutel gebruikt werd. */
const t = (sleutel: string) => `[${sleutel}]`;

describe("vertaalFout", () => {
  test("een bekende code in data.code: de vertaling, niet de tekst van de server", () => {
    const fout = { data: { code: "ANDERE_ORGANISATIE" }, statusMessage: "Nederlandse tekst" };
    expect(vertaalFout(fout, t)).toBe("[fouten.ANDERE_ORGANISATIE]");
  });

  test("$fetch op een eigen route: de code in data.data.code", () => {
    const fout = {
      status: 409,
      statusMessage: "Er moet minstens één eigenaar blijven",
      data: { statusCode: 409, statusMessage: "Er moet minstens één eigenaar blijven", data: { code: "LAATSTE_EIGENAAR" } },
    };
    expect(vertaalFout(fout, t)).toBe("[fouten.LAATSTE_EIGENAAR]");
  });

  test("PLANBESTAND_ONBEKEND van het bewaren (422): de vertaling", () => {
    const fout = {
      status: 422,
      data: { statusCode: 422, statusMessage: "Het document verwijst naar een planbestand", data: { code: "PLANBESTAND_ONBEKEND" } },
    };
    expect(vertaalFout(fout, t)).toBe("[fouten.PLANBESTAND_ONBEKEND]");
  });

  test("OPSLAG_VOL (413) van een upload, dupliceren of Bewaar als nieuw project: de vertaling, niet 'te groot'", () => {
    const fout = {
      status: 413,
      data: { statusCode: 413, statusMessage: "Opslag vol", data: { code: "OPSLAG_VOL" } },
    };
    expect(vertaalFout(fout, t)).toBe("[fouten.OPSLAG_VOL]");
  });

  test("de Better Auth-client: de code bovenaan", () => {
    const fout = { status: 401, code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" };
    expect(vertaalFout(fout, t)).toBe("[fouten.INVALID_EMAIL_OR_PASSWORD]");
  });

  test("een onbekende code: fouten.onbekend", () => {
    expect(vertaalFout({ data: { code: "IETS_NIEUWS" }, statusMessage: "Iets nieuws" }, t)).toBe("[fouten.onbekend]");
  });

  test("een netwerkfout zonder data: fouten.onbekend", () => {
    expect(vertaalFout(new TypeError("Failed to fetch"), t)).toBe("[fouten.onbekend]");
    expect(vertaalFout(Object.assign(new Error("connect"), { code: "ECONNREFUSED" }), t)).toBe("[fouten.onbekend]");
  });

  test("geen object, of niets: fouten.onbekend", () => {
    expect(vertaalFout(null, t)).toBe("[fouten.onbekend]");
    expect(vertaalFout(undefined, t)).toBe("[fouten.onbekend]");
    expect(vertaalFout("Nederlandse tekst", t)).toBe("[fouten.onbekend]");
  });

  test("de rate limiter van Better Auth (429 zonder code): TE_VEEL_POGINGEN", () => {
    expect(vertaalFout({ status: 429, statusText: "Too Many Requests" }, t)).toBe("[fouten.TE_VEEL_POGINGEN]");
  });

  test("een 429 met een eigen code houdt die code", () => {
    expect(vertaalFout({ status: 429, data: { code: "TE_VEEL_UITNODIGINGEN" } }, t)).toBe(
      "[fouten.TE_VEEL_UITNODIGINGEN]",
    );
  });

  test("een 5xx zonder code: fouten.onbekend, ook met een tekst van de server", () => {
    expect(vertaalFout({ statusCode: 500, statusMessage: "Interne fout" }, t)).toBe("[fouten.onbekend]");
  });
});

describe("bekendeFoutcode", () => {
  test("de code als ze in FOUTCODES staat, anders undefined", () => {
    expect(bekendeFoutcode({ data: { code: "MISLUKT" } })).toBe("MISLUKT");
    expect(bekendeFoutcode({ status: 429 })).toBe("TE_VEEL_POGINGEN");
    expect(bekendeFoutcode({ data: { code: "IETS_NIEUWS" } })).toBeUndefined();
    expect(bekendeFoutcode(new Error("x"))).toBeUndefined();
  });
});

describe("de client toont nooit de statusMessage van de server", () => {
  const APP = join(import.meta.dirname, "..", "app");

  function bestanden(map: string): string[] {
    return readdirSync(map, { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? bestanden(join(map, d.name)) : /\.(ts|vue)$/.test(d.name) ? [join(map, d.name)] : [],
    );
  }

  test("`statusMessage` komt in app/ alleen voor in een eigen createError", () => {
    const treffers = bestanden(APP).flatMap((pad) =>
      readFileSync(pad, "utf8")
        .split("\n")
        .map((regel, i) => ({ regel, plek: `${relative(APP, pad)}:${i + 1}` }))
        .filter(({ regel }) => !/^\s*(\/\/|\*|\/\*)/.test(regel)) // commentaar mag erover spreken
        .filter(({ regel }) => regel.includes("statusMessage") && !regel.includes("createError(")),
    );
    expect(treffers.map((t) => t.plek)).toEqual([]);
  });
});
