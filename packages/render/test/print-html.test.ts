import { analyseer, controleer, formatteerBericht, haalRegelset, type Bevinding } from "@elentrik/arei";
import {
  installatie,
  referentieAppartement,
  referentieMetOnderbord,
  referentieRijwoning,
  referentieWoning,
} from "@elentrik/arei/testing";
import { bruikbaar, papierMaat, STANDAARD_PAPIER_A4, tekstBreedte } from "@elentrik/layout";
import { PLAATSBARE_TYPES, type InstallatieDocument, type Partij } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { formatteerDatum, LOCALES, NL, overgeslagenPaginas, printHtml, TEKSTEN, type PrintOpties } from "../src/index";
import { cartouche } from "../src/print/cartouche";
import { BIJLAGE_BREEDTE_FACTOR } from "../src/print/print-html";
import { afkorten, breekRegels } from "../src/print/tekst";
import { kloon, nummerNodeIds } from "./hulp";

const INSTALLATEUR: Partij = {
  naam: "Elektro Peeters bv",
  ondernemingsnummer: "BE 0123.456.789",
  email: "info@elektropeeters.be",
  telefoon: "011 22 33 44",
  adres: { straat: "Stationsstraat", nummer: "12", postcode: "3500", gemeente: "Hasselt", land: "BE" },
};

test.each(["nl", "fr", "en"] as const)("voeding op elk afgedrukt blad (%s)", taal => {
  const doc = kloon(referentieWoning());
  doc.voeding.stroomtype = "3N400V";
  doc.voeding.frequentie_Hz = 50;
  const resultaat = printHtml(doc, analyseer(doc), [], opties({ taal }));
  for (const sectie of resultaat.html.split('<section class="pagina">').slice(1)) {
    expect(sectie).toContain("3N × 400 V ~ 50 Hz");
  }
});

function opties(extra: Partial<PrintOpties> = {}): PrintOpties {
  return {
    papier: "A4",
    onderdelen: { eendraadschema: true, situatieschema: true, kringenlijst: true, bijlage: true },
    versieLabel: "v1",
    datum: "2026-10-19",
    taal: "nl",
    installateur: INSTALLATEUR,
    afbeeldingen: {},
    ...extra,
  };
}

const alleenOnderdeel = (naam: keyof PrintOpties["onderdelen"]): PrintOpties["onderdelen"] => ({
  eendraadschema: false,
  situatieschema: false,
  kringenlijst: false,
  bijlage: false,
  [naam]: true,
});

/** Een document met vaste klant-, werf- en EAN-gegevens. */
function metGegevens(doc: InstallatieDocument): InstallatieDocument {
  const kopie = kloon(doc);
  kopie.meta.klant = {
    naam: "Familie Janssens",
    adres: { straat: "Kerkstraat", nummer: "5", bus: "2", postcode: "3510", gemeente: "Kermt", land: "BE" },
  };
  kopie.meta.werfadres = { straat: "Nieuwstraat", nummer: "88", postcode: "3500", gemeente: "Hasselt", land: "BE" };
  kopie.meta.ean = "541448820000000000";
  kopie.meta.datum = "2026-10-01";
  return kopie;
}

/** Voegt een situatiepagina met achtergrond en twee geplaatste punten toe. */
function metSituatie(doc: InstallatieDocument): InstallatieDocument {
  const kopie = kloon(doc);
  const analyse = analyseer(kopie);
  const [eerste, tweede] = analyse.kringen[0]!.puntIds;
  kopie.situatie.paginas.push({
    id: "pagina-1",
    titel: "Gelijkvloers",
    achtergrond: { origineelBestandId: "orig-1", rasterBestandId: "raster-1", breedte_px: 3000, hoogte_px: 2000 },
    plaatsingen: [
      { nodeId: eerste!, x: 500, y: 400, rotatie: 0 },
      { nodeId: tweede!, x: 1500, y: 1200, rotatie: 90 },
    ],
  });
  return kopie;
}

function bevindingenVan(doc: InstallatieDocument): Bevinding[] {
  return controleer(doc, haalRegelset(doc.regelset));
}

function ontsnap(tekst: string): string {
  return tekst
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

type Regel = { klasse: string; breedte: number; grootte: number; tekst: string };

/** Alle tekstregels van het document: elk een `<div class="t …">` met breedte en tekstgrootte in mm. */
function regels(html: string): Regel[] {
  const patroon = /<div class="t( [^"]*)?" style="width:([\d.]+)mm;font-size:([\d.]+)mm">([^<]*)<\/div>/g;
  return [...html.matchAll(patroon)].map((m) => ({
    klasse: (m[1] ?? "").trim(),
    breedte: Number(m[2]),
    grootte: Number(m[3]),
    tekst: ontsnap(m[4]!),
  }));
}

/** De pagina's, zonder de slotpagina met metingen van een export zonder bijlage (zie print-metingen.test.ts). */
function paginas(html: string): string[] {
  return html.split('<section class="pagina">').slice(1).filter(p => !p.includes('<div class="bijlage metingen"'));
}

