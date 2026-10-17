import type { InstallatieDocument } from "@elentrik/model";
import { analyseer } from "./analyse/index";
import type { Bevinding, Ernst, Regelset } from "./types";

const ERNST_VOLGORDE: Readonly<Record<Ernst, number>> = { fout: 0, waarschuwing: 1, info: 2 };

function vergelijkTekst(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function vergelijk(a: Bevinding, b: Bevinding): number {
  return (
    ERNST_VOLGORDE[a.ernst] - ERNST_VOLGORDE[b.ernst] ||
    vergelijkTekst(a.regelId, b.regelId) ||
    vergelijkTekst(a.nodeIds[0] ?? "", b.nodeIds[0] ?? "")
  );
}

/** Voert alle regels van een regelset uit op één analyse van het document (spec §5). */
export function controleer(doc: InstallatieDocument, regelset: Regelset): Bevinding[] {
  const analyse = analyseer(doc);
  const bevindingen: Bevinding[] = [];
  for (const regel of regelset.regels) {
    for (const b of regel.check(analyse, doc)) {
      const afgeweken = doc.afwijkingen.some((a) => a.regelId === b.regelId && b.nodeIds.includes(a.nodeId));
      bevindingen.push({ ...b, afgeweken });
    }
  }
  return bevindingen.sort(vergelijk);
}
