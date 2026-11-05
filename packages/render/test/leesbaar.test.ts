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
