// De hulpfuncties van de bedrijfsgegevens-API als pure functies, zonder Nitro-server.
import { mkdtemp, rm } from "node:fs/promises";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEvent, type H3Event } from "h3";
import { describe, expect, test } from "vitest";
import { MAX_LOGO_BYTES } from "../shared/bestandsinhoud";
import { bewaarBedrijf, bewaarLogo, haalBedrijf } from "../server/bedrijf/repo";
import { maakLokaleOpslag } from "../server/bestanden/opslag";
import { leesBedrijfBody } from "../server/utils/bedrijf";
import { leesLogoUpload, leesPlanUpload } from "../server/utils/bestanden";
import { maakTestDb } from "./db";

const GRENS = "----elentrik";

function maakEvent(opties: { headers?: Record<string, string>; body?: Buffer } = {}) {
  const req = new IncomingMessage(new Socket());
  req.method = "POST";
  req.headers = opties.headers ?? {};
  if (opties.body) {
    req.push(opties.body);
    req.push(null);
  }
  const event: H3Event = createEvent(req, new ServerResponse(req));
  return event;
}

function multipart(velden: { naam: string; inhoud: string | Uint8Array; bestand?: boolean }[]) {
  const delen: Buffer[] = [];
  for (const veld of velden) {
    const kop =
      `--${GRENS}\r\nContent-Disposition: form-data; name="${veld.naam}"` +
      (veld.bestand ? `; filename="logo.bin"\r\nContent-Type: application/octet-stream` : "") +
      `\r\n\r\n`;
    delen.push(Buffer.from(kop), Buffer.from(veld.inhoud), Buffer.from("\r\n"));
  }
  delen.push(Buffer.from(`--${GRENS}--\r\n`));
  const body = Buffer.concat(delen);
  return {
    body,
    headers: {
      "content-type": `multipart/form-data; boundary=${GRENS}`,
      "content-length": String(body.length),
    },
  };
}

async function statusVan(actie: () => unknown): Promise<number | undefined> {
  try {
    await actie();
  } catch (fout) {
    return (fout as { statusCode?: number }).statusCode;
  }
  return undefined;
}

describe("leesLogoUpload", () => {
  test("leest de bytes van het veld bestand", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const { body, headers } = multipart([{ naam: "bestand", inhoud: bytes, bestand: true }]);
    expect(await leesLogoUpload(maakEvent({ body, headers }))).toEqual(bytes);
  });

  test("een ontbrekend bestandsveld geeft 400", async () => {
    const { body, headers } = multipart([{ naam: "iets", inhoud: "x" }]);
    expect(await statusVan(() => leesLogoUpload(maakEvent({ body, headers })))).toBe(400);
  });

  test("een content-length boven MAX_LOGO_BYTES plus 1 MB geeft 413, de grens zelf niet", async () => {
    const grens = MAX_LOGO_BYTES + 1024 * 1024;
    expect(
      await statusVan(() =>
        leesLogoUpload(maakEvent({ headers: { "content-length": String(grens + 1) } })),
      ),
    ).toBe(413);
    // Op de grens volgt de body; zonder multipart is dat 400, nooit 413.
    expect(
      await statusVan(() =>
        leesLogoUpload(maakEvent({ headers: { "content-length": String(grens) } })),
      ),
    ).toBe(400);
  });
});

describe("de planupload blijft beperkt tot plannen", () => {
  test("soort logo of export geeft 400", async () => {
    for (const soort of ["logo", "export"]) {
      const { body, headers } = multipart([
        { naam: "soort", inhoud: soort },
        { naam: "bestand", inhoud: new Uint8Array([1]), bestand: true },
      ]);
      expect(await statusVan(() => leesPlanUpload(maakEvent({ body, headers })))).toBe(400);
    }
  });
});

describe("leesBedrijfBody", () => {
  function jsonEvent(waarde: unknown) {
    const body = Buffer.from(JSON.stringify(waarde));
    return maakEvent({
      body,
      headers: { "content-type": "application/json", "content-length": String(body.length) },
    });
  }

  test("een Partij zonder logoBestandId wordt gelezen", async () => {
    expect(await leesBedrijfBody(jsonEvent({ naam: "Peeters" }))).toEqual({ naam: "Peeters" });
  });

  test("een ongeldig adres of onbekend veld geeft 400", async () => {
    expect(
      await statusVan(() => leesBedrijfBody(jsonEvent({ naam: "P", adres: { straat: "x" } }))),
    ).toBe(400);
    expect(await statusVan(() => leesBedrijfBody(jsonEvent({ naam: "P", website: "x" })))).toBe(400);
  });

  test("een body met logoBestandId wordt aanvaard en het bewaarde logo blijft staan", async () => {
    const db = await maakTestDb();
    const map = await mkdtemp(join(tmpdir(), "elentrik-bedrijf-utils-"));
    try {
      const png = new Uint8Array(33);
      png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1]);
      const logo = await bewaarLogo(db, maakLokaleOpslag(map), png);
      const partij = await leesBedrijfBody(jsonEvent({ naam: "Nieuw", logoBestandId: "ander-id" }));
      expect(partij.logoBestandId).toBe("ander-id");
      expect(await bewaarBedrijf(db, partij)).toEqual({ naam: "Nieuw", logoBestandId: logo.id });
      expect(await haalBedrijf(db)).toEqual({ naam: "Nieuw", logoBestandId: logo.id });
    } finally {
      await rm(map, { recursive: true, force: true });
    }
  });
});
