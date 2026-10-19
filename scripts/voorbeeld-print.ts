import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { analyseer, controleer, haalRegelset } from "../packages/arei/src/index";
import { referentieWoning } from "../packages/arei/src/testing/index";
import type { InstallatieDocument } from "../packages/model/src/index";
import { printHtml } from "../packages/render/src/index";

/**
 * Schrijft het printdocument van `referentieWoning()` naar `out/print-voorbeeld.html`, met een
 * situatiepagina op een nepplan (`out/plan-voorbeeld.svg`), om de pdf-opmaak in een browser na te
 * kijken. Afdrukken naar pdf in Chromium geeft dezelfde pagina's als Gotenberg.
 */
const uitMap = join(import.meta.dirname, "..", "out");
mkdirSync(uitMap, { recursive: true });

// Het gebouwde document is bevroren (immer); werk op een kopie.
const doc = JSON.parse(JSON.stringify(referentieWoning())) as InstallatieDocument;
doc.meta.klant = {
  naam: "Familie Janssens",
  adres: { straat: "Kerkstraat", nummer: "5", bus: "2", postcode: "3510", gemeente: "Kermt", land: "BE" },
};
doc.meta.werfadres = { straat: "Nieuwstraat", nummer: "88", postcode: "3500", gemeente: "Hasselt", land: "BE" };
doc.meta.ean = "541448820000000000";

const analyse = analyseer(doc);
const punten = analyse.kringen.flatMap((k) => k.puntIds);
doc.situatie.paginas.push(
  {
    id: "gelijkvloers",
    titel: "Gelijkvloers",
    achtergrond: { origineelBestandId: "o1", rasterBestandId: "r1", breedte_px: 3000, hoogte_px: 2000 },
    plaatsingen: punten.slice(0, 12).map((nodeId, i) => ({
      nodeId,
      x: 300 + (i % 6) * 450,
      y: 500 + Math.floor(i / 6) * 900,
      rotatie: (i % 4) * 90,
    })),
  },
  { id: "zolder", titel: "Zolder", plaatsingen: [] },
);
const eerste = punten[0];
if (eerste) {
  doc.afwijkingen.push({
    regelId: "arei.situatie.niet-geplaatst",
    nodeId: eerste,
    motivatie: "Het stopcontact wordt pas geplaatst na de verbouwing van de keuken. ".repeat(6).trim(),
    door: "Jan Peeters",
    datum: "2026-10-02",
  });
}

const plan =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3000 2000">' +
  '<rect width="3000" height="2000" fill="#f4f4f4"/>' +
  '<path d="M100 100H2900V1900H100Z M1500 100V1100 M100 1100H2200" fill="none" stroke="#888" stroke-width="20"/>' +
  "</svg>";
writeFileSync(join(uitMap, "plan-voorbeeld.svg"), plan, "utf8");

const { html, paginas, overgeslagen } = printHtml(doc, analyseer(doc), controleer(doc, haalRegelset(doc.regelset)), {
  papier: "A4",
  onderdelen: { eendraadschema: true, situatieschema: true, kringenlijst: true, bijlage: true },
  versieLabel: "v1",
  datum: "2026-10-19",
  taal: "nl",
  installateur: {
    naam: "Elektro Peeters bv",
    email: "info@elektropeeters.be",
    telefoon: "011 22 33 44",
    adres: { straat: "Stationsstraat", nummer: "12", postcode: "3500", gemeente: "Hasselt", land: "BE" },
  },
  afbeeldingen: { r1: "plan-voorbeeld.svg" },
});
writeFileSync(join(uitMap, "print-voorbeeld.html"), html, "utf8");
console.log(`out/print-voorbeeld.html: ${paginas} pagina's, overgeslagen: ${overgeslagen.join(", ") || "geen"}`);