describe("printHtml", () => {
  test("A4 bewaart het volledige werfadres met huisnummer over meerdere regels", () => {
    const doc = metGegevens(referentieAppartement());
    doc.meta.werfadres.straat = "Voorbeeldstraat (fictief)";
    doc.meta.werfadres.nummer = "12";
    const { html } = printHtml(doc, analyseer(doc), [], opties());
    const werf = html.split('<div class="vak werf"')[1]!.split('<div class="vak titel"')[0]!;
    expect(regels(werf).map(r => r.tekst).join(" ")).toContain("Voorbeeldstraat (fictief) 12");
    expect(werf).not.toContain("…");
  });

  test.each(["nl", "fr", "en"] as const)("voorlopige controlebeperking staat op elke pagina zonder bijlage (%s)", taal => {
    const doc = referentieAppartement();
    const { html, paginas: aantal } = printHtml(doc, analyseer(doc), [], opties({ taal, onderdelen: alleenOnderdeel("eendraadschema") }));
    expect(html.match(/class="controlebeperking"/g)).toHaveLength(aantal);
    expect(html).toContain(TEKSTEN[taal].controlebeperking);
  });

  test("lange puntomschrijvingen lopen door op volgende pagina's zonder tekstverlies", () => {
    const doc = kloon(referentieAppartement());
    const analyse = analyseer(doc);
    const id = analyse.kringen[0]!.puntIds[0]!;
    doc.nodes[id]!.label = "BEGIN " + "extra beschrijving ".repeat(160) + "EIND <veilig>";
    const { html, paginas: aantal } = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
    const tekst = regels(html).filter(r => r.klasse === "cel").map(r => r.tekst).join(" ");
    expect(aantal).toBeGreaterThan(1);
    expect(tekst).toContain("BEGIN");
    expect(tekst).toContain("EIND <veilig>");
    expect(tekst.match(/\bextra\b/g)).toHaveLength(160);
    expect(tekst).not.toContain("…");
    expect(html).not.toContain("<veilig>");
  });

  test("een niet-afgedrukte situatiepaginatitel neemt geen cartoucheruimte in", () => {
    const doc = metGegevens(referentieAppartement());
    doc.situatie.paginas.push({ id: "overgeslagen", titel: "W".repeat(10000), plaatsingen: [] });
    expect(() => printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("eendraadschema") }))).not.toThrow();
  });

  test("situatieschaal volgt de werkelijke afdrukmaat en vermeldt afdruk op 100%", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    Object.assign(doc.situatie.paginas[0]!.achtergrond!, { breedte_px: 1000, hoogte_px: 1000, schaal: { mmPerPx: 50 } });
    const { html } = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: { "raster-1": "plan.png" } }));
    // A4: 210 - 20 margins - 30 metadata - 9 limitation - 6 scale caption = 145 mm.
    expect(html).toContain("Schaal bij afdruk op 100%: 1:344,8");
    expect(html).toContain("width:145mm;height:145mm");
  });

  test("snapshot: referentieAppartement op A4 met alle onderdelen", async () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties());
    await expect(nummerNodeIds(uit.html)).toMatchFileSnapshot("__snapshots__/print-appartement-a4.html");
  });

  test("snapshot: referentieWoning op A3 met situatieschema en logo", async () => {
    const doc = metSituatie(metGegevens(referentieWoning()));
    const uit = printHtml(
      doc,
      analyseer(doc),
      bevindingenVan(doc),
      opties({ papier: "A3", afbeeldingen: { "raster-1": "plan-1.png" }, logo: "logo.png" }),
    );
    expect(uit.overgeslagen).toEqual([]);
    await expect(nummerNodeIds(uit.html)).toMatchFileSnapshot("__snapshots__/print-woning-a3.html");
  });

  test("snapshot: referentieRijwoning op A4 met alle onderdelen", async () => {
    const doc = metGegevens(referentieRijwoning());
    const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties());
    await expect(nummerNodeIds(uit.html)).toMatchFileSnapshot("__snapshots__/print-rijwoning-a4.html");
  });

  test("snapshot: referentieMetOnderbord op A4 met alle onderdelen", async () => {
    const doc = metGegevens(referentieMetOnderbord());
    const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties());
    await expect(nummerNodeIds(uit.html)).toMatchFileSnapshot("__snapshots__/print-met-onderbord-a4.html");
  });

  test("de HTML laadt niets van het net: geen src of href naar http(s)", () => {
    const referenties = [referentieAppartement(), referentieRijwoning(), referentieWoning(), referentieMetOnderbord()];
    for (const referentie of referenties) {
      const doc = metSituatie(metGegevens(referentie));
      const { html } = printHtml(
        doc,
        analyseer(doc),
        bevindingenVan(doc),
        opties({ afbeeldingen: { "raster-1": "plan-1.png" }, logo: "logo.png" }),
      );
      expect(html).not.toMatch(/src="http/i);
      expect(html).not.toMatch(/href="http/i);
    }
  });

  test("een volledig document met @page op papiermaat en een vaste maat per pagina", () => {
    const doc = metGegevens(referentieAppartement());
    for (const formaat of ["A4", "A3"] as const) {
      const { html } = printHtml(doc, analyseer(doc), [], opties({ papier: formaat }));
      const maat = papierMaat(formaat);
      expect(html.startsWith("<!doctype html>")).toBe(true);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain(`@page { size: ${maat.breedte}mm ${maat.hoogte}mm; margin: 0 }`);
      expect(html).toContain(`width: ${maat.breedte}mm; height: ${maat.hoogte}mm;`);
      expect(html).toContain("break-after: page");
      expect(html).toContain(".pagina:last-child { break-after: auto;");
      expect(html).not.toMatch(/<link|@import|url\(http/);
      expect(html.trimEnd().endsWith("</html>")).toBe(true);
    }
  });

  test("paginas is het aantal secties en elke cartouche toont N / M", () => {
    const doc = metSituatie(metGegevens(referentieWoning()));
    const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ afbeeldingen: { "raster-1": "plan.png" } }));
    const secties = paginas(uit.html);
    expect(uit.paginas).toBe(secties.length);
    expect(uit.paginas).toBeGreaterThanOrEqual(4);
    secties.forEach((sectie, i) => {
      expect(sectie).toContain(`>${NL.cartouche.pagina} ${i + 1} / ${uit.paginas}</div>`);
    });
  });

  test("de onderdelen staan in vaste volgorde, met de paginatitel in de cartouche", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    const uit = printHtml(doc, analyseer(doc), [], opties({ afbeeldingen: { "raster-1": "plan.png" } }));
    const titels = paginas(uit.html).map((s) => regels(s).filter((r) => r.klasse === "titel").map(r => r.tekst).join(" "));
    expect([...new Set(titels)]).toEqual([
      NL.paginatitels.eendraadschema,
      `${NL.paginatitels.situatieschema} — Gelijkvloers`,
      NL.paginatitels.kringenlijst,
      NL.paginatitels.bijlage,
    ]);
  });

  test("de cartouche staat op elke pagina met installateur, klant, werf, EAN, datum, versie en handtekeningen", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), [], opties({ logo: "logo.png" }));
    for (const sectie of paginas(uit.html)) {
      const teksten = regels(sectie).map((r) => r.tekst);
      for (const tekst of [
          NL.cartouche.installateur,
          "Elektro Peeters bv",
          "Stationsstraat 12",
          "3500 Hasselt",
          "011 22 33 44",
          "info@elektropeeters.be",
          NL.cartouche.klant,
          "Familie Janssens",
          "Kerkstraat 5 bus 2",
          "3510 Kermt",
          NL.cartouche.werf,
          "Nieuwstraat 88",
          `${NL.cartouche.ean}: 541448820000000000`,
          `${NL.cartouche.datum}: 19/10/2026`,
          `${NL.cartouche.versie}: v1`,
        ]) expect(teksten.join(" ").replaceAll(" ", "")).toContain(tekst.replaceAll(" ", ""));
      expect(sectie).toContain('<img class="logo" src="logo.png"');
      const handtekeningen = sectie.split('class="vak handtekening"').slice(1);
      expect(handtekeningen.map((vak) => regels(vak).map((r) => r.tekst).join(" "))).toEqual([
        NL.cartouche.handtekeningInstallateur,
        NL.cartouche.handtekeningKeurder,
      ]);
    }
  });

  test("zonder logo staat er geen logo-afbeelding", () => {
    const doc = metGegevens(referentieAppartement());
    const { html } = printHtml(doc, analyseer(doc), [], opties());
    expect(html).not.toContain('class="logo"');
  });

  test("lange teksten: een klantnaam van 200 tekens blijft volledig leesbaar in zijn vak", () => {
    const doc = metGegevens(referentieAppartement());
    doc.meta.klant.naam = "Bouwonderneming ".repeat(13).slice(0, 200);
    expect(doc.meta.klant.naam).toHaveLength(200);
    for (const papier of ["A4", "A3"] as const) {
      const { html } = printHtml(doc, analyseer(doc), [], opties({ papier }));
      const vak = html.split('<div class="vak klant"')[1]!.split('<div class="vak werf"')[0]!;
      const klant = regels(vak).filter(r => r.klasse === "naam");
      expect(klant.map(r => r.tekst).join(" ")).toBe(doc.meta.klant.naam.trim());
      expect(klant.length).toBeGreaterThan(0);
      for (const r of klant) {
        expect(r.tekst.endsWith("…")).toBe(false);
        expect(tekstBreedte(r.tekst, r.grootte)).toBeLessThanOrEqual(r.breedte);
      }
    }
  });

  test("lange teksten: een motivatie van 2.000 tekens loopt over meerdere regels die elk passen", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    const motivatie = Array.from({ length: 600 }, (_, i) => `w${i % 10}${"x".repeat(i % 3)}`)
      .join(" ")
      .slice(0, 2000);
    expect(motivatie).toHaveLength(2000);
    doc.afwijkingen.push({
      regelId: "arei.kring.max-contactdozen",
      nodeId: analyse.kringen[0]!.puntIds[0]!,
      motivatie,
      door: "Jan Peeters",
      datum: "2026-10-02",
    });
    const { html } = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("bijlage") }));
    const regelsMotivatie = regels(html).filter((r) => r.klasse === "motivatie");
    expect(regelsMotivatie.length).toBeGreaterThan(1);
    for (const r of regelsMotivatie) expect(tekstBreedte(r.tekst, r.grootte)).toBeLessThanOrEqual(r.breedte);
    expect(regelsMotivatie.map((r) => r.tekst).join(" ")).toBe(`${NL.bijlage.motivatie}: ${motivatie}`);
  });

  test("lange teksten: een motivatie in hoofdletters W past met de voorzichtige breedte, ook in het echte lettertype", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    const motivatie = Array.from({ length: 40 }, (_, i) => "W".repeat(5 + (i % 30))).join(" ");
    doc.afwijkingen.push({
      regelId: "arei.kring.max-contactdozen",
      nodeId: analyse.kringen[0]!.puntIds[0]!,
      motivatie,
      door: "WWWWWWWWWW",
      datum: "2026-10-02",
    });
    // De breedste Latijnse letter in Noto Sans (het sans-serif van Gotenberg): "W" is 0,93 em.
    const W_EM = 0.93;
    for (const papier of ["A4", "A3"] as const) {
      const { html } = printHtml(doc, analyse, [], opties({ papier, onderdelen: alleenOnderdeel("bijlage") }));
      const bijlage = regels(html).filter((r) => ["motivatie", "door", "afwijking"].includes(r.klasse));
      const motivatieRegels = bijlage.filter((r) => r.klasse === "motivatie");
      expect(motivatieRegels.length).toBeGreaterThan(1);
      for (const r of bijlage) {
        expect(tekstBreedte(r.tekst, r.grootte) * BIJLAGE_BREEDTE_FACTOR).toBeLessThanOrEqual(r.breedte);
        expect(r.tekst.length * r.grootte * W_EM).toBeLessThanOrEqual(r.breedte);
      }
      expect(motivatieRegels.map((r) => r.tekst).join(" ")).toBe(`${NL.bijlage.motivatie}: ${motivatie}`);
    }
  });

  test.each(["nl", "fr", "en"] as const)("een onbegrensde klantnaam blijft volledig in metadata-vervolg (%s)", taal => {
    const doc = metGegevens(referentieAppartement());
    doc.meta.klant.naam = "Lange naam ".repeat(150);
    const { html } = printHtml(doc, analyseer(doc), [], opties({ taal, onderdelen: alleenOnderdeel("kringenlijst") }));
    const vervolg = regels(html).filter(r => r.klasse === "metadata").map(r => r.tekst).join(" ");
    expect(vervolg).toContain(doc.meta.klant.naam.trim());
    expect(regels(html).filter(r => r.klasse === "naam").map(r => r.tekst).join(" ")).toContain(TEKSTEN[taal].metadata.verwijzing);
    for (const sectie of paginas(html)) {
      const content = sectie.split('<div class="cartouche">')[0]!;
      if (!content.includes('class="bijlage"')) continue;
      const hoogte = cssMm(content, /class="bijlage" style="[^"]*height:([\d.]+)mm/);
      expect(regels(content).reduce((som, r) => som + r.grootte * 1.3 + (r.klasse === "kop" ? 2 : 0), 0)).toBeLessThanOrEqual(hoogte);
    }
  });

  test("metadata die hoger is dan een pagina blijft volledig op vervolgpaginas", () => {
    const doc = metSituatie(metGegevens(referentieWoning()));
    const lang = "Zeer lange tekst zonder einde ".repeat(20);
    doc.meta.klant.naam = lang;
    doc.meta.klant.adres!.straat = lang;
    doc.meta.werfadres.gemeente = lang;
    doc.meta.ean = "9".repeat(300);
    doc.situatie.paginas[0]!.titel = lang;
    const installateur: Partij = { ...INSTALLATEUR, naam: lang, email: "a".repeat(300), telefoon: "0".repeat(300) };
    for (const papier of ["A4", "A3"] as const) {
      const { html } = printHtml(
        doc,
        analyseer(doc),
        bevindingenVan(doc),
        opties({ papier, installateur, versieLabel: lang, datum: lang, afbeeldingen: { "raster-1": "p.png" }, logo: "l.png" }),
      );
      const vervolg = regels(html).filter(r => r.klasse === "metadata").map(r => r.tekst).join(" ");
      expect(vervolg.replaceAll(" ", "")).toContain(lang.replaceAll(" ", ""));
      expect(vervolg.replaceAll(" ", "")).toContain("9".repeat(300));
      expect(vervolg.replaceAll(" ", "")).toContain("a".repeat(300));
      expect(vervolg.replaceAll(" ", "")).toContain("0".repeat(300));
      for (const vak of html.matchAll(/class="vak [^"]+" style="[^"]*height:([\d.]+)mm/g)) expect(Number(vak[1])).toBeLessThanOrEqual(60);
    }
  });

  test("kringenlijst van 120 punten verdeelt alle rijen over pagina's met de kop herhaald", () => {
    const { doc } = installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => {
          for (let i = 0; i < 15; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(8));
        }),
      )
      .bouw();
    const analyse = analyseer(doc);
    expect(analyse.kringen.flatMap((k) => k.puntIds)).toHaveLength(120);
    const uit = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
    const secties = paginas(uit.html);
    expect(uit.paginas).toBeGreaterThan(1);
    let aantal = 0;
    for (const sectie of secties) {
      expect(sectie.match(/<div class="kopregel" /g)).toHaveLength(1);
      aantal += (sectie.match(/<div class="rij" /g) ?? []).length;
    }
    expect(aantal).toBe(120);
    expect(regels(secties[0]!).find((r) => r.klasse === "cel")?.tekst).toBe("A");
  });

  test("kringenlijst: een lange kabelnaam blijft volledig leesbaar", () => {
    const { doc: gebouwd } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    const doc = kloon(gebouwd);
    // Een zeer lang kabeltype: de leidingkolom kort af.
    const leiding = Object.values(doc.nodes).find((n) => n.type === "leiding")!;
    if (leiding.type === "leiding") leiding.kabeltype = "K".repeat(120);
    const analyse = analyseer(doc);
    const { html } = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
    const cellen = regels(html).filter((r) => r.klasse === "cel");
    const afgekort = cellen.filter((r) => r.tekst.endsWith("…"));
    expect(afgekort).toHaveLength(0);
    expect(cellen.map(r => r.tekst).join("")).toContain("K".repeat(120));
    for (const r of cellen) expect(tekstBreedte(r.tekst, r.grootte)).toBeLessThanOrEqual(r.breedte);
  });

  test("een document zonder kringen geeft minstens één pagina met Geen kringen", () => {
    const { doc } = installatie().bouw();
    const analyse = analyseer(doc);
    const alleen = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
    expect(paginas(alleen.html)).toHaveLength(1);
    expect(alleen.html).toContain(`>${NL.geenKringen}</div>`);
    const alles = printHtml(doc, analyse, bevindingenVan(doc), opties());
    expect(alles.paginas).toBeGreaterThanOrEqual(1);
    expect(alles.html).toContain(`>${NL.geenKringen}</div>`);
  });

  test("situatiepagina's zonder achtergrond of zonder afbeelding worden overgeslagen en in de bijlage vermeld", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    doc.situatie.paginas.push(
      { id: "pagina-2", titel: "Verdieping", plaatsingen: [] },
      {
        id: "pagina-3",
        titel: "Kelder",
        achtergrond: { origineelBestandId: "orig-3", rasterBestandId: "raster-3", breedte_px: 1000, hoogte_px: 1000 },
        plaatsingen: [],
      },
    );
    const uit = printHtml(doc, analyseer(doc), [], opties({ afbeeldingen: { "raster-1": "plan-1.png" } }));
    expect(uit.overgeslagen).toEqual(["Verdieping", "Kelder"]);
    const bijlage = paginas(uit.html).at(-1)!;
    const teksten = regels(bijlage).map((r) => r.tekst);
    expect(teksten).toEqual(expect.arrayContaining([`${NL.bijlage.overgeslagenPaginas} (2)`, "Verdieping", "Kelder"]));
    expect(uit.html.match(/<img class="plan"/g)).toHaveLength(1);
    expect(uit.html).toContain('<img class="plan" src="plan-1.png"');
  });

  test("zonder situatieschema wordt niets overgeslagen", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    doc.situatie.paginas.push({ id: "pagina-2", titel: "Verdieping", plaatsingen: [] });
    const uit = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("bijlage") }));
    expect(uit.overgeslagen).toEqual([]);
  });

  test("situatieschema: afbeelding en laag in één kader dat met behoud van verhouding in de bruikbare ruimte past", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    const uit = printHtml(
      doc,
      analyseer(doc),
      [],
      opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: { "raster-1": "plan.png" } }),
    );
    expect(paginas(uit.html)).toHaveLength(1);
    const m = /<div class="kader"[^>]*style="left:([\d.]+)mm;top:([\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm"[^>]*>/.exec(
      uit.html,
    )!;
    const [links, boven, breedte, hoogte] = m.slice(1).map(Number) as [number, number, number, number];
    const ruimte = bruikbaar(STANDAARD_PAPIER_A4);
    expect(breedte / hoogte).toBeCloseTo(3000 / 2000, 2);
    expect(breedte).toBeLessThanOrEqual(ruimte.breedte);
    const noticeTop = cssMm(uit.html, /class="controlebeperking" style="left:[\d.]+mm;top:([\d.]+)mm/);
    expect(boven + hoogte).toBeLessThan(noticeTop);
    expect(links).toBeGreaterThanOrEqual(10);
    expect(links + breedte).toBeLessThanOrEqual(10 + ruimte.breedte + 0.01);
    expect(boven).toBeGreaterThanOrEqual(16);
    expect(uit.html).toContain('<svg class="laag" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 2000"');
    // Symboolgrootte: de lange zijde van het raster / 60 = 50 px.
    expect(uit.html).toMatch(/<g data-node-id="[^"]+" transform="translate\(500 400\)"><rect x="-25" y="-25" width="50"/);
    expect(uit.html).toContain(">A1</text>");
  });

  test("situatieschema: naamloze nodes krijgen hun type als label", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    const bord = Object.values(doc.nodes).find((n) => n.type === "verdeelbord")!;
    doc.situatie.paginas[0]!.plaatsingen.push({ nodeId: bord.id, x: 10, y: 10, rotatie: 0 });
    const { html } = printHtml(
      doc,
      analyseer(doc),
      [],
      opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: { "raster-1": "plan.png" } }),
    );
    expect(html).toContain(`>${NL.types.verdeelbord}</text>`);
  });

  test("bijlage: een kop per ernst en per bevinding het bericht", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(12))))
      .bouw();
    const analyse = analyseer(doc);
    const bevindingen = bevindingenVan(doc);
    const fout = bevindingen.find((b) => b.ernst === "fout")!;
    const uit = printHtml(doc, analyse, bevindingen, opties({ onderdelen: alleenOnderdeel("bijlage") }));
    const teksten = regels(uit.html).map((r) => r.tekst);
    const aantal = (ernst: string) => bevindingen.filter((b) => b.ernst === ernst).length;
    expect(teksten).toContain(`${NL.bijlage.fouten} (${aantal("fout")})`);
    expect(teksten).toContain(NL.bijlage.dossier.titel);
    expect(teksten).not.toContain(`${NL.bijlage.info} (${aantal("info")})`);
    expect(teksten).not.toContain(expect.stringMatching(new RegExp(`^${NL.bijlage.waarschuwingen}`)));
    expect(teksten).toContain(`${NL.kolommen.kring} A — ${formatteerBericht(fout, "nl")}`);
    expect(teksten).toContain(`A1 — ${NL.bijlage.dossier.ongeplaatst}`);
    // Interne regel-id's horen niet in de pdf.
    expect(uit.html).not.toContain("arei.");
    expect(teksten.indexOf(NL.bijlage.dossier.titel)).toBeLessThan(
      teksten.indexOf(`${NL.bijlage.fouten} (${aantal("fout")})`),
    );
  });

  test("bijlage: een afgeweken bevinding is gemarkeerd en de afwijking staat erbij met regel, punt, door en datum", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    const nodeId = analyse.kringen[0]!.puntIds[0]!;
    doc.afwijkingen.push({
      regelId: "arei.situatie.niet-geplaatst",
      nodeId,
      motivatie: "Wordt later geplaatst door de klant.",
      door: "Jan Peeters",
      datum: "2026-10-02",
    });
    const bevindingen = controleer(doc, haalRegelset(doc.regelset));
    expect(bevindingen.some((b) => b.afgeweken)).toBe(true);
    const { html } = printHtml(doc, analyse, bevindingen, opties({ onderdelen: alleenOnderdeel("bijlage") }));
    const teksten = regels(html).map((r) => r.tekst);
    const afgeweken = bevindingen.find((b) => b.afgeweken)!;
    const bericht = `A1 — ${formatteerBericht(afgeweken, "nl")}`;
    expect(teksten).toContain(`${bericht} (${NL.bijlage.afgeweken})`);
    expect(html).not.toContain("arei.");
    expect(teksten).toEqual(
      expect.arrayContaining([
        `${NL.bijlage.afwijkingen} (1)`,
        bericht,
        `${NL.bijlage.motivatie}: Wordt later geplaatst door de klant.`,
        `${NL.bijlage.door}: Jan Peeters — ${NL.cartouche.datum}: 2/10/2026`,
      ]),
    );
  });

  test("bijlage: een afwijking zonder bevinding toont enkel het punt", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    doc.afwijkingen.push({
      regelId: "arei.kring.max-contactdozen",
      nodeId: analyse.kringen[0]!.puntIds[1]!,
      motivatie: "Geen bevinding meer voor deze afwijking.",
      door: "Jan",
      datum: "2026-10-02",
    });
    const { html } = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("bijlage") }));
    expect(regels(html).filter((r) => r.klasse === "afwijking").map((r) => r.tekst)).toEqual(["A2"]);
    expect(html).not.toContain("arei.");
  });

  test("bijlage: het AREI-artikel staat erbij als de regel er een heeft", () => {
    const { doc } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(12))))
      .bouw();
    const bevindingen = bevindingenVan(doc);
    const fout = bevindingen.find((b) => b.ernst === "fout")!;
    const regel = haalRegelset(doc.regelset).regels.find((r) => r.id === fout.regelId)!;
    const vorig = regel.artikel;
    (regel as { artikel: string }).artikel = "4.2.3";
    try {
      const { html } = printHtml(doc, analyseer(doc), bevindingen, opties({ onderdelen: alleenOnderdeel("bijlage") }));
      const teksten = regels(html).map((r) => r.tekst);
      expect(teksten).toContain(`${NL.kolommen.kring} A — ${formatteerBericht(fout, "nl")} (${NL.bijlage.artikel} 4.2.3)`);
      expect(teksten.filter((t) => t.includes(`${NL.bijlage.artikel} 4.2.3`))).toHaveLength(1);
    } finally {
      (regel as { artikel: string }).artikel = vorig;
    }
  });

  test("bijlage: een volle pagina loopt door op een nieuwe pagina", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    const nodeId = analyse.kringen[0]!.puntIds[0]!;
    for (let i = 0; i < 30; i++) {
      doc.afwijkingen.push({ regelId: `regel-${i}`, nodeId, motivatie: "x ".repeat(300), door: "Jan", datum: "2026-10-02" });
    }
    const uit = printHtml(doc, analyse, [], opties({ onderdelen: alleenOnderdeel("bijlage") }));
    expect(uit.paginas).toBeGreaterThan(1);
    const alle = regels(uit.html).filter((r) => r.klasse === "motivatie");
    expect(alle.filter((r) => r.tekst.startsWith(NL.bijlage.motivatie))).toHaveLength(30);
  });

  test("bijlage zonder inhoud vermeldt dat er geen bevindingen zijn", () => {
    const doc = metSituatie(metGegevens(referentieAppartement()));
    doc.meta.installatieContext = "nieuw";
    doc.meta.metingen = { aardingsweerstand_ohm: 30, isolatieweerstand_MOhm: 250 };
    doc.situatie.paginas[0]!.plaatsingen = Object.values(doc.nodes)
      .filter(n => (PLAATSBARE_TYPES as readonly string[]).includes(n.type))
      .map(n => ({ nodeId: n.id, x: 100, y: 100, rotatie: 0 }));
    const { html } = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("bijlage") }));
    expect(html).toContain(`>${NL.bijlage.geenBevindingen}</div>`);
  });

  test("escape: <script> als klantnaam en als motivatie verschijnt geëscaped", () => {
    const doc = metGegevens(referentieAppartement());
    const analyse = analyseer(doc);
    doc.meta.klant.naam = "<script>alert(1)</script>";
    doc.afwijkingen.push({
      regelId: "r<script>",
      nodeId: analyse.kringen[0]!.puntIds[0]!,
      motivatie: "<script>alert('motivatie')</script>",
      door: "<b>Jan</b>",
      datum: "2026-10-02",
    });
    const { html } = printHtml(
      doc,
      analyse,
      [],
      opties({ afbeeldingen: { x: 'a"b.png' }, logo: 'l"<o>.png', versieLabel: "<v1>" }),
    );
    expect(html).not.toMatch(/<script|<b>|<v1>|<o>/);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;script&gt;alert(&apos;motivatie&apos;)&lt;/script&gt;");
    expect(html).toContain('src="l&quot;&lt;o&gt;.png"');
  });

  test("alle onderdelen uitgeschakeld geeft een RangeError", () => {
    const doc = referentieAppartement();
    expect(() =>
      printHtml(
        doc,
        analyseer(doc),
        [],
        opties({ onderdelen: { eendraadschema: false, situatieschema: false, kringenlijst: false, bijlage: false } }),
      ),
    ).toThrow(RangeError);
  });

  test("alleen een situatieschema zonder bruikbare pagina's geeft toch één pagina: de bijlage", () => {
    const doc = metGegevens(referentieAppartement());
    doc.situatie.paginas.push({ id: "p", titel: "Verdieping", plaatsingen: [] });
    const uit = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("situatieschema") }));
    expect(paginas(uit.html)).toHaveLength(1);
    expect(uit.overgeslagen).toEqual(["Verdieping"]);
    expect(regels(uit.html).map((r) => r.tekst)).toContain("Verdieping");
  });
});

