// Eén gepagineerd HTML-document voor de pdf (Gotenberg/Chromium). Elentrik pagineert zelf: elke
// pagina is een <section> met een vaste maat in mm, met een cartouche onderaan.
import { formatteerBericht, REGELSETS, type Analyse, type Bevinding, type Ernst } from "@elentrik/arei";
import { bruikbaar, opmaak, papierMaat, STANDAARD_PAPIER_A4, type Papier } from "@elentrik/layout";
import type { InstallatieDocument, NodeId, NodeType, Partij, SituatiePagina } from "@elentrik/model";
import { escapeXml, getal } from "@elentrik/symbols";
import { kringenlijst, type KringenlijstRij } from "../kringenlijst";
import { schemaPaginaSvg } from "../schema-svg";
import { nodeLabel, situatieItems, symboolGrootte } from "../situatie-items";
import { situatieLaagSvg } from "../situatie-svg";
import { TEKSTEN, type Taal, type Teksten } from "../teksten/index";
import { cartouche, formatteerDatum } from "./cartouche";
import { CEL_MARGE_MM, INSPRINGING_MM, KOP_MARGE_MM, KRINGENLIJST_RIJ_MM, RAND_MM, REGELHOOGTE, stijl } from "./stijl";
import { breekRegels, tekstRegel, vloer } from "./tekst";

export { KRINGENLIJST_RIJ_MM } from "./stijl";

export type PrintOpties = {
  papier: "A4" | "A3";
  onderdelen: { eendraadschema: boolean; situatieschema: boolean; kringenlijst: boolean; bijlage: boolean };
  versieLabel: string;
  datum: string;
  taal: Taal;
  installateur: Partij;
  /** bestandId → de bestandsnaam waaronder het bestand naast `index.html` aan Gotenberg gegeven wordt. */
  afbeeldingen: Record<string, string>;
  /** De bestandsnaam van het logo. */
  logo?: string;
  /** Staging: een diagonaal, halfdoorzichtig watermerk op elke pagina. Zonder blijft de HTML ongewijzigd. */
  watermerk?: { titel: string; ondertitel: string };
};

export type PrintResultaat = {
  html: string;
  paginas: number;
  /** De titels van de situatiepagina's zonder achtergrond of zonder bestand in `afbeeldingen`. */
  overgeslagen: string[];
};

/** De hoogte van de kop van de kringenlijst in mm: één rij. */
export const KRINGENLIJST_KOP_MM = KRINGENLIJST_RIJ_MM;
/** Tekstgrootte in de kringenlijst en de bijlage, en van een kop in de bijlage, in mm. */
const TABEL_TEKST_MM = 3;
const BIJLAGE_TEKST_MM = 3;
/**
 * De bijlage breekt haar regels zelf af; een regel die toch te breed is, zou de browser stil afknippen.
 * Daarom rekent ze met een voorzichtige tekenbreedte: 0,6 em × 1,6 = 0,96 em per teken, breder dan de
 * breedste Latijnse letter van het sans-serif in Gotenberg (Noto Sans: "W" is 0,93 em).
 */
export const BIJLAGE_BREEDTE_FACTOR = 1.6;
const BIJLAGE_KOP_TEKST_MM = 4;
/** Speling onderaan de bijlage, voor afrondingen van de regelhoogte in de browser. */
const BIJLAGE_SPELING_MM = 1;

/** De kolommen van de kringenlijst met hun aandeel van de bruikbare breedte. */
const KOLOMMEN: readonly { sleutel: keyof Teksten["kolommen"] & keyof KringenlijstRij; aandeel: number }[] = [
  { sleutel: "kring", aandeel: 0.07 },
  { sleutel: "punt", aandeel: 0.07 },
  { sleutel: "type", aandeel: 0.2 },
  { sleutel: "ruimte", aandeel: 0.14 },
  { sleutel: "beveiliging", aandeel: 0.16 },
  { sleutel: "differentieel", aandeel: 0.16 },
  { sleutel: "leiding", aandeel: 0.2 },
];

