import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
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

describe("lokale opslag: oplijsten en verwijderen", () => {
  test("lijst geeft elke sleutel met zijn wijzigingstijd, ook uit submappen, met schuine strepen", async () => {
    const opslag = maakLokaleOpslag(map);
    await opslag.schrijf("project-a/bestand-1", new Uint8Array([1]));
    await opslag.schrijf("org/organisatie-1/logo-1", new Uint8Array([2]));
    await opslag.schrijf("los", new Uint8Array([3]));
    const oud = new Date("2026-01-02T03:04:05.000Z");
    await utimes(join(map, "project-a", "bestand-1"), oud, oud);

    const lijst = await opslag.lijst();

    expect(lijst.map((b) => b.sleutel).sort()).toEqual(["los", "org/organisatie-1/logo-1", "project-a/bestand-1"]);
    expect(lijst.find((b) => b.sleutel === "project-a/bestand-1")!.gewijzigd).toEqual(oud);
  });

  test("lijst slaat NAS-metadata over: namen met @ of . aan het begin, bestanden en mappen", async () => {
    const opslag = maakLokaleOpslag(map);
    await opslag.schrijf("project-a/bestand-1", new Uint8Array([1]));
    await writeFile(join(map, ".DS_Store"), "x");
    await writeFile(join(map, "project-a", ".verborgen"), "x");
    await mkdir(join(map, "@eaDir", "project-a"), { recursive: true });
    await writeFile(join(map, "@eaDir", "project-a", "bestand-1@SynoEAStream"), "x");
    await mkdir(join(map, "project-a", "@eaDir"));
    await writeFile(join(map, "project-a", "@eaDir", "miniatuur"), "x");
    await mkdir(join(map, ".AppleDouble"));
    await writeFile(join(map, ".AppleDouble", "x"), "x");

    expect((await opslag.lijst()).map((b) => b.sleutel)).toEqual(["project-a/bestand-1"]);
  });

  test("lijst op een ontbrekende of lege map geeft een lege lijst, mappen zijn geen bestanden", async () => {
    expect(await maakLokaleOpslag(join(map, "bestaat-niet")).lijst()).toEqual([]);
    await mkdir(join(map, "lege-submap"));
    expect(await maakLokaleOpslag(map).lijst()).toEqual([]);
  });

  test("verwijder wist het bestand; een ontbrekend bestand is geen fout", async () => {
    const opslag = maakLokaleOpslag(map);
    await opslag.schrijf("p/b", new Uint8Array([1]));
    await opslag.verwijder("p/b");
    expect(await opslag.bestaat("p/b")).toBe(false);
    await expect(opslag.verwijder("p/b")).resolves.toBeUndefined();
    await expect(opslag.verwijder("bestaat/nooit")).resolves.toBeUndefined();
  });

  test("verwijder weigert een sleutel die uit de map ontsnapt en wist een map niet", async () => {
    const opslag = maakLokaleOpslag(join(map, "wortel"));
    await writeFile(join(map, "buiten"), "x");
    await expect(opslag.verwijder("../buiten")).rejects.toThrow();
    expect(await readFile(join(map, "buiten"), "utf8")).toBe("x");

    await opslag.schrijf("map/bestand", new Uint8Array([1]));
    await expect(opslag.verwijder("map")).rejects.toThrow();
    expect(await opslag.bestaat("map/bestand")).toBe(true);
  });
});

describe("lokale opslag: de wortel en lege mappen", () => {
  test("bestaatWortel: waar voor een bestaande map, onwaar voor een ontbrekende of voor een bestand", async () => {
    expect(await maakLokaleOpslag(map).bestaatWortel()).toBe(true);
    expect(await maakLokaleOpslag(join(map, "bestaat-niet")).bestaatWortel()).toBe(false);
    await writeFile(join(map, "bestand"), "x");
    expect(await maakLokaleOpslag(join(map, "bestand")).bestaatWortel()).toBe(false);
  });

  test("wisLegeMap wist een lege map", async () => {
    const opslag = maakLokaleOpslag(map);
    await mkdir(join(map, "project-a"));
    await opslag.wisLegeMap("project-a");
    await expect(stat(join(map, "project-a"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("wisLegeMap laat een map met een bestand staan, zonder fout", async () => {
    const opslag = maakLokaleOpslag(map);
    await opslag.schrijf("project-a/bestand-1", new Uint8Array([1]));
    await expect(opslag.wisLegeMap("project-a")).resolves.toBeUndefined();
    expect(await opslag.bestaat("project-a/bestand-1")).toBe(true);
  });

  test("wisLegeMap laat een map met alleen een lege submap staan", async () => {
    const opslag = maakLokaleOpslag(map);
    await mkdir(join(map, "org", "organisatie-1"), { recursive: true });
    await opslag.wisLegeMap("org");
    expect((await stat(join(map, "org"))).isDirectory()).toBe(true);
  });

  test("wisLegeMap op een ontbrekende map is geen fout", async () => {
    await expect(maakLokaleOpslag(map).wisLegeMap("bestaat/nooit")).resolves.toBeUndefined();
  });

  test("wisLegeMap wist nooit de wortel zelf, ook niet als ze leeg is", async () => {
    const wortel = join(map, "wortel");
    await mkdir(wortel);
    const opslag = maakLokaleOpslag(wortel);
    for (const naam of ["", ".", "./", "a/.."]) {
      await opslag.wisLegeMap(naam);
      expect((await stat(wortel)).isDirectory(), naam).toBe(true);
    }
  });

  test("wisLegeMap weigert een map buiten de opslagmap", async () => {
    const wortel = join(map, "wortel");
    await mkdir(wortel);
    await mkdir(join(map, "buiten"));
    await expect(maakLokaleOpslag(wortel).wisLegeMap("../buiten")).rejects.toThrow();
    expect((await stat(join(map, "buiten"))).isDirectory()).toBe(true);
  });

  test("schrijf en wisLegeMap tegelijk: elke upload slaagt en elk bestand blijft", async () => {
    const opslag = maakLokaleOpslag(map);
    const uploads = Array.from({ length: 40 }, (_, i) => `project-a/bestand-${i}`);
    await Promise.all([
      ...uploads.map((sleutel) => opslag.schrijf(sleutel, new Uint8Array([1]))),
      ...uploads.map(() => opslag.wisLegeMap("project-a")),
    ]);
    expect((await opslag.lijst()).map((b) => b.sleutel).sort()).toEqual([...uploads].sort());
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

  test("volbrede ； en ＝ worden _ in filename, net als ; en =", () => {
    const header = controleer("Huis\uff1b x\uff1dy.pdf");
    expect(filenameWaarde(header)).toBe("Huis_ x_y.pdf");
    expect(header).toContain("filename*=UTF-8''Huis%EF%BC%9B%20x%EF%BC%9Dy.pdf");
  });

  test("een ligatuur valt uiteen in haar letters in filename en blijft heel in filename*", () => {
    const header = controleer("\ufb01naal o\ufb03ce.pdf");
    expect(filenameWaarde(header)).toBe("finaal office.pdf");
    expect(header).toContain("filename*=UTF-8''%EF%AC%81naal%20o%EF%AC%83ce.pdf");
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
