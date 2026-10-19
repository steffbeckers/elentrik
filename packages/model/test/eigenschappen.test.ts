import * as fc from "fast-check";
import { expect, test } from "vitest";
import {
  DocumentFout,
  nieuwDocument,
  parseDocument,
  pasPatchesToe,
  hernoemPagina,
  PLAATSBARE_TYPES,
  plaats,
  TOEGELATEN_KINDEREN,
  valideerStructuur,
  verplaats,
  verplaatsPagina,
  verwijder,
  verwijderPagina,
  voegPaginaToe,
  voegToe,
  type InstallatieDocument,
  type NodeInvoer,
  type NodeType,
  type OperatieResultaat,
  type Patch,
} from "../src/index";
import { kloon } from "./hulp";

/** Gegenereerde ruwe waarden, allemaal binnen de schemagrenzen. */
type Waarden = {
  streng: number;
  aantal: number;
  polen: 1 | 2 | 3 | 4;
  waar: boolean;
  keuze: number;
};

const waardenArb: fc.Arbitrary<Waarden> = fc.record({
  streng: fc.integer({ min: 1, max: 1000 }),
  aantal: fc.integer({ min: 1, max: 20 }),
  polen: fc.constantFrom(1, 2, 3, 4),
  waar: fc.boolean(),
  keuze: fc.nat({ max: 1000 }),
});

const SEED_WAARDEN: Waarden = { streng: 16, aantal: 1, polen: 2, waar: true, keuze: 0 };

function kies<T>(opties: readonly T[], keuze: number): T {
  return opties[keuze % opties.length]!;
}

const FABRIEK: Record<NodeType, (w: Waarden) => NodeInvoer> = {
  aansluiting: () => ({ type: "aansluiting" }),
  teller: () => ({ type: "teller" }),
  differentieel: (w) => ({
    type: "differentieel",
    gevoeligheid_mA: w.streng,
    nominaal_A: w.streng,
    polen: w.polen,
    klasse: kies(["AC", "A", "F", "B"] as const, w.keuze),
  }),
  automaat: (w) => ({
    type: "automaat",
    nominaal_A: w.streng,
    polen: w.polen,
    curve: kies(["B", "C", "D"] as const, w.keuze),
  }),
  zekering: (w) => ({ type: "zekering", nominaal_A: w.streng }),
  verdeelbord: () => ({ type: "verdeelbord" }),
  leiding: (w) => ({
    type: "leiding",
    kabeltype: w.waar ? "XVB" : "",
    doorsnede_mm2: w.waar ? 1.5 : 0,
    aantalGeleiders: w.aantal,
  }),
  contactdoos: (w) => ({
    type: "contactdoos",
    aantal: w.aantal,
    randaarde: w.waar,
    kinderbeveiliging: !w.waar,
    waterdicht: w.waar,
  }),
  lichtpunt: (w) => ({ type: "lichtpunt", aantal: w.aantal }),
  schakelaar: (w) => ({
    type: "schakelaar",
    soort: kies(["enkel", "dubbel", "wissel", "kruis", "dimmer", "drukknop"] as const, w.keuze),
    waterdicht: w.waar,
  }),
  toestel: (w) => ({
    type: "toestel",
    soort: kies(["wasmachine", "oven", "boiler", "andere"] as const, w.keuze),
  }),
};

/**
 * Een positie in een kinderlijst: meestal binnen het bereik (`n` modulo de lengte + 1),
 * soms ruw (mogelijk buiten het bereik, dus een geldige weigering).
 */
type Positie = { ruw: boolean; n: number } | null;

/** Een operatie met indexen; ze worden pas bij het uitvoeren naar een node of pagina vertaald. */
type Operatie =
  | {
      soort: "voegToe";
      ouder: number;
      kind: number;
      waarden: Waarden;
      positie: Positie;
    }
  | { soort: "verwijder"; doel: number }
  | {
      soort: "verplaats";
      doel: number;
      ouder: number;
      ruw: boolean;
      positie: Positie;
    }
  | { soort: "voegPaginaToe"; titel: string }
  | { soort: "hernoemPagina"; pagina: number; titel: string }
  | { soort: "verwijderPagina"; pagina: number }
  | { soort: "verplaatsPagina"; pagina: number; index: number }
  | {
      soort: "plaats";
      pagina: number;
      doel: number;
      x: number;
      y: number;
      rotatie: number;
    };

