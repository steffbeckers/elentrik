import { z } from "zod";
import { SCHEMA_VERSIE } from "./versie";

const Id = z.string();
export const NodeIdSchema = Id;

export const AdresSchema = z.strictObject({
  straat: z.string(),
  nummer: z.string(),
  bus: z.string().optional(),
  postcode: z.string(),
  gemeente: z.string(),
  land: z.string(),
});

export const PartijSchema = z.strictObject({
  naam: z.string(),
  ondernemingsnummer: z.string().optional(),
  email: z.string().optional(),
  telefoon: z.string().optional(),
  adres: AdresSchema.optional(),
  logoBestandId: z.string().optional(),
});

export const AfwijkingSchema = z.strictObject({
  regelId: z.string(),
  nodeId: Id,
  /** Verplichte tekst van minstens 10 tekens na het wegknippen van witruimte (spec §6.2). */
  motivatie: z.string().refine((tekst) => tekst.trim().length >= 10, {
    message: "motivatie moet minstens 10 tekens bevatten",
  }),
  door: z.string(),
  datum: z.string(),
});

export const StroomtypeSchema = z.enum(["2x230V", "3x230V", "3N400V"]);

export const RuimteSchema = z.enum([
  "hal",
  "badkamer",
  "keuken",
  "wasplaats",
  "slaapkamer",
  "leefruimte",
  "garage",
  "kelder",
  "zolder",
  "buiten",
  "technisch",
  "andere",
]);

export const PolenSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

export const ToestelsoortSchema = z.enum([
  "wasmachine",
  "droogkast",
  "vaatwasser",
  "kookplaat",
  "oven",
  "boiler",
  "warmtepomp",
  "laadpaal",
  "omvormer",
  "pvPaneel",
  "bel",
  "motor",
  "ventilator",
  "koelkast",
  "diepvriezer",
  "andere",
]);

const basis = {
  id: Id,
  parentId: Id.nullable(),
  kinderen: z.array(Id),
  label: z.string().optional(),
  ruimte: RuimteSchema.optional(),
  /** Vrije naam; de ruimteclassificatie blijft afzonderlijk gelden voor controles. */
  ruimteNaam: z.string().optional(),
};

const positiefGeheel = z.number().int().min(1);
const positief = z.number().gt(0);

export const NodeSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...basis, type: z.literal("aansluiting") }),
  z.strictObject({ ...basis, type: z.literal("teller") }),
  z.strictObject({
    ...basis,
    type: z.literal("differentieel"),
    referentie: z.string().regex(/^[A-Z]+$/).optional(),
    gevoeligheid_mA: positief,
    nominaal_A: positief,
    polen: PolenSchema,
    klasse: z.enum(["AC", "A", "F", "B"]),
  }),
  z.strictObject({
    ...basis,
    type: z.literal("automaat"),
    kringCode: z.string().regex(/^[A-Z]+$/).optional(),
    nominaal_A: positief,
    polen: PolenSchema,
    curve: z.enum(["B", "C", "D"]),
    kortsluitvermogen_kA: z.number().optional(),
  }),
  z.strictObject({ ...basis, type: z.literal("zekering"), nominaal_A: positief, kringCode: z.string().regex(/^[A-Z]+$/).optional() }),
  z.strictObject({ ...basis, type: z.literal("verdeelbord"), naam: z.string().optional() }),
  z.strictObject({
    ...basis,
    type: z.literal("leiding"),
    // lege string = niet ingevuld
    kabeltype: z.string(),
    // 0 = niet ingevuld
    doorsnede_mm2: z.number().min(0),
    aantalGeleiders: positiefGeheel,
    /** Lengte van het tracé in meter; ontbrekend betekent nog niet opgemeten. */
    lengte_m: z.number().min(0).optional(),
    brandreactieklasse: z.string().max(64).optional(),
    aanleg: z.strictObject({ ligging: z.enum(["inbouw", "opbouw", "grond"]).optional(), inBuis: z.boolean() }).optional(),
  }),
  z.strictObject({
    ...basis,
    type: z.literal("contactdoos"),
    aantal: positiefGeheel,
    randaarde: z.boolean(),
    kinderbeveiliging: z.boolean(),
    waterdicht: z.boolean(),
  }),
  z.strictObject({
    ...basis,
    type: z.literal("lichtpunt"),
    aftakking: z.literal(true).optional(),
    aantal: positiefGeheel,
    soort: z.enum(["standaard", "led", "tl", "spot", "noodverlichting"]).optional(),
  }),
  z.strictObject({
    ...basis,
    type: z.literal("schakelaar"),
    aftakking: z.literal(true).optional(),
    soort: z.enum(["enkel", "dubbel", "wissel", "kruis", "dimmer", "drukknop"]),
    waterdicht: z.boolean(),
  }),
  z.strictObject({
    ...basis,
    type: z.literal("toestel"),
    soort: ToestelsoortSchema,
    vermogen_W: z.number().optional(),
  }),
]);

