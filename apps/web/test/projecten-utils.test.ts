// De hulpfuncties van de projecten-API als pure functies, zonder Nitro-server.
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { installatie } from "@elentrik/arei/testing";
import {
  nieuwId,
  valideerStructuur,
  voegPaginaToe,
  zetAchtergrond,
  type InstallatieDocument,
  type NodeId,
} from "@elentrik/model";
import { createEvent, type H3Event } from "h3";
import { describe, expect, test } from "vitest";
import { z } from "zod";
import { ProjectFout } from "../server/projecten/repo";
import { DupliceerSchema, leesBody, leesIfMatch, MAX_JSON_BODY, metProjectFouten, projectId } from "../server/utils/projecten";

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

/** Een verzoek met een JSON-body zoals Node het binnenkrijgt: de kopregels, en de body als stroom. */
function maakBodyEvent(opties: { headers: Record<string, string>; body?: unknown }): H3Event {
  const req = new IncomingMessage(new Socket());
  req.method = "POST";
  req.headers = { "content-type": "application/json", ...opties.headers };
  if (opties.body !== undefined) req.push(Buffer.from(JSON.stringify(opties.body)));
  req.push(null);
  return createEvent(req, new ServerResponse(req));
}

async function foutVanBody(event: H3Event, schema: z.ZodType = z.object({ naam: z.string() })) {
  try {
    await leesBody(event, schema);
  } catch (fout) {
    return fout as { statusCode?: number; data?: { code?: string } };
  }
  return undefined;
}

describe("leesBody: de lengte van de body", () => {
  const body = { naam: "Woning Peeters" };

  test("een body met een content-length wordt gelezen", async () => {
    const json = JSON.stringify(body);
    const event = maakBodyEvent({ headers: { "content-length": String(Buffer.byteLength(json)) }, body });
    expect(await leesBody(event, z.object({ naam: z.string() }))).toEqual(body);
  });

  test("een body net onder 50 MB wordt gelezen", async () => {
    const event = maakBodyEvent({ headers: { "content-length": String(MAX_JSON_BODY - 1) }, body });
    expect(await leesBody(event, z.object({ naam: z.string() }))).toEqual(body);
  });

  test("precies 50 MB wordt nog gelezen", async () => {
    const event = maakBodyEvent({ headers: { "content-length": String(MAX_JSON_BODY) }, body });
    expect(await leesBody(event, z.object({ naam: z.string() }))).toEqual(body);
  });

  test("boven 50 MB geeft 413 VERZOEK_TE_GROOT, voor de body gelezen wordt", async () => {
    const event = maakBodyEvent({ headers: { "content-length": String(MAX_JSON_BODY + 1) }, body });
    const fout = await foutVanBody(event);
    expect([fout?.statusCode, fout?.data?.code]).toEqual([413, "VERZOEK_TE_GROOT"]);
    // De stroom is niet aangeraakt: er is niets uit gelezen.
    expect(event.node.req.readableDidRead).toBe(false);
  });

  test("een gestreamde body (Transfer-Encoding zonder content-length) geeft 411 LENGTE_VEREIST", async () => {
    const event = maakBodyEvent({ headers: { "transfer-encoding": "chunked" }, body });
    const fout = await foutVanBody(event);
    expect([fout?.statusCode, fout?.data?.code]).toEqual([411, "LENGTE_VEREIST"]);
    expect(event.node.req.readableDidRead).toBe(false);
  });

  test.each([
    ["is leeg", ""],
    ["is geen getal", "abc"],
    ["is negatief", "-5"],
    ["is een kommagetal", "1.5"],
  ])("Transfer-Encoding met een content-length die %s geeft 411 LENGTE_VEREIST", async (_naam, waarde) => {
    const event = maakBodyEvent({ headers: { "transfer-encoding": "chunked", "content-length": waarde }, body });
    const fout = await foutVanBody(event);
    expect([fout?.statusCode, fout?.data?.code]).toEqual([411, "LENGTE_VEREIST"]);
  });

  test("een content-length die geen getal is, geeft 411 LENGTE_VEREIST", async () => {
    const event = maakBodyEvent({ headers: { "content-length": "abc" }, body });
    const fout = await foutVanBody(event);
    expect([fout?.statusCode, fout?.data?.code]).toEqual([411, "LENGTE_VEREIST"]);
  });

  test("een verzoek zonder content-length en zonder Transfer-Encoding is een lege body: een optionele body blijft werken", async () => {
    const event = maakBodyEvent({ headers: {} });
    expect(await leesBody(event, DupliceerSchema)).toEqual({ bestandIds: [] });
  });

  test("een lege body met content-length 0 blijft werken", async () => {
    const event = maakBodyEvent({ headers: { "content-length": "0" } });
    expect(await leesBody(event, DupliceerSchema)).toEqual({ bestandIds: [] });
  });

  test("een ongeldige body blijft 400 ONGELDIGE_INVOER", async () => {
    const event = maakBodyEvent({ headers: { "content-length": "2" }, body: { naam: 5 } });
    const fout = await foutVanBody(event);
    expect([fout?.statusCode, fout?.data?.code]).toEqual([400, "ONGELDIGE_INVOER"]);
  });
});

