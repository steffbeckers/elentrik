import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { bestandHeaders } from "../server/bestanden/headers";
import { maakLokaleOpslag } from "../server/bestanden/opslag";

let map: string;

beforeEach(async () => {
  map = await mkdtemp(join(tmpdir(), "elentrik-opslag-"));
});

afterEach(async () => {
  await rm(map, { recursive: true, force: true });
});

async function lees(stroom: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stroom).arrayBuffer());
}

describe("lokale opslag", () => {
  test("lees op een ontbrekende sleutel geeft null", async () => {
    const opslag = maakLokaleOpslag(map);
    expect(await opslag.lees("project/ontbreekt")).toBeNull();
    expect(await opslag.bestaat("project/ontbreekt")).toBe(false);
  });

  test("schrijf maakt de submap en lees geeft dezelfde bytes terug", async () => {
    const opslag = maakLokaleOpslag(map);
    const data = new Uint8Array([1, 2, 3, 4]);
    await opslag.schrijf("project-a/bestand-1", data);

    expect(await opslag.bestaat("project-a/bestand-1")).toBe(true);
    expect(new Uint8Array(await readFile(join(map, "project-a", "bestand-1")))).toEqual(data);
    const stroom = await opslag.lees("project-a/bestand-1");
    expect(stroom).not.toBeNull();
    expect(await lees(stroom!)).toEqual(data);
  });

  test("een sleutel die uit de map ontsnapt wordt geweigerd", async () => {
    const opslag = maakLokaleOpslag(map);
    await expect(opslag.schrijf("../buiten", new Uint8Array([1]))).rejects.toThrow();
    await expect(opslag.lees("../buiten")).rejects.toThrow();
  });

  test("een schrijffout komt boven, ze wordt niet ingeslikt", async () => {
    // De opslagmap is eigenlijk een gewoon bestand, dus mkdir eronder faalt.
    const nep = join(map, "bestand-als-map");
    await writeFile(nep, "x");
    const opslag = maakLokaleOpslag(nep);
    await expect(opslag.schrijf("p/b", new Uint8Array([1]))).rejects.toThrow();
  });
});

describe("bestandHeaders", () => {
  test("geeft de veiligheids- en cacheheaders, met een sandbox-CSP", () => {
    expect(bestandHeaders("image/png")).toEqual({
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, max-age=31536000, immutable",
    });
  });
});

describe("bestandHeaders met download", () => {
  test("geeft attachment met een gesaneerde filename en een correcte filename*", () => {
    const headers = bestandHeaders("application/pdf", { download: 'Huis "Peeters" / V1.pdf' });
    expect(headers["Content-Disposition"]).toBe(
      `attachment; filename="Huis Peeters V1.pdf"; filename*=UTF-8''Huis%20Peeters%20V1.pdf`,
    );
    expect(headers["Content-Type"]).toBe("application/pdf");
    expect(headers["Content-Security-Policy"]).toBe("sandbox; default-src 'none'");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  test("niet-ASCII blijft in filename*, filename krijgt een ASCII-vorm", () => {
    const headers = bestandHeaders("application/pdf", { download: "Café Brûlé - V1 (def)*.pdf" });
    expect(headers["Content-Disposition"]).toBe(
      `attachment; filename="Cafe Brule - V1 (def).pdf"; ` +
        `filename*=UTF-8''Caf%C3%A9%20Br%C3%BBl%C3%A9%20-%20V1%20%28def%29.pdf`,
    );
  });

  test("stuurtekens en verboden tekens verdwijnen; niets over geeft export.pdf", () => {
    const stuur = bestandHeaders("application/pdf", { download: "a\r\nb\u0000c\u007fd\\:?<>|.pdf" });
    expect(stuur["Content-Disposition"]).toBe(`attachment; filename="a b c d.pdf"; filename*=UTF-8''a%20b%20c%20d.pdf`);
    const leeg = bestandHeaders("application/pdf", { download: '"/\\' });
    expect(leeg["Content-Disposition"]).toBe(`attachment; filename="export.pdf"; filename*=UTF-8''export.pdf`);
  });

  test("tekens zonder ASCII-vorm worden _ in filename", () => {
    const headers = bestandHeaders("application/pdf", { download: "Huis 😀 €.pdf" });
    expect(headers["Content-Disposition"]).toBe(
      `attachment; filename="Huis _ _.pdf"; filename*=UTF-8''Huis%20%F0%9F%98%80%20%E2%82%AC.pdf`,
    );
  });
});

describe("bestandHeaders: geen parameterinjectie via unicode-normalisatie", () => {
  /** De waarde tussen de aanhalingstekens van `filename="…"`. */
  function filenameWaarde(header: string): string {
    const begin = header.indexOf('filename="') + 'filename="'.length;
    const einde = header.indexOf('"; filename*=');
    return header.slice(begin, einde);
  }

  function controleer(download: string): string {
    const header = bestandHeaders("application/pdf", { download })["Content-Disposition"]!;
    expect(header.match(/filename=/g)).toHaveLength(1);
    expect(header.match(/filename\*=/g)).toHaveLength(1);
    expect(filenameWaarde(header)).not.toMatch(/["\\]/);
    expect(header).toMatch(/^attachment; filename="[^"\\]*"; filename\*=UTF-8''[A-Za-z0-9!#$&+\-.^_`|~%]+$/);
    return header;
  }

  test.each([
    ["volbreed aanhalingsteken", "Huis \uff02Peeters\uff02.pdf"],
    ["volbrede backslash", "Huis \uff3c Peeters.pdf"],
    ["volbrede schuine streep, dubbelpunt en kleiner-dan", "a\uff0fb\uff1ac\uff1cd.pdf"],
    ["volledige injectie", "Huis \uff02; filename*=UTF-8''evil.exe; x=\uff02"],
  ])("%s", (_naam, download) => {
    controleer(download);
  });

  test("de injectie levert geen evil.exe-parameter op", () => {
    const header = controleer("Huis \uff02; filename*=UTF-8''evil.exe; x=\uff02");
    expect(header).not.toContain("filename*=UTF-8''evil.exe");
    expect(filenameWaarde(header)).toBe("Huis _ filename_UTF-8''evil.exe_ x_");
  });

  test("een naam van enkel volbrede verboden tekens wordt export.pdf in filename", () => {
    const header = controleer("\uff02\uff3c\uff0f");
    expect(filenameWaarde(header)).toBe("export.pdf");
  });
});

describe("bestandHeaders: lengte van de downloadnaam", () => {
  test("een lange naam wordt afgekapt op 150 tekens vóór de extensie, .pdf blijft", () => {
    const header = bestandHeaders("application/pdf", { download: `${"a".repeat(300)} - V1.pdf` })["Content-Disposition"]!;
    expect(header).toBe(`attachment; filename="${"a".repeat(150)}.pdf"; filename*=UTF-8''${"a".repeat(150)}.pdf`);
  });

  test("afkappen telt codepunten en breekt geen surrogaatpaar", () => {
    const header = bestandHeaders("application/pdf", { download: `${"😀".repeat(200)}.pdf` })["Content-Disposition"]!;
    expect(header).toContain(`filename="${"_".repeat(150)}.pdf"`);
    expect(header).toContain(`filename*=UTF-8''${"%F0%9F%98%80".repeat(150)}.pdf`);
  });
});
