import { analyseer } from "@elentrik/arei";
import { wijzigEigenschappen, wijzigProject, type InstallatieDocument } from "@elentrik/model";
import { describe, expect, test } from "vitest";
import { printHtml, type PrintOpties } from "../src/index";
import { compactSchemaFixture } from "./fixtures/compact-schema";

const opties: PrintOpties = {
  papier: "A4",
  onderdelen: { eendraadschema: false, situatieschema: false, kringenlijst: true, bijlage: true },
  versieLabel: "Concept",
  datum: "2026-11-06",
  taal: "nl",
  installateur: { naam: "Test" },
  afbeeldingen: {},
};

function differentiëlen(doc: InstallatieDocument) {
  return Object.values(doc.nodes).filter(n => n.type === "differentieel");
}

/** Metingen ingevuld; differentieel A getest (ok, 18,5 ms), F niet ok zonder tijd, L niet getest, de naamloze leeg. */
function metMetingen(): InstallatieDocument {
  let doc = compactSchemaFixture();
  doc = wijzigProject(doc, { metingen: { datum: "2026-11-05", aardingsweerstand_ohm: 28.5, isolatieweerstand_MOhm: 250, meettoestel: "Fluke 1664 FC" } }).doc;
  const per = Object.fromEntries(differentiëlen(doc).map(n => [n.type === "differentieel" ? n.referentie ?? "" : "", n.id]));
  doc = wijzigEigenschappen(doc, per.A!, { testResultaat: "ok", uitschakeltijd_ms: 18.5 }).doc;
  doc = wijzigEigenschappen(doc, per.F!, { testResultaat: "niet_ok" }).doc;
  doc = wijzigEigenschappen(doc, per.L!, { testResultaat: "niet_getest" }).doc;
  return doc;
}

/** De tekst van de bijlage (zonder cartouches), op één regel. */
function bijlageVan(html: string): string {
  return html.split('<section class="pagina">').filter(p => p.includes('<div class="bijlage"'))
    .map(p => tekstVan(p.slice(0, p.indexOf('<div class="cartouche">')))).join(" ").replace(/\n/g, " ");
}

/** De cartouches, elk tot het einde van haar pagina. */
function cartouchesVan(html: string): string[] {
  return html.split('<div class="cartouche">').slice(1).map(deel => tekstVan(deel.slice(0, deel.indexOf("</section>"))).replace(/\n/g, " "));
}

function tekstVan(html: string): string {
  return html.replace(/<[^>]+>/g, "\n").replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").split("\n").map(r => r.trim()).filter(Boolean).join("\n");
}

const VERWACHT = {
  nl: {
    titel: "Metingen", datum: "Meetdatum: 5/11/2026", aarding: "Aardingsweerstand: 28,5 Ω", isolatie: "Isolatieweerstand: 250 MΩ",
    toestel: "Meettoestel: Fluke 1664 FC", leeg: "niet ingevuld", zin: "Geregistreerde meetwaarden; geen beoordeling door Elentrik.",
    tabel: ["Differentieeltests", "Referentie", "Gevoeligheid", "Resultaat", "Tijd"], ok: "OK", nietOk: "Niet OK", nietGetest: "Niet getest", tijd: "18,5 ms",
  },
  fr: {
    titel: "Mesures", datum: "Date de mesure: 5/11/2026", aarding: "Résistance de dispersion: 28,5 Ω", isolatie: "Résistance d’isolement: 250 MΩ",
    toestel: "Appareil de mesure: Fluke 1664 FC", leeg: "non renseigné", zin: "Valeurs mesurées enregistrées ; aucune évaluation par Elentrik.",
    tabel: ["Tests des différentiels", "Référence", "Sensibilité", "Résultat", "Temps"], ok: "OK", nietOk: "Pas OK", nietGetest: "Non testé", tijd: "18,5 ms",
  },
  en: {
    titel: "Measurements", datum: "Measurement date: 5/11/2026", aarding: "Earth resistance: 28.5 Ω", isolatie: "Insulation resistance: 250 MΩ",
    toestel: "Measuring instrument: Fluke 1664 FC", leeg: "not entered", zin: "Recorded measured values; not assessed by Elentrik.",
    tabel: ["RCD tests", "Reference", "Sensitivity", "Result", "Time"], ok: "OK", nietOk: "Not OK", nietGetest: "Not tested", tijd: "18.5 ms",
  },
} as const;

