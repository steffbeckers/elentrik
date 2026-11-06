import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { bruikbaar, STANDAARD_PAPIER_A4 } from "@elentrik/layout";
import { expect, test } from "vitest";
import { leesbareSchemaOpmaak } from "../src/print/leesbaar";
import { compactSchemaFixture } from "./fixtures/compact-schema";
import { kloon } from "./hulp";
import { schemaPaginaSvg } from "../src/schema-svg";
import { voegToe, type NodeInvoer } from "@elentrik/model";

test("losse PE-groep deelt de voedingsrij zonder leeg derde blad bij een breed schema", () => {
 let doc = compactSchemaFixture();
 const bord = Object.values(doc.nodes).find(n => n.type === "verdeelbord")!;
 const add = (parent: string, invoer: NodeInvoer) => {
   const r = voegToe(doc, parent, invoer); doc = r.doc; return r.id;
 };
 for (let i = 0; i < 3; i++) {
   const a = add(bord.id, { type: "automaat", nominaal_A: 16, polen: 2, curve: "C" });
   const l = add(a, { type: "leiding", kabeltype: "XVB", doorsnede_mm2: 2.5, aantalGeleiders: 3 });
   add(l, { type: "toestel", soort: "oven" });
 }
 const onderbreker = add(bord.id, { type: "aardingsonderbreker" });
 add(onderbreker, { type: "aardelektrode" });
 const papier = { ...STANDAARD_PAPIER_A4, formaat: "A3" as const, cartoucheHoogte_mm: 39 };
 const r = leesbareSchemaOpmaak(doc, papier, analyseer(doc));
 expect(r.paginas).toHaveLength(2);
 expect(r.paginas.flatMap(p => p.elementen.flatMap(e => e.soort === "symbool" ? [e.nodeId] : [])).sort()).toEqual(Object.keys(doc.nodes).sort());
 const pePagina = r.paginas.find(p => p.elementen.some(e => e.soort === "symbool" && e.nodeId === onderbreker))!;
 const pe = pePagina.elementen.find(e => e.soort === "symbool" && e.nodeId === onderbreker)!;
 const teller = pePagina.elementen.find(e => e.soort === "symbool" && doc.nodes[e.nodeId]!.type === "teller");
 expect(teller?.soort).toBe("symbool");
 if (pe.soort === "symbool" && teller?.soort === "symbool") {
   expect(Math.abs(pe.y - teller.y)).toBeLessThan(15);
   expect(pe.x).toBeGreaterThan(teller.x + teller.symbool.maat.breedte);
 }
 for (const p of r.paginas) for (const e of p.elementen) if (e.soort === "symbool") {
   expect(e.x).toBeGreaterThanOrEqual(p.xVan);
   expect(e.x + e.symbool.maat.breedte).toBeLessThanOrEqual(p.xVan + bruikbaar(papier).breedte);
   expect(e.y).toBeGreaterThanOrEqual(p.yVan ?? 0);
   expect(e.y + e.symbool.maat.hoogte).toBeLessThanOrEqual((p.yVan ?? 0) + bruikbaar(papier).hoogte);
 }
});

test("gekoppelde stroken delen een blad met uniek gepaarde lokale vervolgverwijzingen", () => {
 const doc = installatie().verdeelbord(b => {
   b.differentieel(30, n => { for (let i = 0; i < 12; i++) n.kring(k => k.automaat(16).leiding(2.5).contactdozen(1)); });
   for (let i = 0; i < 4; i++) b.kring(k => k.automaat(16).leiding(2.5).contactdozen(1));
 }).bouw().doc;
 const r = leesbareSchemaOpmaak(doc, { ...STANDAARD_PAPIER_A4, formaat: "A3", orientatie: "staand" }, analyseer(doc));
 expect(r.paginas).toHaveLength(1);
 const links = r.paginas[0]!.elementen.filter(e => e.soort === "vervolg");
 expect(new Set(links.map(e => e.verbindingsnummer)).size).toBeGreaterThan(1);
 for (const link of links) {
   expect(link).toMatchObject({ paginaNummer: 1, verbindingsnummer: expect.any(Number) });
   expect(links.filter(e => e.verbindingsnummer === link.verbindingsnummer)).toHaveLength(2);
 }
 expect(schemaPaginaSvg(r, 0)).toContain(">#1</text>");
});