describe("printHtml: witruimte", () => {
  test("een regeleinde of tab in een cartouchevak of een tabelcel wordt één spatie", () => {
    const { doc: gebouwd } = installatie()
      .differentieel(300, (d) => d.verdeelbord((b) => b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(1))))
      .bouw();
    const doc = metGegevens(gebouwd);
    doc.meta.klant.naam = "Familie\nJanssens\t\tPeeters";
    const leiding = Object.values(doc.nodes).find((n) => n.type === "leiding")!;
    if (leiding.type === "leiding") leiding.kabeltype = "XVB\nXVB\tXVB";
    const { html } = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
    const teksten = regels(html).map((r) => r.tekst);
    expect(teksten.join(" ")).toContain("Familie Janssens Peeters");
    expect(teksten.join(" ")).toContain("XVB XVB XVB 3G2,5");
    for (const tekst of teksten) expect(tekst).not.toMatch(/[\n\t\r]/);
  });

  test("de tekstregels breken nooit af en lopen niet uit hun vak", () => {
    const doc = metGegevens(referentieAppartement());
    const { html } = printHtml(doc, analyseer(doc), [], opties());
    expect(html).toMatch(/\.t \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis;/);
  });
});

/** Een getal in mm uit de CSS van het document, via een regex met één groep. */
function cssMm(html: string, patroon: RegExp): number {
  const m = patroon.exec(html);
  expect(m, String(patroon)).not.toBeNull();
  return Number(m![1]);
}

