import { analyseer } from "@elentrik/arei";
import { installatie } from "@elentrik/arei/testing";
import { bruikbaar, STANDAARD_PAPIER_A4 } from "@elentrik/layout";
import { expect, test } from "vitest";
import { leesbareSchemaOpmaak } from "../src/print/leesbaar";

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
 expect(new Set(r.paginas.map(p => p.xVan)).size).toBeGreaterThan(1);
 expect(r.paginas.filter(p => p.xVan === 0).length).toBeGreaterThan(1);
 let gecontroleerd = 0;
 for (const pagina of r.paginas) for (const link of pagina.elementen) if (link.soort === 'vervolg') {
   const doel = r.paginas[link.paginaNummer - 1];
   expect(doel, `p.${pagina.index + 1} verwijst naar bestaande p.${link.paginaNummer}`).toBeDefined();
   const tegenLink = doel!.elementen.find(e => e.soort === 'vervolg' && e.y === link.y && e.richting !== link.richting);
   expect(tegenLink, `p.${pagina.index + 1} -> p.${link.paginaNummer} bij Y${link.y}`).toMatchObject({ paginaNummer: pagina.index + 1 });
   gecontroleerd++;
 }
 expect(gecontroleerd).toBeGreaterThan(0);
});
