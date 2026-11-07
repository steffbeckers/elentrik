// Puur (ruling E1): een kring dupliceren met de eerste vrije letter, zoals Ctrl+D doet.
import { dupliceerKring, DocumentFout, kringLetter, type InstallatieDocument, type NodeId, type OperatieResultaat } from "@elentrik/model";

/** Zoveel letters (A tot ZZ) proberen we; daarna is er geen redelijke vrije code meer. */
const MAX_CODES = 26 * 27;

/**
 * Dupliceert kring `kringId` (de beveiliging) via `dupliceerKring` met de eerste letter die in zijn
 * nummerreeks nog vrij is. Is `kringId` geen kring, dan gooit `dupliceerKring` een `DocumentFout`.
 */
export function dupliceerMetVrijeCode(
  doc: InstallatieDocument,
  kringId: NodeId,
): { resultaat: OperatieResultaat & { id: NodeId }; code: string } {
  let laatsteFout: DocumentFout | undefined;
  for (let i = 0; i < MAX_CODES; i++) {
    const code = kringLetter(i);
    try {
      return { resultaat: dupliceerKring(doc, kringId, code), code };
    } catch (fout) {
      if (!(fout instanceof DocumentFout)) throw fout;
      // Alleen een bezette letter is reden om verder te zoeken; geen kring stopt meteen.
      if (fout.code !== "ONGELDIG_SCHEMA") throw fout;
      laatsteFout = fout;
    }
  }
  throw laatsteFout ?? new DocumentFout("ONGELDIG_SCHEMA", { reden: "geen vrije kringcode" });
}