describe("printHtml: geometrie uit de gegenereerde HTML en CSS", () => {
  const grootDoc = () =>
    installatie()
      .differentieel(300, (d) =>
        d.verdeelbord((b) => {
          for (let i = 0; i < 15; i++) b.kring((k) => k.automaat(16).leiding(2.5).contactdozen(8));
        }),
      )
      .bouw().doc;

  for (const formaat of ["A4", "A3"] as const) {
    test(`${formaat}: een volle kringenlijstpagina eindigt boven de cartouche`, () => {
      const doc = metGegevens(grootDoc());
      const { html } = printHtml(doc, analyseer(doc), [], opties({ papier: formaat, onderdelen: alleenOnderdeel("kringenlijst") }));
      const bovenrand = cssMm(html, /\.kringen \{ position: absolute; box-sizing: border-box; border-top: ([\d.]+)mm/);
      for (const sectie of paginas(html)) {
        const tabelBoven = cssMm(sectie, /<div class="kringen" style="left:[\d.]+mm;top:([\d.]+)mm/);
        const noticeTop = cssMm(sectie, /class="controlebeperking" style="left:[\d.]+mm;top:([\d.]+)mm/);
        const hoogtes = [...sectie.matchAll(/<div class="(?:kopregel|rij)" style="height:([\d.]+)mm"/g)].map(m => Number(m[1]));
        expect(hoogtes.length).toBeGreaterThan(1);
        expect(tabelBoven + bovenrand + hoogtes.reduce((a, b) => a + b, 0)).toBeLessThan(noticeTop);
      }
    });

    test(`${formaat}: de tekstregels van elk cartouchevak passen in de hoogte van het vak`, () => {
      const doc = metGegevens(referentieAppartement());
      const { html } = printHtml(doc, analyseer(doc), [], opties({ papier: formaat, logo: "logo.png" }));
      const regelhoogte = cssMm(html, /\.t \{[^}]*line-height: ([\d.]+);/);
      const rand = cssMm(html, /\.cartouche \.vak \{[^}]*border: ([\d.]+)mm solid/);
      const sectie = paginas(html)[0]!;
      const vakken = sectie.split('<div class="vak ').slice(1);
      expect(vakken).toHaveLength(6);
      for (const vak of vakken) {
        const hoogte = cssMm(vak, /height:([\d.]+)mm;padding/);
        const marge = cssMm(vak, /padding:([\d.]+)mm/);
        const binnen = hoogte - 2 * marge - 2 * rand;
        const tekst = regels(vak).reduce((som, r) => som + r.grootte * regelhoogte, 0);
        expect(tekst).toBeGreaterThan(0);
        expect(tekst).toBeLessThanOrEqual(binnen);
        const logo = /<img class="logo"[^>]*top:([\d.]+)mm;[^>]*height:([\d.]+)mm/.exec(vak);
        if (logo) expect(Number(logo[1]) + Number(logo[2])).toBeLessThanOrEqual(hoogte - marge - rand);
      }
    });

    test(`${formaat}: de regels van elke bijlagepagina passen in de bruikbare hoogte`, () => {
      const doc = metGegevens(referentieAppartement());
      const analyse = analyseer(doc);
      const nodeId = analyse.kringen[0]!.puntIds[0]!;
      for (let i = 0; i < 40; i++) {
        doc.afwijkingen.push({ regelId: `r${i}`, nodeId, motivatie: "woord ".repeat(120), door: "Jan", datum: "2026-10-02" });
      }
      const { html } = printHtml(doc, analyse, bevindingenVan(doc), opties({ papier: formaat, onderdelen: alleenOnderdeel("bijlage") }));
      const regelhoogte = cssMm(html, /\.t \{[^}]*line-height: ([\d.]+);/);
      const kopMarge = cssMm(html, /\.bijlage \.kop \{ margin-top: ([\d.]+)mm; \}/);
      const secties = paginas(html);
      expect(secties.length).toBeGreaterThan(1);
      for (const sectie of secties) {
        const hoogte = cssMm(sectie, /<div class="bijlage" style="[^"]*height:([\d.]+)mm"/);
        const inhoud = sectie.slice(0, sectie.indexOf('<div class="cartouche">'));
        // Een rij van de tabel met differentieeltests telt één keer, met haar opgegeven hoogte.
        const meetrij = /<div class="meetrij[^"]*"[^>]*style="height:([\d.]+)mm">(?:<div style="width:[\d.]+mm">(?:<div class="t[^"]*" style="[^"]*">[^<]*<\/div>)*<\/div>)*<\/div>/g;
        const rijen = [...inhoud.matchAll(meetrij)].reduce((s, m) => s + Number(m[1]), 0);
        const som = rijen + regels(inhoud.replace(meetrij, "")).reduce((s, r) => s + r.grootte * regelhoogte + (r.klasse === "kop" ? kopMarge : 0), 0);
        expect(som).toBeLessThanOrEqual(hoogte);
      }
    });
  }
});

describe("overgeslagenPaginas", () => {
  test("geeft de titels van pagina's zonder achtergrond of zonder bestand", () => {
    const doc = metSituatie(referentieAppartement());
    doc.situatie.paginas.push({ id: "p2", titel: "Verdieping", plaatsingen: [] });
    expect(overgeslagenPaginas(doc, { "raster-1": "plan.png" })).toEqual(["Verdieping"]);
    expect(overgeslagenPaginas(doc, {})).toEqual(["Gelijkvloers", "Verdieping"]);
    expect(overgeslagenPaginas(doc, { constructor: "x" } as Record<string, string>)).toEqual(["Gelijkvloers", "Verdieping"]);
  });
});

describe("cartouche", () => {
  test("een lang handtekeninglabel blijft volledig op meerdere regels", () => {
    const doc = metGegevens(referentieAppartement());
    const teksten = {
      ...NL,
      cartouche: { ...NL.cartouche, handtekeningKeurder: "Handtekening van de erkende keurder van het organisme" },
    };
    const html = cartouche({
      papier: STANDAARD_PAPIER_A4,
      teksten,
      meta: doc.meta,
      voeding: doc.voeding,
      installateur: INSTALLATEUR,
      logo: undefined,
      titel: "Bijlage",
      taal: "nl",
      datum: "2026-10-19",
      versieLabel: "v1",
      nummer: 1,
      totaal: 1,
    });
    const keurder = regels(html.split('class="vak handtekening"')[2]!);
    expect(keurder.map(r => r.tekst).join("").replaceAll(" ", "")).toBe(teksten.cartouche.handtekeningKeurder.replaceAll(" ", ""));
    for (const r of keurder) expect(tekstBreedte(r.tekst, r.grootte)).toBeLessThanOrEqual(r.breedte);
  });
});

describe("talen", () => {
  const talen = ["nl", "fr", "en"] as const;

  test("de cartouchedatum staat per taal in de locale van de taal (geen ISO meer)", () => {
    const doc = metGegevens(referentieAppartement());
    const verwacht = { nl: "19/10/2026", fr: "19/10/2026", en: "19/10/2026" } as const;
    for (const taal of talen) {
      // Dezelfde datum, vast in UTC, zoals de cartouche haar opmaakt.
      const formaat = new Intl.DateTimeFormat(LOCALES[taal], { day: "numeric", month: "2-digit", year: "numeric", timeZone: "UTC" });
      expect(formaat.format(new Date(Date.UTC(2026, 9, 19)))).toBe(verwacht[taal]);
      const uit = printHtml(doc, analyseer(doc), [], opties({ taal }));
      const teksten = regels(paginas(uit.html)[0]!).map((r) => r.tekst);
      expect(teksten).toContain(`${TEKSTEN[taal].cartouche.datum}: ${verwacht[taal]}`);
      expect(uit.html).not.toContain("2026-10-19");
    }
  });

  test("een dag met één cijfer volgt de notatie van de locale", () => {
    for (const taal of talen) expect(formatteerDatum("2026-03-05", taal)).toBe("5/03/2026");
  });

  test("de datum van een afwijking in de bijlage volgt de taal, niet ISO", () => {
    for (const taal of talen) {
      const doc = metGegevens(referentieAppartement());
      const analyse = analyseer(doc);
      doc.afwijkingen.push({
        regelId: "arei.situatie.niet-geplaatst",
        nodeId: analyse.kringen[0]!.puntIds[0]!,
        motivatie: "x",
        door: "Jan",
        datum: "2026-03-05",
      });
      const bevindingen = controleer(doc, haalRegelset(doc.regelset));
      const { html } = printHtml(doc, analyse, bevindingen, opties({ taal, onderdelen: alleenOnderdeel("bijlage") }));
      const t = TEKSTEN[taal];
      expect(regels(html).map((r) => r.tekst)).toContain(`${t.bijlage.door}: Jan — ${t.cartouche.datum}: 5/03/2026`);
      expect(html).not.toContain("2026-03-05");
    }
  });

  test("een onmogelijke datum blijft zoals ze is", () => {
    expect(formatteerDatum("2026-02-30", "fr")).toBe("2026-02-30");
  });

  test("een datum die geen ISO-datum is, blijft zoals ze is", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), [], opties({ taal: "fr", datum: "vandaag" }));
    expect(regels(paginas(uit.html)[0]!).map((r) => r.tekst)).toContain(`${TEKSTEN.fr.cartouche.datum}: vandaag`);
  });

  for (const taal of ["fr", "en"] as const) {
    test(`taal ${taal}: paginatitels, kolommen en cartouche komen uit TEKSTEN.${taal}, niet uit het Nederlands`, () => {
      const doc = metGegevens(referentieAppartement());
      const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ taal }));
      const t = TEKSTEN[taal];
      expect(uit.html).toContain(`<html lang="${taal}">`);
      const teksten = regels(uit.html).map((r) => r.tekst);
      expect(teksten).toEqual(
        expect.arrayContaining([
          t.paginatitels.eendraadschema,
          t.paginatitels.kringenlijst,
          t.paginatitels.bijlage,
          t.kolommen.beveiliging,
          t.cartouche.klant,
          t.cartouche.werf,
        ]),
      );
      expect(teksten).not.toContain(NL.paginatitels.eendraadschema);
      expect(teksten).not.toContain(NL.paginatitels.kringenlijst);
      expect(teksten).not.toContain(NL.cartouche.klant);
    });

    test(`taal ${taal}: de bevindingen in de bijlage zijn in het ${taal}`, () => {
      const doc = metGegevens(referentieAppartement());
      const bevindingen = bevindingenVan(doc);
      expect(bevindingen.length).toBeGreaterThan(0);
      const uit = printHtml(doc, analyseer(doc), bevindingen, opties({ taal, onderdelen: alleenOnderdeel("bijlage") }));
      const bericht = formatteerBericht(bevindingen[0]!, taal);
      expect(bericht).not.toBe(formatteerBericht(bevindingen[0]!, "nl"));
      const bijlage = regels(uit.html).map((r) => r.tekst).join(" ");
      expect(bijlage).toContain(bericht.split(" ").slice(0, 3).join(" "));
    });

    test(`snapshot: referentieAppartement op A4 in het ${taal}`, async () => {
      const doc = metGegevens(referentieAppartement());
      const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ taal }));
      await expect(nummerNodeIds(uit.html)).toMatchFileSnapshot(`__snapshots__/print-appartement-a4-${taal}.html`);
    });
  }

  test("vertaalde kolomkoppen, typen en ruimtes worden volledig leesbaar afgebroken op A4", () => {
    const rijBreedte = bruikbaar({ ...STANDAARD_PAPIER_A4, formaat: "A4" }).breedte;
    const kolomBreedte = (aandeel: number) => rijBreedte * aandeel - 2 * 1 - 0.25;
    for (const taal of talen) {
      const t = TEKSTEN[taal];
      const koppen: [string, number][] = [
        [t.kolommen.kring, .07], [t.kolommen.kringOmschrijving, .13], [t.kolommen.punt, .06], [t.kolommen.puntOmschrijving, .13], [t.kolommen.type, .14], [t.kolommen.ruimte, .10],
        [t.kolommen.beveiliging, .12], [t.kolommen.differentieel, .13], [t.kolommen.leiding, .12],
      ];
      const typen = Object.values(t.types).map((x): [string, number] => [x, .14]);
      const toestellen = Object.values(t.toestelsoorten).map((x): [string, number] => [`${t.types.toestel} (${x})`, .14]);
      const ruimtes = Object.values(t.ruimtes).map((x): [string, number] => [x, .10]);
      for (const [tekst, aandeel] of [...koppen, ...typen, ...toestellen, ...ruimtes]) {
        const lijnen = breekRegels(tekst, kolomBreedte(aandeel), 3, 1.35);
        expect(lijnen.join("").replaceAll(" ", "")).toBe(tekst.replaceAll(" ", ""));
        for (const lijn of lijnen) expect(tekstBreedte(lijn, 3) * 1.35, `${taal} ${lijn}`).toBeLessThanOrEqual(kolomBreedte(aandeel));
      }
    }
  });

  test("het Nederlands blijft de standaard: lang nl en Nederlandse titels", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), [], opties({ taal: "nl" }));
    expect(uit.html).toContain('<html lang="nl">');
    expect(regels(uit.html).map((r) => r.tekst)).toContain(NL.paginatitels.eendraadschema);
  });
});