const ERNSTEN: readonly Ernst[] = ["fout", "waarschuwing", "info"];

type Pagina = { titel: string; inhoud: string };

type Context = {
  doc: InstallatieDocument;
  analyse: Analyse;
  papier: Papier;
  ruimte: { breedte: number; hoogte: number };
  teksten: Teksten;
  taal: Taal;
  terugval: (type: NodeType) => string;
};

/** Het watermerk van een pagina; de opmaak staat in `stijl`. Zonder invloed op de rest van de pagina. */
function watermerkHtml(w: { titel: string; ondertitel: string }): string {
  return (
    `<div class="watermerk"><div class="watermerk-titel">${escapeXml(w.titel)}</div>` +
    `<div class="watermerk-ondertitel">${escapeXml(w.ondertitel)}</div></div>`
  );
}

function mm(waarde: number): string {
  return `${getal(waarde)}mm`;
}

function eendraadschemaPaginas(c: Context): Pagina[] {
  const schema = opmaak(c.doc, c.papier, c.analyse);
  return schema.paginas.map((_, i) => ({ titel: c.teksten.paginatitels.eendraadschema, inhoud: schemaPaginaSvg(schema, i) }));
}

/** Plan en symboollaag in één kader dat met behoud van verhouding in de bruikbare ruimte past, gecentreerd. */
function situatieInhoud(c: Context, pagina: SituatiePagina, bestand: string): string {
  const achtergrond = pagina.achtergrond!;
  const { breedte_px, hoogte_px } = achtergrond;
  const schaal = Math.min(c.ruimte.breedte / breedte_px, c.ruimte.hoogte / hoogte_px);
  const breedte = breedte_px * schaal;
  const hoogte = hoogte_px * schaal;
  const links = c.papier.marge_mm + (c.ruimte.breedte - breedte) / 2;
  const boven = c.papier.marge_mm + (c.ruimte.hoogte - hoogte) / 2;
  const laag = situatieLaagSvg(situatieItems(c.doc, c.analyse, pagina.id, c.terugval), symboolGrootte(achtergrond));
  return (
    `<div class="kader" style="left:${mm(links)};top:${mm(boven)};width:${mm(breedte)};height:${mm(hoogte)}">` +
    `<img class="plan" src="${escapeXml(bestand)}" alt="">` +
    `<svg class="laag" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${getal(breedte_px)} ${getal(hoogte_px)}" ` +
    `preserveAspectRatio="none">${laag}</svg></div>`
  );
}

/**
 * Rijen per kringenlijstpagina: wat onder de kop past in de bruikbare hoogte. De tabel heeft een
 * bovenrand van `RAND_MM`; elke rij (ook de kop) is exact `KRINGENLIJST_RIJ_MM` hoog, rand inbegrepen.
 */
export function kringenlijstRijenPerPagina(papier: Papier): number {
  const perPagina = Math.floor((bruikbaar(papier).hoogte - KRINGENLIJST_KOP_MM - RAND_MM) / KRINGENLIJST_RIJ_MM);
  if (perPagina <= 0) throw new RangeError(`Geen ruimte voor kringenlijstrijen op ${papier.formaat}`);
  return perPagina;
}

