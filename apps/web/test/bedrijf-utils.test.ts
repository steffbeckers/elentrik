// De hulpfuncties van de bedrijfsgegevens-API als pure functies, zonder Nitro-server.
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createEvent, type H3Event } from "h3";
import { describe, expect, test } from "vitest";
import { MAX_LOGO_BYTES } from "../shared/bestandsinhoud";
import { BedrijfFout } from "../server/bedrijf/repo";
import { BewaarBedrijfSchema, metBedrijfFouten } from "../server/utils/bedrijf";
import { leesLogoUpload, leesPlanUpload } from "../server/utils/bestanden";

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

describe("BewaarBedrijfSchema", () => {
  test("aanvaardt een Partij zonder logoBestandId", () => {
    expect(BewaarBedrijfSchema.safeParse({ naam: "Peeters" }).success).toBe(true);
  });

  test("weigert logoBestandId en onbekende velden", () => {
    expect(BewaarBedrijfSchema.safeParse({ naam: "P", logoBestandId: "x" }).success).toBe(false);
    expect(BewaarBedrijfSchema.safeParse({ naam: "P", website: "x" }).success).toBe(false);
  });
});

describe("metBedrijfFouten", () => {
  test("BedrijfFout wordt 422, een andere fout blijft ongewijzigd", async () => {
    expect(
      await statusVan(() =>
        metBedrijfFouten(async () => {
          throw new BedrijfFout("ONGELDIG", []);
        }),
      ),
    ).toBe(422);
    await expect(
      metBedrijfFouten(async () => {
        throw new Error("kapot");
      }),
    ).rejects.toThrow("kapot");
  });
});