describe("afkorten", () => {
  test("een tekst die past blijft ongewijzigd", () => {
    expect(afkorten("Kring A", 100, 2.5)).toBe("Kring A");
  });

  test("een te lange tekst eindigt op … en past", () => {
    const uit = afkorten("Bouwonderneming De Vries en Zonen", 20, 2.5);
    expect(uit.endsWith("…")).toBe(true);
    expect(tekstBreedte(uit, 2.5)).toBeLessThanOrEqual(20);
    expect(uit.length).toBe(Math.floor(20 / tekstBreedte("x", 2.5)));
  });

  test("geen spatie voor het weglatingsteken", () => {
    // 6 tekens passen: "abcd" + "…" na het wegknippen van de spatie.
    expect(afkorten("abcd efgh", tekstBreedte("x", 2.5) * 6, 2.5)).toBe("abcd…");
  });

  test("knipt geen surrogaatpaar doormidden", () => {
    const uit = afkorten("ab😀cdef", tekstBreedte("x", 2.5) * 4, 2.5);
    expect(uit).toBe("ab…");
  });

  test("een vak waar geen teken in past geeft een lege tekst", () => {
    expect(afkorten("abc", 1, 2.5)).toBe("");
    expect(afkorten("abc", tekstBreedte("x", 2.5), 2.5)).toBe("…");
  });
});

