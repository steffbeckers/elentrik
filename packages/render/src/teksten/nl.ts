import type { NodeType, NodeVan, Ruimte, Toestelsoort } from "@elentrik/model";

/** Alle vaste teksten van de pdf. `nl.ts` is het Nederlands; `fr.ts` en `en.ts` hebben exact dezelfde structuur. De termen volgen `docs/vertalingen.md`. */
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
    kringOmschrijving: string;
    puntOmschrijving: string;
    type: string;
    ruimte: string;
    beveiliging: string;
    differentieel: string;
    leiding: string;
  };
  /** Het differentieel in de kringenlijst: "{gevoeligheid} {eenheid} {type} {klasse}", bv. "30 mA type A". */
  differentieel: { eenheid: string; type: string };
  types: Record<NodeType, string>;
  /** Kleine letters: de soort staat tussen haakjes achter "Toestel". */
  toestelsoorten: Record<Toestelsoort, string>;
  ruimtes: Record<Ruimte, string>;
  schakelaarsoorten: Record<NodeVan<"schakelaar">["soort"], string>;
  lichtpuntsoorten: Record<NonNullable<NodeVan<"lichtpunt">["soort"]>, string>;
  controlebeperking: string;
  schaalAfdruk: string;
  metadata: { titel: string; verwijzing: string; naam: string; adres: string; straat: string; nummer: string; bus: string; postcode: string; gemeente: string; land: string; telefoon: string; email: string; ondernemingsnummer: string; keuringsorganisme: string; paginatitel: string };
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
  /** Het watermerk op de pdf van staging: de titel groot, de ondertitel in de taal van het dossier. */
  watermerk: { titel: string; ondertitel: string };
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
    kringOmschrijving: "Omschrijving kring",
    puntOmschrijving: "Omschrijving punt",
    punt: "Punt",
    type: "Type",
    ruimte: "Ruimte",
    beveiliging: "Beveiliging",
    differentieel: "Differentieel",
    leiding: "Leiding",
  },
  differentieel: { eenheid: "mA", type: "type" },
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
  metadata: {"titel":"Projectgegevens","verwijzing":"Zie projectgegevens","naam":"Naam","adres":"Adres","straat":"Straat","nummer":"Huisnummer","bus":"Bus","postcode":"Postcode","gemeente":"Gemeente","land":"Land","telefoon":"Telefoon","email":"E-mail","ondernemingsnummer":"Ondernemingsnummer","keuringsorganisme":"Keuringsorganisme","paginatitel":"Paginatitel"},
  schaalAfdruk: "Schaal bij afdruk op 100%",
  controlebeperking: "Voorlopige, beperkte automatische controles. Geen bewijs van AREI-conformiteit.",
  schakelaarsoorten: {"enkel":"enkel","dubbel":"dubbel","wissel":"wissel","kruis":"kruis","dimmer":"dimmer","drukknop":"drukknop"},
  lichtpuntsoorten: {"standaard":"standaard","led":"led","tl":"tl","spot":"spot","noodverlichting":"noodverlichting"},
  ruimtes: {
    hal: "Hal",
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
  watermerk: { titel: "STAGING", ondertitel: "Geen geldig document" },
};