function kringenlijstPaginas(c: Context): Pagina[] {
  const rijen = kringenlijst(c.doc, c.analyse, c.teksten);
  const perPagina = kringenlijstRijenPerPagina(c.papier);
  // De tabel is even breed als de bruikbare ruimte, linkerrand inbegrepen: de laatste kolom geeft die op.
  const breedtes = KOLOMMEN.map((k, i) => c.ruimte.breedte * k.aandeel - (i === KOLOMMEN.length - 1 ? RAND_MM : 0));
  const celBreedte = (breedte: number) => breedte - 2 * CEL_MARGE_MM - RAND_MM;
  const cel = (tekst: string, breedte: number, klasse: string) =>
    `<div class="tabelcel" style="width:${mm(breedte)}">${tekstRegel(tekst, celBreedte(breedte), TABEL_TEKST_MM, klasse)}</div>`;
  const rij = (klasse: string, teksten: readonly string[], tekstKlasse: string) =>
    `<div class="${klasse}">${teksten.map((tekst, i) => cel(tekst, breedtes[i] ?? 0, tekstKlasse)).join("")}</div>`;
  const kop = rij("kopregel", KOLOMMEN.map((k) => c.teksten.kolommen[k.sleutel]), "kolomkop");
  const tabel = (body: string) =>
    `<div class="kringen" style="left:${mm(c.papier.marge_mm)};top:${mm(c.papier.marge_mm)};width:${mm(c.ruimte.breedte)}">` +
    `${kop}${body}</div>`;

  if (rijen.length === 0) {
    const leeg = `<div class="rij leeg">${cel(c.teksten.geenKringen, c.ruimte.breedte - RAND_MM, "leeg")}</div>`;
    return [{ titel: c.teksten.paginatitels.kringenlijst, inhoud: tabel(leeg) }];
  }
  const paginas: Pagina[] = [];
  for (let start = 0; start < rijen.length; start += perPagina) {
    const body = rijen
      .slice(start, start + perPagina)
      .map((r) => rij("rij", KOLOMMEN.map((k) => r[k.sleutel]), "cel"))
      .join("");
    paginas.push({ titel: c.teksten.paginatitels.kringenlijst, inhoud: tabel(body) });
  }
  return paginas;
}

/** Het AREI-artikel van een regel in de regelset van het document, of "" als het niet gekend is. */
function artikelVan(doc: InstallatieDocument, regelId: string): string {
  const regelset = Object.hasOwn(REGELSETS, doc.regelset) ? REGELSETS[doc.regelset] : undefined;
  return regelset?.regels.find((r) => r.id === regelId)?.artikel.trim() ?? "";
}

/** Het label van het onderwerp van een bevinding: het puntlabel, "Kring A" voor een kringbeveiliging, anders `nodeLabel`. */
function onderwerpLabel(c: Context, nodeId: NodeId): string {
  const punt = c.analyse.puntLabels[nodeId];
  if (punt) return punt;
  const kring = c.analyse.kringen.find((k) => k.beveiligingId === nodeId);
  if (kring) return `${c.teksten.kolommen.kring} ${kring.label}`;
  return nodeLabel(c.doc, c.analyse, nodeId, c.terugval);
}

/**
 * Een bevinding zoals een keurder ze leest: de labels van haar nodes, " — ", het bericht en het
 * AREI-artikel als dat gekend is. Interne regel-id's komen nooit in de pdf.
 */
function bevindingTekst(c: Context, b: Bevinding): string {
  const labels = [...new Set(b.nodeIds.map((id) => onderwerpLabel(c, id)).filter((l) => l !== ""))].join(", ");
  const artikel = artikelVan(c.doc, b.regelId);
  const bericht = formatteerBericht(b, c.taal) + (artikel === "" ? "" : ` (${c.teksten.bijlage.artikel} ${artikel})`);
  return labels === "" ? bericht : `${labels} — ${bericht}`;
}

/** Eén blok van de bijlage: een kop of een tekstregel, met zijn hoogte in mm. */
type Blok = { html: string; hoogte: number; kop: boolean };