describe("breekRegels", () => {
  test("breekt op woorden en elke regel past", () => {
    const tekst = "De leiding loopt door de kruipkelder en is daar mechanisch beschermd.";
    const uit = breekRegels(tekst, 30, 2.5);
    expect(uit.length).toBeGreaterThan(1);
    for (const r of uit) expect(tekstBreedte(r, 2.5)).toBeLessThanOrEqual(30);
    expect(uit.join(" ")).toBe(tekst);
  });

  test("een woord langer dan de regel wordt hard gebroken", () => {
    const uit = breekRegels("x".repeat(50), 15, 2.5);
    expect(uit).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(10), "x".repeat(10), "x".repeat(10)]);
  });

  test("witruimte wordt samengevoegd, een regeleinde blijft een regeleinde", () => {
    expect(breekRegels("a   b\nc", 100, 2.5)).toEqual(["a b", "c"]);
  });

  test("breekt nooit op een vaste spatie (U+00A0) of smalle vaste spatie (U+202F)", () => {
    // Elk van de twee koppelt "admis" en ":" (Frans) of 12 en 345 (duizendtal): ze blijven bij elkaar.
    for (const vast of ["\u00a0", "\u202f"]) {
      const tekst = `Maximum admis${vast}: 8 prises`;
      // Zo smal dat alleen "Maximum" en "admis:" samen op een regel kunnen: op de vaste spatie breken kan dus niet.
      const uit = breekRegels(tekst, 18, 2.5);
      expect(uit.join(" ")).toBe(tekst);
      expect(uit.some((r) => r.startsWith(":") || r.endsWith("admis"))).toBe(false);
      expect(breekRegels(`een${vast}twee`, 100, 2.5)).toEqual([`een${vast}twee`]);
    }
  });

  test("een lege tekst geeft geen regels", () => {
    expect(breekRegels("   ", 100, 2.5)).toEqual([]);
  });

  test("een regel waar geen teken in past is een RangeError", () => {
    expect(() => breekRegels("abc", 1, 2.5)).toThrow(RangeError);
  });

  test("met koppeltekens breekt een te lang woord na een koppelteken, niet erin", () => {
    expect(breekRegels("Sint-Truidersteenweg-Noord 1088", tekstBreedte("x", 2.5) * 17, 2.5, 1, { koppeltekens: true }))
      .toEqual(["Sint-", "Truidersteenweg-", "Noord 1088"]);
    // Zonder de optie blijft het oude gedrag: hard breken op de regelbreedte.
    expect(breekRegels("Sint-Truidersteenweg-Noord", tekstBreedte("x", 2.5) * 17, 2.5)).toEqual(["Sint-Truidersteen", "weg-Noord"]);
  });

  test("met smalle cijfers tellen cijfers zonder de factor: een EAN blijft heel", () => {
    const breedte = tekstBreedte("x", 2.5) * 18;
    expect(breekRegels("541448820000000000", breedte, 2.5, 1.35)).toHaveLength(2);
    expect(breekRegels("541448820000000000", breedte, 2.5, 1.35, { smalleCijfers: true })).toEqual(["541448820000000000"]);
    // Letters houden de voorzichtige factor.
    expect(breekRegels("x".repeat(18), breedte, 2.5, 1.35, { smalleCijfers: true })).toHaveLength(2);
  });

  test("een factor maakt de geschatte tekenbreedte groter: minder tekens per regel", () => {
    expect(breekRegels("x".repeat(20), 15, 2.5, 2)).toEqual(["x".repeat(5), "x".repeat(5), "x".repeat(5), "x".repeat(5)]);
    expect(breekRegels("x".repeat(20), 15, 2.5, 1)).toEqual(breekRegels("x".repeat(20), 15, 2.5));
  });
});