const index = fc.nat({ max: 10_000 });
const positieArb: fc.Arbitrary<Positie> = fc.oneof(
  { weight: 4, arbitrary: fc.constant(null) },
  { weight: 4, arbitrary: fc.record({ ruw: fc.constant(false), n: index }) },
  {
    weight: 1,
    arbitrary: fc.record({
      ruw: fc.constant(true),
      n: fc.integer({ min: -2, max: 100 }),
    }),
  },
);
const getal = fc.double({ min: -1e6, max: 1e6, noNaN: true });

// Gewogen zodat documenten meestal groeien en plaatsingen regelmatig slagen.
const operatieArb: fc.Arbitrary<Operatie> = fc.oneof(
  {
    weight: 8,
    arbitrary: fc.record({
      soort: fc.constant("voegToe" as const),
      ouder: index,
      kind: index,
      waarden: waardenArb,
      positie: positieArb,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({ soort: fc.constant("verwijder" as const), doel: index }),
  },
  {
    weight: 3,
    arbitrary: fc.record({
      soort: fc.constant("verplaats" as const),
      doel: index,
      ouder: index,
      ruw: fc.oneof(
        { weight: 1, arbitrary: fc.constant(true) },
        { weight: 4, arbitrary: fc.constant(false) },
      ),
      positie: positieArb,
    }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      soort: fc.constant("voegPaginaToe" as const),
      titel: fc.string(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      soort: fc.constant("hernoemPagina" as const),
      pagina: index,
      titel: fc.string(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({ soort: fc.constant("verwijderPagina" as const), pagina: index }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      soort: fc.constant("verplaatsPagina" as const),
      pagina: index,
      // Ook negatieve en te grote indexen: een geldige weigering.
      index: fc.integer({ min: -2, max: 12 }),
    }),
  },
  {
    weight: 5,
    arbitrary: fc.record({
      soort: fc.constant("plaats" as const),
      pagina: index,
      doel: index,
      x: getal,
      y: getal,
      rotatie: getal,
    }),
  },
);

/** Startdocument: teller > verdeelbord > automaat > leiding > contactdoos, plus één pagina. */
function startDocument(): InstallatieDocument {
  const teller = nieuwDocument();
  const tellerId = teller.nodes[teller.rootId]!.kinderen[0]!;
  const bord = voegToe(teller, tellerId, { type: "verdeelbord" });
  const automaat = voegToe(bord.doc, bord.id, FABRIEK.automaat(SEED_WAARDEN));
  const leiding = voegToe(automaat.doc, automaat.id, FABRIEK.leiding(SEED_WAARDEN));
  const punt = voegToe(leiding.doc, leiding.id, FABRIEK.contactdoos(SEED_WAARDEN));
  return voegPaginaToe(punt.doc, "Begane grond").doc;
}

/** Vertaalt een positie naar een index voor een lijst van `lengte` (of `undefined` voor het einde). */
function naarIndex(positie: Positie, lengte: number): number | undefined {
  if (positie === null) return undefined;
  return positie.ruw ? positie.n : positie.n % (lengte + 1);
}

/** Een bestaande pagina; zonder pagina's wordt de weigering ONBEKENDE_PAGINA getest. */
function kiesPaginaId(doc: InstallatieDocument, i: number): string {
  const paginas = doc.situatie.paginas;
  return paginas.length > 0 ? paginas[i % paginas.length]!.id : "geen-pagina";
}

function voerUit(doc: InstallatieDocument, op: Operatie): OperatieResultaat {
  const ids = Object.keys(doc.nodes);
  const kiesId = (lijst: readonly string[], i: number): string => lijst[i % lijst.length]!;
  /** Alle nodes behalve de root (alleen de root: dan weigert de operatie). */
  const nietRoot = ids.filter((id) => id !== doc.rootId);
  const doelen = nietRoot.length > 0 ? nietRoot : ids;
  switch (op.soort) {
    case "voegToe": {
      const ouderId = kiesId(ids, op.ouder);
      const ouder = doc.nodes[ouderId]!;
      const type = kies(TOEGELATEN_KINDEREN[ouder.type], op.kind);
      return voegToe(
        doc,
        ouderId,
        FABRIEK[type](op.waarden),
        naarIndex(op.positie, ouder.kinderen.length),
      );
    }
    case "verwijder":
      return verwijder(doc, kiesId(doelen, op.doel));
    case "verplaats": {
      const doelId = kiesId(doelen, op.doel);
      const doelType = doc.nodes[doelId]!.type;
      // Meestal een ouder die het type toelaat; een cyclus blijft mogelijk (nieuwe ouder in de eigen subboom).
      const passend = ids.filter((id) =>
        (TOEGELATEN_KINDEREN[doc.nodes[id]!.type] as readonly string[]).includes(doelType),
      );
      const ouderId = kiesId(op.ruw || passend.length === 0 ? ids : passend, op.ouder);
      const lengte = doc.nodes[ouderId]!.kinderen.length;
      return verplaats(doc, doelId, ouderId, naarIndex(op.positie, lengte));
    }
    case "voegPaginaToe":
      return voegPaginaToe(doc, op.titel);
    case "hernoemPagina":
      return hernoemPagina(doc, kiesPaginaId(doc, op.pagina), op.titel);
    case "verwijderPagina":
      return verwijderPagina(doc, kiesPaginaId(doc, op.pagina));
    case "verplaatsPagina":
      return verplaatsPagina(doc, kiesPaginaId(doc, op.pagina), op.index);
    case "plaats": {
      const paginaId = kiesPaginaId(doc, op.pagina);
      const plaatsbaar = ids.filter((id) =>
        (PLAATSBARE_TYPES as readonly string[]).includes(doc.nodes[id]!.type),
      );
      return plaats(doc, paginaId, kiesId(plaatsbaar.length > 0 ? plaatsbaar : ids, op.doel), {
        x: op.x,
        y: op.y,
        rotatie: op.rotatie,
      });
    }
  }
}

test("willekeurige reeksen operaties behouden de invarianten en zijn volledig omkeerbaar", () => {
  fc.assert(
    fc.property(
      fc.array(operatieArb, { minLength: 1, maxLength: 60, size: "max" }),
      (operaties) => {
        const start = startDocument();
        const startKopie = kloon(start);
        let doc = start;
        const inverses: Patch[][] = [];

        for (const op of operaties) {
          // JSON-vergelijking: toEqual onderscheidt -0 en 0, een JSON-kopie niet.
          const voor = JSON.stringify(doc);
          let uitkomst: OperatieResultaat;
          try {
            uitkomst = voerUit(doc, op);
          } catch (e) {
            // Een DocumentFout is een geldige weigering; elke andere fout is een bug.
            if (!(e instanceof DocumentFout)) throw e;
            expect(JSON.stringify(doc)).toBe(voor);
            continue;
          }
          doc = uitkomst.doc;
          inverses.push(uitkomst.inversePatches);

          expect(valideerStructuur(doc)).toEqual([]);
          // Een node heeft hoogstens één plaatsing, over alle pagina's heen.
          const geplaatst = doc.situatie.paginas.flatMap((p) =>
            p.plaatsingen.map((pl) => pl.nodeId),
          );
          expect(new Set(geplaatst).size).toBe(geplaatst.length);
          expect(() => parseDocument(kloon(doc))).not.toThrow();
        }

        // Alle inversePatches in omgekeerde volgorde herstellen het startdocument.
        let terug = doc;
        for (const inverse of inverses.reverse()) terug = pasPatchesToe(terug, inverse);
        expect(terug).toEqual(startKopie);
      },
    ),
    { numRuns: 200 },
  );
});
