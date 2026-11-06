import { analyseer, controleer, haalRegelset } from "@elentrik/arei";
import { PLAATSBARE_TYPES, voegOnderdeelToe } from "@elentrik/model";
import { expect, test } from "vitest";
import { printHtml, type PrintOpties } from "../src/index";
import { compactSchemaFixture } from "./fixtures/compact-schema";
import { kloon } from "./hulp";

function fixture() {
  let doc = compactSchemaFixture();
  const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
  doc = kloon(voegOnderdeelToe(doc, { soort: "rail-einde", nodeId: bord.id }, "aardingsonderbreker").doc);
  const analyse = analyseer(doc);
  const i3 = Object.keys(analyse.puntLabels).find(id => analyse.puntLabels[id] === "I3")!;
  const pv = Object.values(doc.nodes).find(n => n.type === "toestel" && n.soort === "pvPaneel")!;
  if (pv.type === "toestel") { pv.puntReferentie = "geen"; pv.label = "PV-array <dak>"; }
  const onderbreker = Object.values(doc.nodes).find(n => n.type === "aardingsonderbreker")!;
  const ontbrekend = [i3, pv.id, onderbreker.id];
  doc.meta.klant.naam = "Bron";
  doc.meta.werfadres = { straat: "Test", nummer: "1", postcode: "1000", gemeente: "Brussel", land: "BE" };
  doc.meta.installatieContext = "onbekend";
  doc.situatie.paginas = [{ id: "plan", titel: "Plan", achtergrond: { origineelBestandId: "o", rasterBestandId: "r", breedte_px: 1000, hoogte_px: 800 },
    plaatsingen: Object.values(doc.nodes).filter(n => (PLAATSBARE_TYPES as readonly string[]).includes(n.type) && !ontbrekend.includes(n.id))
      .map(n => ({ nodeId: n.id, x: 100, y: 100, rotatie: 0 })),
  }];
  return { doc, ontbrekend };
}
const opties: PrintOpties = { papier: "A4", onderdelen: { eendraadschema: false, situatieschema: false, kringenlijst: false, bijlage: true }, versieLabel: "Concept", datum: "2026-11-06", taal: "nl", installateur: { naam: "Test" }, afbeeldingen: { r: "plan.png" } };

test.each([
  ["nl", "Dossier afwerken", "Installatiecontext", "Aardingsonderbreker"],
  ["fr", "Compléter le dossier", "Contexte de l’installation", "Sectionneur de terre"],
  ["en", "Complete the dossier", "Installation context", "Earth disconnector"],
] as const)("PDF bevat de volledige dossierchecklist met herkenbare bronpunten (%s)", (taal, titel, context, aarding) => {
  const { doc } = fixture();
  const analyse = analyseer(doc);
  const bevindingen = controleer(doc, haalRegelset(doc.regelset));
  const { html } = printHtml(doc, analyse, bevindingen, { ...opties, taal });
  expect(html).toContain(titel);
  expect(html).toContain(context);
  expect(html).toContain(aarding);
  expect(html).toContain("PV-array &lt;dak&gt;");
  expect(html.match(/I3 —/g)).toHaveLength(1);
  expect(html).not.toContain("Punt ?");
  expect(html).not.toContain("Point ?");
});

test("volledig dossier heeft geen open checklist en referentiebladen verbergen geen ontbrekend plan", () => {
  const { doc, ontbrekend } = fixture();
  doc.meta.installatieContext = "nieuw";
  doc.situatie.paginas[0]!.plaatsingen.push(...ontbrekend.map(nodeId => ({ nodeId, x: 200, y: 200, rotatie: 0 })));
  const compleet = printHtml(doc, analyseer(doc), [], opties);
  expect(compleet.html).not.toContain("Dossier afwerken");
  doc.situatie.paginas[0]!.referentie = true;
  expect(printHtml(doc, analyseer(doc), [], opties).html).toContain("Situatieplan ontbreekt");
});

test("ontbrekende gegevens en lange omschrijvingen blijven volledig in de gepagineerde dossierbijlage", () => {
  const { doc } = fixture();
  doc.meta.klant.naam = " ";
  doc.meta.werfadres.straat = "";
  doc.situatie.paginas.push({ id: "leeg", titel: "Tweede verdieping", plaatsingen: [] });
  const pv = Object.values(doc.nodes).find(n => n.type === "toestel" && n.soort === "pvPaneel")!;
  if (pv.type === "toestel") pv.label = Array.from({ length: 1000 }, (_, i) => `bron${i}`).join(" ");
  const { html, paginas } = printHtml(doc, analyseer(doc), [], opties);
  expect(html).toContain("Klantnaam ontbreekt.");
  expect(html).toContain("Werfadres is onvolledig.");
  expect(html).toContain("Tweede verdieping — Achtergrondplan ontbreekt");
  expect(paginas).toBeGreaterThan(1);
  const tekst = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  for (let i = 0; i < 1000; i++) expect(tekst).toContain(`bron${i}`);
});