describe("printHtml: watermerk (staging)", () => {
  const WATERMERK = { titel: "STAGING", ondertitel: "Geen geldig document" };

  test("met watermerk heeft elke pagina precies één watermerk met titel en ondertitel", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ watermerk: WATERMERK }));
    const lijst = paginas(uit.html);
    expect(lijst.length).toBe(uit.paginas);
    expect(lijst.length).toBeGreaterThan(1);
    for (const pagina of lijst) {
      expect(pagina.match(/class="watermerk"/g)).toHaveLength(1);
      expect(pagina).toContain('<div class="watermerk-titel">STAGING</div>');
      expect(pagina).toContain('<div class="watermerk-ondertitel">Geen geldig document</div>');
    }
  });

  test("het watermerk is afdrukbaar en verschuift de opmaak niet: absoluut, zonder pointer-events, halfdoorzichtig, geroteerd", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), [], opties({ watermerk: WATERMERK }));
    const css = uit.html.match(/<style>([\s\S]*?)<\/style>/)![1]!;
    const regel = css.split("\n").filter((r) => r.includes(".watermerk"));
    expect(regel.length).toBeGreaterThan(0);
    const alles = regel.join("\n");
    expect(alles).toMatch(/position:\s*absolute/);
    expect(alles).toMatch(/pointer-events:\s*none/);
    expect(alles).toMatch(/opacity:\s*0?\.\d+/);
    expect(alles).toMatch(/rotate\(-\d+deg\)/);
    expect(css).not.toMatch(/https?:|@import|url\(/);
  });

  test("de teksten van het watermerk worden geëscaped", () => {
    const doc = metGegevens(referentieAppartement());
    const uit = printHtml(doc, analyseer(doc), [], opties({ watermerk: { titel: "A<B", ondertitel: "x & y" } }));
    expect(uit.html).toContain("A&lt;B");
    expect(uit.html).toContain("x &amp; y");
  });

  test("zonder watermerk komt er geen watermerk-element of -stijl in de HTML, en het aantal pagina's blijft gelijk", () => {
    const doc = metGegevens(referentieAppartement());
    const zonder = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties());
    const met = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ watermerk: WATERMERK }));
    expect(zonder.html).not.toContain("watermerk");
    expect(met.paginas).toBe(zonder.paginas);
  });

  test("het watermerk wijzigt de rest van de pagina's niet: zonder watermerk-markup is de HTML gelijk aan die zonder", () => {
    const doc = metGegevens(referentieAppartement());
    const zonder = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties());
    const met = printHtml(doc, analyseer(doc), bevindingenVan(doc), opties({ watermerk: WATERMERK }));
    const gestript = met.html
      .replace(/<div class="watermerk">.*?<\/div><\/div>/g, "")
      .split("\n")
      .filter((r) => !r.includes(".watermerk"))
      .join("\n");
    expect(gestript).toBe(zonder.html);
  });
});


test.each(["A4", "A3"] as const)("situatie heeft eigen staand papier en gekalibreerde grootte (%s)", papier => {
  const doc = metSituatie(referentieWoning());
  const pagina = doc.situatie.paginas[0]!;
  pagina.afdruk = { papier, orientatie: "staand", schaalmodus: "gekalibreerd", schaalNoemer: 100 };
  pagina.achtergrond!.schaal = { mmPerPx: 10 };
  const r = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: { "raster-1": "plan.png" } }));
  expect(r.html).toContain(papier === "A4" ? "size:210mm 297mm" : "size:297mm 420mm");
  expect(r.html).toContain('data-plan-breedte-mm="300"');
  expect(r.html).toContain('data-schaalmodus="gekalibreerd"');
});

test("referentiebladen worden bewust overgeslagen zonder ontbrekende-planmelding", () => {
  const doc = metSituatie(referentieWoning());
  doc.situatie.paginas[0]!.referentie = true;
  const r = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: {} }));
  expect(r.overgeslagen).toEqual([]);
  expect(r.html).not.toContain("Situatieschema — Gelijkvloers");
});