test("een kort voedingsreststuk deelt het vervolgblad met kortere kringen zonder schaalverlies", () => {
 const doc = compactSchemaFixture();
 const origineel = JSON.stringify(doc);
 const papier = { ...STANDAARD_PAPIER_A4, formaat: "A3" as const };
 const r = leesbareSchemaOpmaak(doc, papier, analyseer(doc));
 // Deze 16-kringenfixture had drie bladen, waarvan één met uitsluitend de aansluiting.
 expect(r.paginas).toHaveLength(2);
 expect(r.paginas.every(p => p.schaal === 1)).toBe(true);
 const ids = r.paginas.flatMap(p => p.elementen.flatMap(e => e.soort === "symbool" ? [e.nodeId] : []));
 expect(ids.sort()).toEqual(Object.keys(doc.nodes).sort());
 expect(JSON.stringify(doc)).toBe(origineel);
 const tekst = (elementen: typeof r.strook.elementen) => elementen.flatMap(e => e.soort === "tekst" && !e.tekst.startsWith("p. ") ? [`${e.rol}:${e.tekst}`] : []).sort();
 expect(tekst(r.paginas.flatMap(p => p.elementen))).toEqual(tekst(r.strook.elementen));
 const verbindingen = new Map<string, number>();
 for (const p of r.paginas) for (const e of p.elementen) {
   if (e.soort === "tekst") expect(e.grootte).toBeGreaterThanOrEqual(2.5);
   const van = e.soort === "lijn" ? Math.min(e.y1, e.y2) : e.soort === "tekst" ? e.y - e.grootte : e.y;
   const tot = e.soort === "lijn" ? Math.max(e.y1, e.y2) : e.soort === "symbool" ? e.y + e.symbool.maat.hoogte : e.y + (e.soort === "tekst" ? e.grootte * .35 : 1);
   expect(van).toBeGreaterThanOrEqual(p.yVan ?? 0);
   expect(tot).toBeLessThanOrEqual((p.yVan ?? 0) + bruikbaar(papier).hoogte);
   const doel = e.soort === "vervolg" ? e.paginaNummer : e.soort === "tekst" && e.tekst.startsWith("p. ") ? Number(e.tekst.match(/^p\. (\d+)/)![1]) : undefined;
   if (doel !== undefined) {
     expect(doel).not.toBe(p.index + 1);
     expect(r.paginas[doel - 1]).toBeDefined();
     const sleutel = `${p.index + 1}:${doel}`;
     verbindingen.set(sleutel, (verbindingen.get(sleutel) ?? 0) + 1);
   }
 }
 for (const [paar, aantal] of verbindingen) expect(verbindingen.get(paar.split(":").reverse().join(":"))).toBe(aantal);
});

test.each(["A4", "A3"] as const)("technische bronannotaties blijven volledig en leesbaar na compacte paginering op %s", formaat => {
 const doc = kloon(compactSchemaFixture());
 doc.voeding.frequentie_Hz = 50;
 for (const node of Object.values(doc.nodes)) {
   if (node.type === "teller") node.nominaal_A = 40;
   if (node.type === "toestel" && node.soort === "omvormer") node.schijnbaarVermogen_kVA = 10;
   if (node.type === "toestel" && node.soort === "pvPaneel") { node.aantalPanelen = 20; node.puntReferentie = "geen"; }
   if (node.type === "toestel" && node.soort === "laadpaal") node.dcDetectie_mA = 6;
 }
 const papier = { ...STANDAARD_PAPIER_A4, formaat };
 const r = leesbareSchemaOpmaak(doc, papier, analyseer(doc));
 const teksten = r.paginas.flatMap(p => p.elementen.flatMap(e => e.soort === "tekst" ? [e.tekst] : []));
 for (const tekst of ["40 A", "10 kVA", "×20", "6 mA DC", "3N × 400 V ~ 50 Hz"]) expect(teksten.filter(t => t === tekst)).toHaveLength(1);
 expect(teksten).not.toContain("S2");
 for (const p of r.paginas) for (const e of p.elementen) if (e.soort === "tekst") {
   expect(e.grootte * p.schaal).toBeGreaterThanOrEqual(2.5);
   expect(e.y - e.grootte).toBeGreaterThanOrEqual(p.yVan ?? 0);
   expect(e.y + e.grootte * .35).toBeLessThanOrEqual((p.yVan ?? 0) + bruikbaar(papier).hoogte);
 }
});

