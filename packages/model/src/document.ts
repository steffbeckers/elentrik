import { DocumentFout } from "./fouten";
import { nieuwId } from "./ids";
import {
  InstallatieDocumentSchema,
  type InstallatieDocument,
  type Stroomtype,
} from "./schema";
import { SCHEMA_VERSIE } from "./versie";

export function parseDocument(invoer: unknown): InstallatieDocument {
  const resultaat = InstallatieDocumentSchema.safeParse(invoer);
  if (!resultaat.success) {
    throw new DocumentFout("ONGELDIG_SCHEMA", { issues: resultaat.error.issues });
  }
  return resultaat.data;
}

function vandaag(): string {
  const nu = new Date();
  const maand = String(nu.getMonth() + 1).padStart(2, "0");
  const dag = String(nu.getDate()).padStart(2, "0");
  return `${nu.getFullYear()}-${maand}-${dag}`;
}

export function nieuwDocument(
  opties: {
    klantNaam?: string;
    stroomtype?: Stroomtype;
    regelset?: string;
    datum?: string;
  } = {},
): InstallatieDocument {
  const rootId = nieuwId();
  const tellerId = nieuwId();
  return {
    id: nieuwId(),
    schemaVersion: SCHEMA_VERSIE,
    regelset: opties.regelset ?? "arei-2020@1",
    meta: {
      klant: { naam: opties.klantNaam ?? "" },
      installateur: { naam: "" },
      werfadres: { straat: "", nummer: "", postcode: "", gemeente: "", land: "België" },
      datum: opties.datum ?? vandaag(),
    },
    voeding: { stroomtype: opties.stroomtype ?? "2x230V" },
    rootId,
    nodes: {
      [rootId]: { id: rootId, parentId: null, kinderen: [tellerId], type: "aansluiting" },
      [tellerId]: { id: tellerId, parentId: rootId, kinderen: [], type: "teller" },
    },
    situatie: { paginas: [] },
    afwijkingen: [],
  };
}