test("grote schema's worden gepagineerd zonder technische tekst te verkleinen of labels te verliezen", () => {
  const doc = installatie().verdeelbord(b => b.kring(k => { let l = k.automaat(16).leiding(2.5); for (let i = 0; i < 60; i++) l = l.contactdozen(1); return l; })).bouw().doc;
  const r = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("eendraadschema") }));
  expect(r.paginas).toBeGreaterThan(1);
  expect(r.html).not.toMatch(/scale\(0\./);
  const labels = [...r.html.matchAll(/<text class="tekst-punt"[^>]*>(A\d+)<\/text>/g)].map(m => m[1]).sort();
  expect(labels).toEqual(Array.from({ length: 60 }, (_, i) => `A${i + 1}`).sort());
});

test("kringenlijst herhaalt de kringgroep op elk vervolgblad", () => {
 const doc = installatie().verdeelbord(b => b.kring(k => k.automaat(16).leiding(2.5).contactdozen(120))).bouw().doc;
 const r = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("kringenlijst") }));
 expect(r.paginas).toBeGreaterThan(1);
 for (const blad of paginas(r.html)) expect(blad).toContain('class="groepskop"');
});

test("kleine situatiesymbolen houden afdruklabels van minstens 2,5 mm", () => {
 const doc = metSituatie(referentieWoning());
 doc.situatie.paginas[0]!.labelSchaal = .25;
 const r = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("situatieschema"), afbeeldingen: { "raster-1": "p.png" } }));
 const breedte = Number(r.html.match(/data-plan-breedte-mm="([\d.]+)"/)![1]);
 const laag = r.html.match(/<svg class="laag"[\s\S]*?<\/svg>/)![0];
 const fonts = [...laag.matchAll(/font-size="([\d.]+)" text-anchor="start"/g)].map(m => Number(m[1]));
 expect(fonts.length).toBeGreaterThan(0);
 for (const font of fonts) expect(font * breedte / 3000).toBeGreaterThanOrEqual(2.49);
});

test("zes seriestopcontacten met hoofd- en bijkomende differentieel behouden alle labels op één leesbaar blad", () => {
 const doc = installatie().differentieel(300, d => d.verdeelbord(b => b.differentieel(30, bd => bd.kring(k => k.automaat(20).leiding(2.5).contactdozen(6))))).bouw().doc;
 const uit = printHtml(doc, analyseer(doc), [], opties({ onderdelen: alleenOnderdeel("eendraadschema"), installateur: { naam: "Elektro E2E" }, logo: "logo.png" }));
 expect(paginas(uit.html)).toHaveLength(1);
 expect(uit.html).not.toMatch(/scale\(0\./);
 const labels = [...uit.html.matchAll(/<text class="tekst-punt"[^>]*>(A\d+)<\/text>/g)].map(m => m[1]).sort();
 expect(labels).toEqual(["A1", "A2", "A3", "A4", "A5", "A6"]);
 const secties = paginas(uit.html);
 for (const sectie of secties) expect(sectie).toContain("2 × 230 V ~");
});

describe("cartouche: lange waarden blijven binnen hun cel", () => {
  /** Elk cartouchevak met zijn afmetingen in mm en zijn tekstregels. */
  const vakken = (html: string) => [...html.matchAll(/<div class="vak ([^"]+)" style="left:[\d.]+mm;top:[\d.]+mm;width:([\d.]+)mm;height:([\d.]+)mm;padding:([\d.]+)mm">(.*?)(?=<div class="vak |<\/div><\/div>(?:<div class="controlebeperking|<\/section>|<div class="watermerk))/g)]
    .map(m => ({ soort: m[1]!, breedte: Number(m[2]), hoogte: Number(m[3]), marge: Number(m[4]), regels: regels(m[5]!) }));
  const doc = () => {
    const d = metSituatie(metGegevens(referentieAppartement()));
    d.meta.klant = {
      naam: "Familie Vandenbroucke-Janssens",
      adres: { straat: "Burgemeester Van Gansbergelaan", nummer: "128", bus: "12", postcode: "9220", gemeente: "Hamme-Oost-Vlaanderen", land: "BE" },
    };
    d.meta.werfadres = { straat: "Sint-Truidersteenweg-Noord", nummer: "1088", postcode: "3500", gemeente: "Hasselt", land: "BE" };
    d.meta.ean = "541448820000000000";
    d.situatie.paginas[0]!.afdruk = { papier: "A4", orientatie: "staand", schaalmodus: "passend" };
    return d;
  };

  test.each(["A4", "A3"] as const)("een EAN van 18 cijfers en een lang adres op %s, ook op een staand situatieblad", papier => {
    const d = doc();
    const { html } = printHtml(d, analyseer(d), [], opties({ papier, onderdelen: { eendraadschema: true, situatieschema: true, kringenlijst: false, bijlage: true }, afbeeldingen: { "raster-1": "plan.png" } }));
    const alle = vakken(html);
    expect(alle.filter(v => v.soort === "werf").length).toBeGreaterThanOrEqual(3);
    // De cartouche breekt met een voorzichtige breedte: letters × 1,35, cijfers op de gewone schatting (0,6 em;
    // het breedste cijfer in Noto Sans en Arial is 0,572 em). Een regel valt nooit buiten de binnenrand.
    const voorzichtig = (tekst: string, grootte: number) =>
      [...tekst].reduce((som, teken) => som + tekstBreedte(teken, grootte) * (/[0-9]/.test(teken) ? 1 : 1.35), 0);
    for (const vak of alle) {
      const binnen = vak.breedte - 2 * vak.marge - 2 * 0.25;
      let inhoud = 0;
      for (const r of vak.regels) {
        expect(r.breedte, `${vak.soort}: ${r.tekst}`).toBeLessThanOrEqual(binnen + 1e-9);
        expect(voorzichtig(r.tekst, r.grootte), `${vak.soort}: ${r.tekst}`).toBeLessThanOrEqual(r.breedte + 1e-9);
        expect(r.tekst.endsWith("…"), r.tekst).toBe(false);
        inhoud += r.grootte * 1.3;
      }
      // Een pixel speling (0,53 mm bij 50 % in het afdrukvoorbeeld): de laatste regel wordt nooit afgesneden.
      expect(inhoud + 2 * vak.marge + 2 * 0.25 + 0.53, vak.soort).toBeLessThanOrEqual(vak.hoogte);
    }
    for (const werf of alle.filter(v => v.soort === "werf")) {
      // Het EAN-nummer staat in zijn geheel op één regel.
      expect(werf.regels.some(r => r.tekst.split(" ").includes("541448820000000000")), JSON.stringify(werf.regels.map(r => r.tekst))).toBe(true);
    }
    // Woorden breken op een spatie of na een koppelteken: een deel dat op een regel past, blijft heel.
    for (const vak of alle.filter(v => v.soort === "klant" || v.soort === "werf")) {
      const tekst = vak.regels.map(r => r.tekst);
      const delen = vak.soort === "klant"
        ? ["Familie", "Vandenbroucke-", "Janssens", "Burgemeester", "Gansbergelaan", "Hamme-", "Oost-", "Vlaanderen"]
        : ["Sint-", "Truidersteenweg-", "Noord", "Hasselt"];
      for (const deel of delen) {
        const grootte = vak.regels[1]!.grootte;
        if (voorzichtig(deel, grootte) > vak.regels[1]!.breedte) continue;
        expect(tekst.some(r => r.includes(deel)), `${vak.soort}: ${deel} in ${JSON.stringify(tekst)}`).toBe(true);
      }
    }
  });
});

test.each(["A4", "A3"] as const)("een klein schema (voeding, 1 differentieel, 3 kringen) met gewone gegevens: één eendraadschemablad zonder vervolgverwijzingen op %s", papier => {
  const doc = metGegevens(installatie().verdeelbord(b => b.differentieel(30, d => {
    for (let i = 0; i < 3; i++) d.kring(k => k.automaat(16).leiding(2.5).contactdozen(1).contactdozen(1).contactdozen(1).contactdozen(1));
  })).bouw().doc);
  const { html } = printHtml(doc, analyseer(doc), [], opties({ papier, onderdelen: alleenOnderdeel("eendraadschema") }));
  const bladen = paginas(html);
  expect(bladen).toHaveLength(1);
  expect(bladen[0]).toContain("2 × 230 V ~");
  expect(bladen[0]).not.toMatch(/>p\. \d/);
});