/** Versioned source alongside the exported raster; coordinates are in centimetres. */
export const PlanTekeningSchema = z.strictObject({
  formaat: z.literal("openplan3d-v1"),
  project: z.string().max(1_000_000).refine((tekst) => {
    try {
      const data = JSON.parse(tekst);
      return data !== null && !Array.isArray(data) && Array.isArray(data.floors);
    } catch { return false; }
  }, "Ongeldig OpenPlan3D-project"),
  kader: z.strictObject({
    x_cm: z.number().finite(),
    y_cm: z.number().finite(),
    pxPerCm: z.number().finite().positive().max(10),
  }),
});

export type PlanTekening = z.infer<typeof PlanTekeningSchema>;

export const SituatiePaginaSchema = z.strictObject({
  id: z.string(),
  titel: z.string(),
  referentie: z.boolean().optional(),
  afdruk: z.strictObject({ papier: z.enum(["A4", "A3"]), orientatie: z.enum(["staand", "liggend"]), schaalmodus: z.enum(["passend", "gekalibreerd"]) }).optional(),
  tekening: PlanTekeningSchema.optional(),
  /** Factor ten opzichte van het oorspronkelijke formaat; ontbrekend betekent 1. */
  symboolSchaal: z.number().min(0.25).max(4).optional(),
  labelSchaal: z.number().min(0.25).max(4).optional(),
  achtergrond: z
    .strictObject({
      origineelBestandId: z.string(),
      rasterBestandId: z.string(),
      pdfPagina: z.number().optional(),
      bronUitsnede: z.strictObject({ x: z.number().finite().min(0), y: z.number().finite().min(0), breedte: z.number().finite().positive(), hoogte: z.number().finite().positive(), rotatie: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]) }).optional(),
      breedte_px: z.number(),
      hoogte_px: z.number(),
      schaal: z.strictObject({ mmPerPx: z.number() }).optional(),
    })
    .optional(),
  plaatsingen: z.array(
    z.strictObject({
      nodeId: Id,
      x: z.number(),
      y: z.number(),
      rotatie: z.number(),
      /** Extra verschuiving ten opzichte van de standaard labelpositie, in rasterpixels. */
      labelOffset: z.strictObject({ x: z.number(), y: z.number() }).optional(),
    }),
  ),
});

/** De talen van een dossier; dezelfde drie als `Taal` in @elentrik/arei en @elentrik/render. */
export const TaalSchema = z.enum(["nl", "fr", "en"]);

export const InstallatieDocumentSchema = z.strictObject({
  id: z.string(),
  schemaVersion: z.literal(SCHEMA_VERSIE),
  regelset: z.string(),
  meta: z.strictObject({
    klant: PartijSchema,
    installateur: PartijSchema,
    keuringsorganisme: PartijSchema.optional(),
    werfadres: AdresSchema,
    ean: z.string().optional(),
    datum: z.string(),
    versieLabel: z.string().optional(),
    /** De taal van het dossier (print en export). Afwezig betekent `nl`. */
    dossierTaal: TaalSchema.optional(),
    /** Afwezig bij oudere dossiers: toepasselijkheid moet nog worden gecontroleerd. */
    installatieContext: z.enum(["nieuw", "bestaand", "onbekend"]).optional(),
  }),
  voeding: z.strictObject({ stroomtype: StroomtypeSchema }),
  rootId: Id,
  nodes: z.record(Id, NodeSchema),
  situatie: z.strictObject({ paginas: z.array(SituatiePaginaSchema) }),
  afwijkingen: z.array(AfwijkingSchema),
});

export type Taal = z.infer<typeof TaalSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node["type"];
export type NodeVan<T extends NodeType> = Extract<Node, { type: T }>;
export type InstallatieDocument = z.infer<typeof InstallatieDocumentSchema>;
export type Partij = z.infer<typeof PartijSchema>;
export type Adres = z.infer<typeof AdresSchema>;
export type Afwijking = z.infer<typeof AfwijkingSchema>;
export type SituatiePagina = z.infer<typeof SituatiePaginaSchema>;
export type Plaatsing = SituatiePagina["plaatsingen"][number];
export type Ruimte = z.infer<typeof RuimteSchema>;
export type Toestelsoort = z.infer<typeof ToestelsoortSchema>;
export type Polen = z.infer<typeof PolenSchema>;
export type Stroomtype = z.infer<typeof StroomtypeSchema>;
