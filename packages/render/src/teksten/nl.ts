import type { NodeType, Ruimte, Toestelsoort } from "@elentrik/model";

/** Alle vaste teksten van de pdf. De taal is Nederlands; de woorden volgen `apps/web/i18n/locales/nl.json`. */
export type Teksten = {
  paginatitels: { eendraadschema: string; situatieschema: string; kringenlijst: string; bijlage: string };
  cartouche: {
    klant: string;
    werf: string;
    installateur: string;
    ean: string;
    datum: string;
    versie: string;
    pagina: string;
    handtekeningInstallateur: string;
    handtekeningKeurder: string;
  };
  kolommen: {
    kring: string;
    punt: string;
    type: string;
    ruimte: string;
    beveiliging: string;
    differentieel: string;
    leiding: string;
  };
  types: Record<NodeType, string>;
  /** Kleine letters: de soort staat tussen haakjes achter "Toestel". */
  toestelsoorten: Record<Toestelsoort, string>;
  ruimtes: Record<Ruimte, string>;
  bijlage: {
    fouten: string;
    waarschuwingen: string;
    info: string;
    afwijkingen: string;
    overgeslagenPaginas: string;
    /** Achter een bevinding waarvoor een afwijking geldt, tussen haakjes. */
    afgeweken: string;
    /** Voor het artikelnummer van een regel, tussen haakjes achter het bericht. */
    artikel: string;
    motivatie: string;
    door: string;
    geenBevindingen: string;
  };
  geenKringen: string;
};

export const NL: Teksten = {
  paginatitels: {
    eendraadschema: "Eendraadschema",
    situatieschema: "Situatieschema",
    kringenlijst: "Kringenlijst",
    bijlage: "Bijlage",
  },
  cartouche: {
    klant: "Klant",
    werf: "Werf",
    installateur: "Installateur",
    ean: "EAN",
    datum: "Datum",
    versie: "Versie",
    pagina: "Pagina",
    handtekeningInstallateur: "Handtekening installateur",
    handtekeningKeurder: "Handtekening keurder",
  },
  kolommen: {
    kring: "Kring",
    punt: "Punt",
    type: "Type",
    ruimte: "Ruimte",
    beveiliging: "Beveiliging",
    differentieel: "Differentieel",
    leiding: "Leiding",
  },
  types: {
    aansluiting: "Aansluiting",
    teller: "Teller",
    differentieel: "Differentieel",
    automaat: "Automaat",
    zekering: "Zekering",
    verdeelbord: "Verdeelbord",
    leiding: "Leiding",
    contactdoos: "Contactdoos",
    lichtpunt: "Lichtpunt",
    schakelaar: "Schakelaar",
    toestel: "Toestel",
  },
  toestelsoorten: {
    wasmachine: "wasmachine",
    droogkast: "droogkast",
    vaatwasser: "vaatwasser",
    kookplaat: "kookplaat",
    oven: "oven",
    boiler: "boiler",
    warmtepomp: "warmtepomp",
    laadpaal: "laadpaal",
    omvormer: "omvormer",
    andere: "andere",
  },
  ruimtes: {
    badkamer: "Badkamer",
    keuken: "Keuken",
    wasplaats: "Wasplaats",
    slaapkamer: "Slaapkamer",
    leefruimte: "Leefruimte",
    garage: "Garage",
    kelder: "Kelder",
    zolder: "Zolder",
    buiten: "Buiten",
    technisch: "Technische ruimte",
    andere: "Andere",
  },
  bijlage: {
    fouten: "Fouten",
    waarschuwingen: "Waarschuwingen",
    info: "Info",
    afwijkingen: "Afwijkingen",
    overgeslagenPaginas: "Overgeslagen pagina's",
    afgeweken: "afgeweken",
    artikel: "AREI art.",
    motivatie: "Motivatie",
    door: "Door",
    geenBevindingen: "Geen bevindingen",
  },
  geenKringen: "Geen kringen",
};
