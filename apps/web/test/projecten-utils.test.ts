// De hulpfuncties van de projecten-API als pure functies, zonder Nitro-server.
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createEvent, type H3Event } from "h3";
import { describe, expect, test } from "vitest";
import { ProjectFout } from "../server/projecten/repo";
import { leesIfMatch, metProjectFouten, projectId } from "../server/utils/projecten";

function maakEvent(opties: { headers?: Record<string, string>; id?: string } = {}): H3Event {
  const req = new IncomingMessage(new Socket());
  req.headers = opties.headers ?? {};
  const event = createEvent(req, new ServerResponse(req));
  if (opties.id !== undefined) event.context.params = { id: opties.id };
  return event;
}

function statusVan(actie: () => unknown): number | undefined {
  try {
    actie();
  } catch (fout) {
    return (fout as { statusCode?: number }).statusCode;
  }
  return undefined;
}

describe("leesIfMatch", () => {
  test.each([
    ["ontbrekend", undefined],
    ["leeg", ""],
    ["tekst", "abc"],
    ["decimaal", "1.5"],
    ["negatief", "-1"],
    ["boven int4", "99999999999"],
    ["net boven int4", "2147483648"],
  ])("%s geeft 428", (_naam, waarde) => {
    const headers: Record<string, string> = waarde === undefined ? {} : { "if-match": waarde };
    expect(statusVan(() => leesIfMatch(maakEvent({ headers })))).toBe(428);
  });

  test("een geheel getal wordt gelezen", () => {
    expect(leesIfMatch(maakEvent({ headers: { "if-match": "3" } }))).toBe(3);
  });

  test("de grootste int4 is toegelaten", () => {
    expect(leesIfMatch(maakEvent({ headers: { "if-match": "2147483647" } }))).toBe(2147483647);
  });
});

describe("projectId", () => {
  test("een uuid wordt teruggegeven", () => {
    const id = "0b6f3f0e-6f0e-4f43-9a52-3f1c7c5d9b11";
    expect(projectId(maakEvent({ id }))).toBe(id);
  });

  test.each(["abc", "123", ""])("%j is geen uuid: 404", (id) => {
    expect(statusVan(() => projectId(maakEvent({ id })))).toBe(404);
  });
});

describe("metProjectFouten", () => {
  const vang = async (actie: () => Promise<unknown>) => {
    try {
      await metProjectFouten(actie);
    } catch (fout) {
      return fout as { statusCode?: number; data?: unknown };
    }
    return undefined;
  };

  test("geeft het resultaat door", async () => {
    expect(await metProjectFouten(async () => 42)).toBe(42);
  });

  test("NIET_GEVONDEN wordt 404", async () => {
    const fout = await vang(async () => {
      throw new ProjectFout("NIET_GEVONDEN");
    });
    expect(fout?.statusCode).toBe(404);
  });

  test("CONFLICT wordt 409 met de huidige versie", async () => {
    const fout = await vang(async () => {
      throw new ProjectFout("CONFLICT", { versie: 7 });
    });
    expect(fout?.statusCode).toBe(409);
    expect(fout?.data).toEqual({ versie: 7, code: "PROJECT_GEWIJZIGD" });
  });

  test("ONGELDIG wordt 422 met details", async () => {
    const fout = await vang(async () => {
      throw new ProjectFout("ONGELDIG", { problemen: [] });
    });
    expect(fout?.statusCode).toBe(422);
    expect(fout?.data).toEqual({ problemen: [], code: "ONGELDIG_DOCUMENT" });
  });

  test("andere fouten blijven ongewijzigd", async () => {
    const eigen = new Error("kapot");
    await expect(
      metProjectFouten(async () => {
        throw eigen;
      }),
    ).rejects.toBe(eigen);
  });
});
