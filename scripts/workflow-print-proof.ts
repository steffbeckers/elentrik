import { writeFile, mkdir } from "node:fs/promises";
import { analyseer, controleer, haalRegelset } from "../packages/arei/src/index";
import { referentieWoning } from "../packages/arei/src/testing/index";
import { printHtml } from "../packages/render/src/index";
import { maakPdf } from "../apps/web/server/pdf/gotenberg";

await mkdir("out/workflow-print", { recursive: true });
for (const taal of ["nl", "fr", "en"] as const) {
 const doc = structuredClone(referentieWoning());
 doc.voeding.stroomtype = "3N400V";
 doc.meta.klant.naam = "Familie Janssens - Woning met drie verdiepingen";
 doc.meta.werfadres = { straat: "Lange Nieuwe Stationsstraat", nummer: "125", bus: "B", postcode: "3500", gemeente: "Hasselt", land: "BE" };
 doc.meta.datum = "2026-11-05";
 doc.situatie.paginas.push({ id: "p", titel: "Gelijkvloers", afdruk: { papier: taal === 'fr' ? 'A3' : 'A4', orientatie: taal === 'en' ? 'liggend' : 'staand', schaalmodus: 'gekalibreerd', schaalNoemer: 100 }, achtergrond: { origineelBestandId: 'o', rasterBestandId: 'r', breedte_px: 3000, hoogte_px: 2000, schaal: { mmPerPx: 10 } }, plaatsingen: analyseer(doc).kringen[0]!.puntIds.map((nodeId, i) => ({ nodeId, x: 300 + i * 300, y: 600, rotatie: 0 })) });
 const plan = '<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="2000"><rect width="3000" height="2000" fill="white"/><path d="M100 100H2900V1900H100Z M1500 100V1900 M100 1000H1500" stroke="black" stroke-width="15" fill="none"/><path d="M500 1700H1500" stroke="red" stroke-width="8"/><text x="500" y="1650" font-size="60">10 m (100 mm at 1:100)</text></svg>';
 const r = printHtml(doc, analyseer(doc), controleer(doc, haalRegelset(doc.regelset)), { papier: 'A4', onderdelen: { eendraadschema: true, situatieschema: true, kringenlijst: true, bijlage: true }, versieLabel: 'Uitgebreide dossierherziening - bovenverdieping en zonnepanelen', datum: doc.meta.datum, taal, installateur: { naam: 'Elektro Peeters bv', email: 'info@elektropeeters.be' }, afbeeldingen: { r: 'plan.svg' } });
 await writeFile(`out/workflow-print/${taal}.html`, r.html);
 const pdf = await maakPdf({ html: r.html, papier: 'A4', bestanden: [{ naam: 'plan.svg', data: new TextEncoder().encode(plan), mime: 'image/svg+xml' }] });
 await writeFile(`out/workflow-print/${taal}.pdf`, pdf);
 console.log(`${taal}: ${r.paginas} pages, ${pdf.length} bytes`);
}