describe.each(["nl", "fr", "en"] as const)("metingen in de pdf (%s)", (taal) => {
  const v = VERWACHT[taal];

  test("de bijlage toont de ingevulde metingen met de vaste zin; de cartouche blijft ongewijzigd", () => {
    const doc = metMetingen();
    const { html } = printHtml(doc, analyseer(doc), [], { ...opties, taal });
    const bijlage = bijlageVan(html);
    for (const regel of [v.titel, v.datum, v.aarding, v.isolatie, v.toestel, v.zin]) expect(bijlage).toContain(regel);
    expect(bijlage).not.toMatch(/\b0 Ω/);
    // De metingen nemen geen ruimte van de tekeningen: de cartouche van elke pagina kent ze niet.
    const zonder = compactSchemaFixture();
    expect(cartouchesVan(html)).toEqual(cartouchesVan(printHtml(zonder, analyseer(zonder), [], { ...opties, taal }).html));
  });

  test("de bijlage heeft een tabel met de differentieeltests: referentie, gevoeligheid, resultaat en tijd", () => {
    const doc = metMetingen();
    const { html } = printHtml(doc, analyseer(doc), [], { ...opties, taal });
    const tabel = html.slice(html.lastIndexOf("<div", html.indexOf('data-tabel="differentieeltests"')));
    const rijen = [...tabel.matchAll(/<div class="meetrij[^"]*"[^>]*>(.*?)<\/div><\/div>(?=<div class="meetrij|<div class="t|<\/div>)/g)].map(m => tekstVan(m[0]).split("\n"));
    expect(tekstVan(html)).toContain(v.tabel[0]);
    expect(rijen[0]).toEqual(v.tabel.slice(1));
    // Een rij per differentieel, in de volgorde van het schema.
    expect(rijen.slice(1)).toEqual([
      ["A", "300 mA", v.ok, v.tijd],
      ["—", "30 mA", v.leeg, v.leeg],
      ["F", "30 mA", v.nietOk, v.leeg],
      ["L", "30 mA", v.nietGetest, v.leeg],
    ]);
  });

  test("lege of gedeeltelijke metingen tonen 'niet ingevuld', nooit 0 of een lege waarde", () => {
    let doc = compactSchemaFixture();
    doc = wijzigProject(doc, { metingen: { isolatieweerstand_MOhm: 0 } }).doc;
    const { html } = printHtml(doc, analyseer(doc), [], { ...opties, taal });
    const bijlage = bijlageVan(html);
    const [datumLabel] = v.datum.split(": ");
    const [aardingLabel] = v.aarding.split(": ");
    const [isolatieLabel] = v.isolatie.split(": ");
    const scheiding = ": ";
    expect(bijlage).toContain(`${datumLabel}${scheiding}${v.leeg}`);
    expect(bijlage).toContain(`${aardingLabel}${scheiding}${v.leeg}`);
    // 0 is een geregistreerde waarde, geen leeg veld.
    expect(bijlage).toContain(`${isolatieLabel}${scheiding}0 MΩ`);
    const zonder = compactSchemaFixture();
    const leeg = bijlageVan(printHtml(zonder, analyseer(zonder), [], { ...opties, taal }).html);
    expect(leeg).toContain(`${isolatieLabel}${scheiding}${v.leeg}`);
    expect(leeg).not.toMatch(/: (Ω|MΩ|ms)\b/);
  });

  test("de dossierbijlage meldt ontbrekende metingen apart van de bevindingen", () => {
    const doc = compactSchemaFixture();
    const { html } = printHtml(doc, analyseer(doc), [], { ...opties, taal });
    const ontbreekt = { nl: ["Aardingsweerstand niet ingevuld.", "Isolatieweerstand niet ingevuld."], fr: ["Résistance de dispersion non renseignée.", "Résistance d’isolement non renseignée."], en: ["Earth resistance not entered.", "Insulation resistance not entered."] }[taal];
    const tekst = tekstVan(html);
    for (const zin of ontbreekt) expect(tekst).toContain(zin);
  });
});