function bijlageBlokken(c: Context, bevindingen: readonly Bevinding[], overgeslagen: readonly string[]): Blok[] {
  const t = c.teksten;
  const volleBreedte = c.ruimte.breedte;
  const ingesprongen = c.ruimte.breedte - INSPRINGING_MM;
  const blokken: Blok[] = [];
  const kop = (tekst: string) =>
    blokken.push({
      html: tekstRegel(tekst, volleBreedte, BIJLAGE_KOP_TEKST_MM, "kop"),
      hoogte: KOP_MARGE_MM + BIJLAGE_KOP_TEKST_MM * REGELHOOGTE,
      kop: true,
    });
  const tekst = (inhoud: string, klasse: string, breedte: number) => {
    for (const regel of breekRegels(inhoud, vloer(breedte), BIJLAGE_TEKST_MM, BIJLAGE_BREEDTE_FACTOR)) {
      blokken.push({ html: tekstRegel(regel, breedte, BIJLAGE_TEKST_MM, klasse), hoogte: BIJLAGE_TEKST_MM * REGELHOOGTE, kop: false });
    }
  };

  const titels = { fout: t.bijlage.fouten, waarschuwing: t.bijlage.waarschuwingen, info: t.bijlage.info } as const;
  for (const ernst of ERNSTEN) {
    const lijst = bevindingen.filter((b) => b.ernst === ernst);
    if (lijst.length === 0) continue;
    kop(`${titels[ernst]} (${lijst.length})`);
    for (const b of lijst) {
      const afgeweken = b.afgeweken ? ` (${t.bijlage.afgeweken})` : "";
      tekst(`${bevindingTekst(c, b)}${afgeweken}`, "bericht", volleBreedte);
    }
  }
  if (c.doc.afwijkingen.length > 0) {
    kop(`${t.bijlage.afwijkingen} (${c.doc.afwijkingen.length})`);
    for (const a of c.doc.afwijkingen) {
      // De afwijking toont de bevinding waarvoor ze geldt; zonder zo'n bevinding enkel het punt.
      const bevinding = bevindingen.find((b) => b.regelId === a.regelId && b.nodeIds[0] === a.nodeId);
      const onderwerp = bevinding ? bevindingTekst(c, bevinding) : onderwerpLabel(c, a.nodeId) || "—";
      tekst(onderwerp, "afwijking", volleBreedte);
      tekst(`${t.bijlage.motivatie}: ${a.motivatie}`, "motivatie", ingesprongen);
      tekst(`${t.bijlage.door}: ${a.door} — ${t.cartouche.datum}: ${formatteerDatum(a.datum, c.taal)}`, "door", ingesprongen);
    }
  }
  if (overgeslagen.length > 0) {
    kop(`${t.bijlage.overgeslagenPaginas} (${overgeslagen.length})`);
    for (const titel of overgeslagen) tekst(titel, "overgeslagen", volleBreedte);
  }
  if (blokken.length === 0) tekst(t.bijlage.geenBevindingen, "leeg", volleBreedte);
  return blokken;
}

/** Verdeelt de blokken over pagina's; een kop blijft bij zijn eerste regel. */
function bijlagePaginas(c: Context, bevindingen: readonly Bevinding[], overgeslagen: readonly string[]): Pagina[] {
  const blokken = bijlageBlokken(c, bevindingen, overgeslagen);
  const capaciteit = c.ruimte.hoogte - BIJLAGE_SPELING_MM;
  const groepen: Blok[][] = [[]];
  let gevuld = 0;
  blokken.forEach((blok, i) => {
    const volgende = blok.kop ? (blokken[i + 1]?.hoogte ?? 0) : 0;
    const huidige = groepen[groepen.length - 1]!;
    if (huidige.length > 0 && gevuld + blok.hoogte + volgende > capaciteit) {
      groepen.push([blok]);
      gevuld = blok.hoogte;
    } else {
      huidige.push(blok);
      gevuld += blok.hoogte;
    }
  });
  return groepen.map((groep) => ({
    titel: c.teksten.paginatitels.bijlage,
    inhoud:
      `<div class="bijlage" style="left:${mm(c.papier.marge_mm)};top:${mm(c.papier.marge_mm)};` +
      `width:${mm(c.ruimte.breedte)};height:${mm(c.ruimte.hoogte)}">${groep.map((b) => b.html).join("")}</div>`,
  }));
}

/** De bestandsnaam van het plan van een situatiepagina, of `undefined` zonder achtergrond of bestand. */
function bestandVan(pagina: SituatiePagina, afbeeldingen: Readonly<Record<string, string>>): string | undefined {
  const id = pagina.achtergrond?.rasterBestandId;
  return id !== undefined && Object.hasOwn(afbeeldingen, id) ? afbeeldingen[id] : undefined;
}

