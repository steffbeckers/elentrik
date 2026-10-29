// Het databasewachtwoord hoort niet in de logs, ook niet bij een ongeldige DATABASE_URL, en mag in
// PGPASSWORD staan (zoals deploy/nas/compose.yaml doet), zodat tekens als / # ? @ geen probleem zijn.
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const WACHTWOORD = "ge/heim#pw?x@y";
const bewaard = { url: process.env.DATABASE_URL, pw: process.env.PGPASSWORD };

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const [naam, waarde] of [
    ["DATABASE_URL", bewaard.url],
    ["PGPASSWORD", bewaard.pw],
  ] as const) {
    if (waarde === undefined) delete process.env[naam];
    else process.env[naam] = waarde;
  }
});

describe("gebruikDb en het wachtwoord", () => {
  test("een ongeldige URL geeft een fout zonder wachtwoord, ook niet in de weergave van de fout", async () => {
    process.env.DATABASE_URL = `postgres://elentrik:${WACHTWOORD}@db:5432/elentrik`;
    const { gebruikDb } = await import("../server/db");
    let fout: unknown;
    try {
      gebruikDb();
    } catch (e) {
      fout = e;
    }
    expect(fout).toBeInstanceOf(Error);
    const tekst = `${(fout as Error).message}\n${inspect(fout, { depth: 5 })}`;
    expect(tekst).toContain("DATABASE_URL is ongeldig");
    for (const stuk of [WACHTWOORD, "ge/heim", "heim#pw", "pw?x"]) expect(tekst).not.toContain(stuk);
  });

  test("zonder wachtwoord in de URL leest postgres-js PGPASSWORD, ook met / # ? @", async () => {
    process.env.DATABASE_URL = "postgres://elentrik@db:5432/elentrik";
    process.env.PGPASSWORD = WACHTWOORD;
    const { gebruikPostgres } = await import("../server/db");
    const client = gebruikPostgres();
    try {
      expect(client.options.pass).toBe(WACHTWOORD);
      expect(client.options.user).toBe("elentrik");
      expect(client.options.host).toEqual(["db"]);
    } finally {
      await client.end();
    }
  });
});
