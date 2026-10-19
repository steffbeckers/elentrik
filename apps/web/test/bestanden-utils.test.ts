// De hulpfuncties van de bestanden-API als pure functies, zonder Nitro-server.
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import { createEvent, type H3Event } from "h3";
import { describe, expect, test } from "vitest";
import { MAX_UPLOAD_BYTES } from "../shared/bestandsinhoud";
import { BestandFout, type BestandFoutCode } from "../server/bestanden/repo";
import {
  bestandId,
  controleerUploadGrootte,
  leesPlanUpload,
  metBestandFouten,
} from "../server/utils/bestanden";

const GRENS = "----elentrik";

function maakEvent(opties: { headers?: Record<string, string>; id?: string; body?: Buffer } = {}) {
  const req = new IncomingMessage(new Socket());
  req.method = "POST";
  req.headers = opties.headers ?? {};
  if (opties.body) {
    req.push(opties.body);
    req.push(null);
  }
  const event: H3Event = createEvent(req, new ServerResponse(req));
  if (opties.id !== undefined) event.context.params = { id: opties.id };
  return event;
}

function multipart(velden: { naam: string; inhoud: string | Uint8Array; bestand?: boolean }[]) {
  const delen: Buffer[] = [];
  for (const veld of velden) {
    const kop =
      `--${GRENS}\r\nContent-Disposition: form-data; name="${veld.naam}"` +
      (veld.bestand ? `; filename="plan.bin"\r\nContent-Type: application/octet-stream` : "") +
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

describe("bestandId", () => {
  test("een uuid wordt teruggegeven, een ander id geeft 404", async () => {
    const uuid = "00000000-0000-4000-8000-000000000000";
    expect(bestandId(maakEvent({ id: uuid }))).toBe(uuid);
    expect(await statusVan(() => bestandId(maakEvent({ id: "abc" })))).toBe(404);
  });
});

describe("controleerUploadGrootte", () => {
  test("een content-length boven de limiet plus 1 MB geeft 413", async () => {
    const te_groot = String(MAX_UPLOAD_BYTES + 1024 * 1024 + 1);
    expect(
      await statusVan(() =>
        controleerUploadGrootte(maakEvent({ headers: { "content-length": te_groot } })),
      ),
    ).toBe(413);
  });

  test("precies de limiet plus 1 MB, of geen header, is toegelaten", async () => {
    const grens = String(MAX_UPLOAD_BYTES + 1024 * 1024);
    expect(
      await statusVan(() =>
        controleerUploadGrootte(maakEvent({ headers: { "content-length": grens } })),
      ),
    ).toBeUndefined();
    expect(await statusVan(() => controleerUploadGrootte(maakEvent()))).toBeUndefined();
  });
});

describe("leesPlanUpload", () => {
  test("leest soort en bestandsbytes", async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const { body, headers } = multipart([
      { naam: "soort", inhoud: "plan-raster" },
      { naam: "bestand", inhoud: bytes, bestand: true },
    ]);
    const upload = await leesPlanUpload(maakEvent({ body, headers }));
    expect(upload.soort).toBe("plan-raster");
    expect(upload.data).toEqual(bytes);
  });

  test("een onbekende soort geeft 400", async () => {
    const { body, headers } = multipart([
      { naam: "soort", inhoud: "iets-anders" },
      { naam: "bestand", inhoud: new Uint8Array([1]), bestand: true },
    ]);
    expect(await statusVan(() => leesPlanUpload(maakEvent({ body, headers })))).toBe(400);
  });

  test("een ontbrekend bestandsveld of een ontbrekende soort geeft 400", async () => {
    const zonderBestand = multipart([{ naam: "soort", inhoud: "plan-raster" }]);
    expect(
      await statusVan(() =>
        leesPlanUpload(maakEvent({ body: zonderBestand.body, headers: zonderBestand.headers })),
      ),
    ).toBe(400);
    const zonderSoort = multipart([{ naam: "bestand", inhoud: new Uint8Array([1]), bestand: true }]);
    expect(
      await statusVan(() =>
        leesPlanUpload(maakEvent({ body: zonderSoort.body, headers: zonderSoort.headers })),
      ),
    ).toBe(400);
  });

  test("een te grote content-length geeft 413 zonder de body te lezen", async () => {
    const event = maakEvent({
      headers: {
        "content-type": `multipart/form-data; boundary=${GRENS}`,
        "content-length": String(MAX_UPLOAD_BYTES * 2),
      },
    });
    expect(await statusVan(() => leesPlanUpload(event))).toBe(413);
  });
});

describe("metBestandFouten", () => {
  test.each<[BestandFoutCode, number]>([
    ["NIET_GEVONDEN", 404],
    ["TE_GROOT", 413],
    ["ONGELDIG_TYPE", 415],
    ["RASTER_TE_GROOT", 422],
  ])("%s geeft %i", async (code, status) => {
    expect(
      await statusVan(() =>
        metBestandFouten(async () => {
          throw new BestandFout(code);
        }),
      ),
    ).toBe(status);
  });

  test("andere fouten, zoals een schrijffout, blijven ongemoeid", async () => {
    const eigen = new Error("schijf vol");
    await expect(
      metBestandFouten(async () => {
        throw eigen;
      }),
    ).rejects.toBe(eigen);
  });
});