test("verticale vervolgbladen behouden ieder symbool eenmaal en knippen verbindingen aan de paginarand", () => {
 const doc = installatie().verdeelbord(b => b.kring(k => { let keten = k.automaat(16).leiding(2.5); for (let i = 0; i < 80; i++) keten = keten.contactdozen(1); return keten; })).bouw().doc;
 const r = leesbareSchemaOpmaak(doc, STANDAARD_PAPIER_A4, analyseer(doc));
 const ids = r.paginas.flatMap(p => p.elementen.filter(e => e.soort === 'symbool').map(e => e.nodeId));
 expect(ids.length).toBe(Object.keys(doc.nodes).length);
 expect(new Set(ids).size).toBe(ids.length);
 const h = bruikbaar(STANDAARD_PAPIER_A4).hoogte;
 for (const p of r.paginas) for (const e of p.elementen) if (e.soort === 'lijn') {
   expect(Math.min(e.y1, e.y2)).toBeGreaterThanOrEqual(p.yVan ?? 0);
   expect(Math.max(e.y1, e.y2)).toBeLessThanOrEqual((p.yVan ?? 0) + h);
 }
 expect(r.paginas.slice(1).some(p => p.elementen.some(e => e.soort === 'tekst' && e.tekst.startsWith('p. ')))).toBe(true);
 const links = r.paginas.flatMap(p => p.elementen.flatMap(e => {
   const match = e.soort === "tekst" ? /^p\. (\d+) #(\d+)$/.exec(e.tekst) : null;
   return match ? [{ van: p.index + 1, naar: Number(match[1]), verbinding: Number(match[2]) }] : [];
 }));
 for (const link of links) {
   const paar = links.filter(e => e.verbinding === link.verbinding);
   expect(paar).toHaveLength(2);
   expect(paar).toContainEqual({ van: link.naar, naar: link.van, verbinding: link.verbinding });
 }
});

test.each(["A4", "A3"] as const)("horizontale railverwijzingen wijzen wederzijds naar de juiste verticale tegel op %s", formaat => {
 const doc = installatie().verdeelbord(b => {
   for (let kring = 0; kring < 15; kring++) b = b.kring(k => {
     let keten = k.automaat(16).leiding(2.5);
     for (let punt = 0; punt < (kring === 0 ? 80 : 2); punt++) keten = keten.contactdozen(1);
     return keten;
   });
   return b;
 }).bouw().doc;
 const r = leesbareSchemaOpmaak(doc, { ...STANDAARD_PAPIER_A4, formaat }, analyseer(doc));
 expect(r.paginas.length).toBeGreaterThan(1);
 let gecontroleerd = 0;
 for (const pagina of r.paginas) for (const link of pagina.elementen) if (link.soort === 'vervolg') {
   const doel = r.paginas[link.paginaNummer - 1];
   expect(doel, `p.${pagina.index + 1} verwijst naar bestaande p.${link.paginaNummer}`).toBeDefined();
   // Packed fragments can sit at different heights; the reciprocal destination is invariant.
   expect(link.paginaNummer).not.toBe(pagina.index + 1);
   const tegenLink = doel!.elementen.find(e => e.soort === 'vervolg' && e.richting !== link.richting && e.paginaNummer === pagina.index + 1 && e.verbindingsnummer === link.verbindingsnummer);
   expect(tegenLink, `p.${pagina.index + 1} -> p.${link.paginaNummer} bij Y${link.y}`).toMatchObject({ paginaNummer: pagina.index + 1 });
   gecontroleerd++;
 }
 expect(gecontroleerd).toBeGreaterThan(0);
});