/**
 * De titels van de situatiepagina's die `printHtml` overslaat: zonder achtergrond, of zonder
 * bestand in `afbeeldingen`. De server gebruikt dit om de bijlage dan verplicht te maken.
 */
export function overgeslagenPaginas(doc: InstallatieDocument, afbeeldingen: Readonly<Record<string, string>>): string[] {
  return doc.situatie.paginas.filter((p) => bestandVan(p, afbeeldingen) === undefined).map((p) => p.titel);
}

/**
 * Het printdocument: de gekozen onderdelen in vaste volgorde (eendraadschema, situatieschema,
 * kringenlijst, bijlage), elk op pagina's met een cartouche. Situatiepagina's zonder achtergrond of
 * zonder bestand in `afbeeldingen` worden overgeslagen en in de bijlage vermeld. Levert dat geen
 * enkele pagina op, dan volgt de bijlage toch. Gooit een `RangeError` als alle onderdelen uit staan.
 */
export function printHtml(
  doc: InstallatieDocument,
  analyse: Analyse,
  bevindingen: readonly Bevinding[],
  opties: PrintOpties,
): PrintResultaat {
  const { onderdelen } = opties;
  if (!onderdelen.eendraadschema && !onderdelen.situatieschema && !onderdelen.kringenlijst && !onderdelen.bijlage) {
    throw new RangeError("Er is geen onderdeel gekozen om af te drukken");
  }
  const teksten = TEKSTEN[opties.taal];
  const papier: Papier = { ...STANDAARD_PAPIER_A4, formaat: opties.papier };
  const c: Context = {
    doc,
    analyse,
    papier,
    ruimte: bruikbaar(papier),
    teksten,
    taal: opties.taal,
    terugval: (type) => teksten.types[type],
  };

  const paginas: Pagina[] = [];
  const overgeslagen: string[] = [];
  if (onderdelen.eendraadschema) paginas.push(...eendraadschemaPaginas(c));
  if (onderdelen.situatieschema) {
    overgeslagen.push(...overgeslagenPaginas(doc, opties.afbeeldingen));
    for (const pagina of doc.situatie.paginas) {
      const bestand = bestandVan(pagina, opties.afbeeldingen);
      if (bestand === undefined) continue;
      paginas.push({
        titel: `${teksten.paginatitels.situatieschema} — ${pagina.titel}`,
        inhoud: situatieInhoud(c, pagina, bestand),
      });
    }
  }
  if (onderdelen.kringenlijst) paginas.push(...kringenlijstPaginas(c));
  if (onderdelen.bijlage || paginas.length === 0) paginas.push(...bijlagePaginas(c, bevindingen, overgeslagen));

  const totaal = paginas.length;
  const watermerk = opties.watermerk ? watermerkHtml(opties.watermerk) : "";
  const secties = paginas.map(
    (pagina, i) =>
      `<section class="pagina">${pagina.inhoud}${cartouche({
        papier,
        teksten,
        taal: opties.taal,
        meta: doc.meta,
        installateur: opties.installateur,
        logo: opties.logo,
        titel: pagina.titel,
        datum: opties.datum,
        versieLabel: opties.versieLabel,
        nummer: i + 1,
        totaal,
      })}${watermerk}</section>`,
  );
  const maat = papierMaat(papier.formaat);
  const titel = [doc.meta.klant.naam, opties.versieLabel].filter((d) => d.trim() !== "").join(" — ");
  const html =
    "<!doctype html>\n" +
    `<html lang="${opties.taal}">\n<head>\n<meta charset="utf-8">\n` +
    `<title>${escapeXml(titel)}</title>\n` +
    `<style>\n${stijl(maat.breedte, maat.hoogte, opties.watermerk !== undefined)}\n</style>\n</head>\n<body>\n` +
    `${secties.join("\n")}\n</body>\n</html>\n`;
  return { html, paginas: totaal, overgeslagen };
}