describe("de grootte van een groot document", () => {
  /** Een groot, realistisch document: 40 situatiepagina's met plan, plaatsingen en 2.000 knopen. */
  function bouwGrootDocument(): InstallatieDocument {
    const { doc, ids } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.als("bord")))
      .bouw();
    let groot = structuredClone(doc);
    const bordId = ids["bord"]!;
    const contactdozen: NodeId[] = [];
    for (let i = 0; i < 200; i++) {
      const automaatId = nieuwId();
      const leidingId = nieuwId();
      groot.nodes[automaatId] = { id: automaatId, parentId: bordId, kinderen: [leidingId], type: "automaat", nominaal_A: 16, polen: 2, curve: "B" };
      groot.nodes[leidingId] = { id: leidingId, parentId: automaatId, kinderen: [], type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 };
      groot.nodes[bordId]!.kinderen.push(automaatId);
      let ouderId = leidingId;
      for (let j = 0; j < 8; j++) {
        const id = nieuwId();
        groot.nodes[id] = { id, parentId: ouderId, kinderen: [], type: "contactdoos", aantal: 1, randaarde: true, kinderbeveiliging: true, waterdicht: false };
        groot.nodes[ouderId]!.kinderen.push(id);
        contactdozen.push(id);
        ouderId = id;
      }
    }
    // 40 pagina's, elk met een plan (twee bestand-id's) en 40 plaatsingen.
    const paginaIds: string[] = [];
    for (let p = 0; p < 40; p++) {
      const toegevoegd = voegPaginaToe(groot, `Verdieping ${p}`);
      groot = zetAchtergrond(toegevoegd.doc, toegevoegd.id, {
        origineelBestandId: nieuwId(),
        rasterBestandId: nieuwId(),
        breedte_px: 6000,
        hoogte_px: 4000,
      }).doc;
      paginaIds.push(toegevoegd.id);
    }
    // Het resultaat van de operaties is bevroren; de plaatsingen komen op een kopie.
    groot = structuredClone(groot);
    paginaIds.forEach((id, p) => {
      const pagina = groot.situatie.paginas.find((x) => x.id === id)!;
      for (const nodeId of contactdozen.slice(p * 40, p * 40 + 40)) {
        pagina.plaatsingen.push({ nodeId, x: 1234.5678, y: 8765.4321, rotatie: 90 });
      }
    });
    return groot;
  }

  test("40 situatiepagina's en 2.000 knopen blijven ruim onder MAX_JSON_BODY", () => {
    const doc = bouwGrootDocument();
    expect(valideerStructuur(doc)).toEqual([]);
    expect(Object.keys(doc.nodes).length).toBeGreaterThanOrEqual(2000);
    expect(doc.situatie.paginas).toHaveLength(40);

    const grootte = Buffer.byteLength(JSON.stringify({ naam: "Groot project", document: doc }));
    console.info(`Groot document: ${Object.keys(doc.nodes).length} knopen, 40 pagina's, ${grootte} bytes JSON`);
    expect(grootte).toBeLessThan(MAX_JSON_BODY);
    // Ruime marge: minstens een factor 10.
    expect(grootte * 10).toBeLessThan(MAX_JSON_BODY);
  });
});
