// Eén gepagineerd HTML-document voor de pdf (Gotenberg/Chromium). Elentrik pagineert zelf: elke
// pagina is een <section> met een vaste maat in mm, met een cartouche onderaan.
import { formatteerBericht, REGELSETS, type Analyse, type Bevinding, type Ernst } from "@elentrik/arei";
import { bruikbaar, opmaak, papierMaat, STANDAARD_PAPIER_A4, type Papier } from "@elentrik/layout";
import type { Adres, InstallatieDocument, NodeId, NodeType, NodeVan, Partij, SituatiePagina } from "@elentrik/model";
import { escapeXml, getal } from "@elentrik/symbols";
import { kringenlijst, type KringenlijstRij } from "../kringenlijst";
import { schemaPaginaSvg } from "../schema-svg";
import { situatieItems, symboolGrootte } from "../situatie-items";
import { situatieLaagSvg } from "../situatie-svg";
import { situatieAfdekkingenSvg } from "../situatie-afdekkingen";
import { bordVanNode, differentieelNaam, differentieelPlaatsen } from "../differentieelnaam";
import { dossierStatus, onderwerpLabel as onderwerpLabelGedeeld, ongeplaatstNaam } from "../dossierstatus";
import { LOCALES, TEKSTEN, type Taal, type Teksten } from "../teksten/index";
import { leesbareSchemaOpmaak } from "./leesbaar";
import { cartouche, cartoucheHoogte, formatteerDatum, formatteerGetal, meetwaardeTekst, metingVelden } from "./cartouche";
import { CEL_MARGE_MM, INSPRINGING_MM, KOP_MARGE_MM, KRINGENLIJST_RIJ_MM, RAND_MM, REGELHOOGTE, stijl } from "./stijl";
import { breekRegels, tekstRegel, vloer } from "./tekst";

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
  { sleutel: "kringOmschrijving", aandeel: 0.13 },
  { sleutel: "punt", aandeel: 0.06 },
  { sleutel: "puntOmschrijving", aandeel: 0.13 },
  { sleutel: "type", aandeel: 0.14 },
  { sleutel: "ruimte", aandeel: 0.10 },
  { sleutel: "beveiliging", aandeel: 0.12 },
  { sleutel: "differentieel", aandeel: 0.13 },
  { sleutel: "leiding", aandeel: 0.12 },
];

const ERNSTEN: readonly Ernst[] = ["fout", "waarschuwing", "info"];
type Pagina = { titel: string; inhoud: string; papier?: Papier };

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
  const schema = leesbareSchemaOpmaak(c.doc, c.papier, c.analyse);
  return schema.paginas.map((_, i) => ({ titel: c.teksten.paginatitels.eendraadschema, inhoud: schemaPaginaSvg(schema, i) }));
}
/** The exported raster is exactly the prepared editor crop. A calibrated print is tiled, never silently resized. */
function situatiePaginas(c: Context, pagina: SituatiePagina, bestand: string): Pagina[] {
  const achtergrond = pagina.achtergrond!;
  const { breedte_px, hoogte_px } = achtergrond;
  const gekalibreerd = pagina.afdruk?.schaalmodus === "gekalibreerd";
  const mmPerPx = achtergrond.schaal?.mmPerPx;
  if (gekalibreerd && !(mmPerPx && Number.isFinite(mmPerPx) && mmPerPx > 0)) throw new RangeError("Kalibreer eerst de definitieve uitsnede");
  const planHoogte = c.ruimte.hoogte - 6;
  const schaal = gekalibreerd ? mmPerPx! / (pagina.afdruk?.schaalNoemer ?? 100) : Math.min(c.ruimte.breedte / breedte_px, planHoogte / hoogte_px);
  const breedte = breedte_px * schaal;
  const hoogte = hoogte_px * schaal;
  const kolommen = Math.max(1, Math.ceil((breedte - 1e-7) / c.ruimte.breedte));
  const rijen = Math.max(1, Math.ceil((hoogte - 1e-7) / planHoogte));
  const grootte = symboolGrootte(achtergrond);
  const items = situatieItems(c.doc, c.analyse, pagina.id, c.terugval).map(item => {
    const node = c.doc.nodes[item.nodeId];
    return { ...item,
      labelGrootte_px: Math.max(item.labelGrootte_px ?? (item.symboolGrootte_px ?? grootte) * .45, 2.5 / schaal),
      // The meter contains native 2.5mm kWh text. Keep its whole glyph at least native size on
      // paper, centered at the saved placement; ordinary editor symbols keep their original size.
      ...(node?.type === "teller" ? { symboolGrootte_px: Math.max(item.symboolGrootte_px ?? grootte, Math.max(item.symbool.maat.breedte, item.symbool.maat.hoogte) / schaal), labelBuitenSymbool: true,
        // On a situation plan the short external stubs must not become accidental wiring to a
        // nearby board. Clip to the native meter frame, retaining its complete 0.35mm stroke.
        symbool: { ...item.symbool, svg: `<svg x="-0.2" y="1.3" width="10.4" height="9.4" viewBox="-0.2 1.3 10.4 9.4" overflow="hidden">${item.symbool.svg}</svg>` },
      } : {}),
      ...(node && (node.type === "contactdoos" || node.type === "lichtpunt") && node.aantal > 1 ? { aantalLabel: `×${node.aantal}` } : {}),
    };
  });
  const laag = situatieAfdekkingenSvg(pagina.afdekkingen) + situatieLaagSvg(items, grootte);
  const melding = { nl: "Passend op papier", fr: "Adapté au papier", en: "Fit to paper" }[c.taal];
  const bijschrift = gekalibreerd
    ? `${c.teksten.schaalAfdruk}: 1:${new Intl.NumberFormat(LOCALES[c.taal], { maximumFractionDigits: 1 }).format(pagina.afdruk?.schaalNoemer ?? 100)}`
    : `${melding}${mmPerPx ? ` — ${c.teksten.schaalAfdruk}: 1:${new Intl.NumberFormat(LOCALES[c.taal], { maximumFractionDigits: 1 }).format(mmPerPx / schaal)}` : ""}`;
  const resultaat: Pagina[] = [];
  for (let rij = 0; rij < rijen; rij++) for (let kolom = 0; kolom < kolommen; kolom++) {
    const links = c.papier.marge_mm + (kolommen === 1 ? (c.ruimte.breedte - breedte) / 2 : 0);
    const boven = c.papier.marge_mm + 6 + (rijen === 1 ? (planHoogte - hoogte) / 2 : 0);
    const tegelBreedte = Math.min(breedte, c.ruimte.breedte);
    const tegelHoogte = Math.min(hoogte, planHoogte);
    const tegel = kolommen * rijen > 1 ? ` (${kolom + 1}/${kolommen}, ${rij + 1}/${rijen})` : "";
    resultaat.push({ titel: `${c.teksten.paginatitels.situatieschema} — ${pagina.titel}${tegel}`, papier: c.papier, inhoud:
      `<div class="schaal" data-schaalmodus="${gekalibreerd ? "gekalibreerd" : "passend"}" style="left:${mm(c.papier.marge_mm)};top:${mm(c.papier.marge_mm)}">${escapeXml(bijschrift + tegel)}</div>` +
      `<div class="kader" data-situatie-pagina-id="${escapeXml(pagina.id)}" data-plan-breedte-mm="${getal(breedte)}" style="left:${mm(links)};top:${mm(boven)};width:${mm(tegelBreedte)};height:${mm(tegelHoogte)}">` +
      `<div style="position:absolute;left:${mm(-kolom * c.ruimte.breedte)};top:${mm(-rij * planHoogte)};width:${mm(breedte)};height:${mm(hoogte)}">` +
      `<img class="plan" src="${escapeXml(bestand)}" style="position:absolute;width:100%;height:100%" alt="">` +
      `<svg class="laag" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${getal(breedte_px)} ${getal(hoogte_px)}" style="position:absolute;width:100%;height:100%" preserveAspectRatio="none">${laag}</svg></div></div>` });
  }
  return resultaat;
}

function kringenlijstPaginas(c: Context): Pagina[] {
  const breedtes = KOLOMMEN.map((k, i) => c.ruimte.breedte * k.aandeel - (i === KOLOMMEN.length - 1 ? RAND_MM : 0));
  const binnen = (i: number) => breedtes[i]! - 2 * CEL_MARGE_MM - RAND_MM;
  // Veel punten delen type, kabel en beveiliging. Meet en escape die cellen één keer per export.
  const regelCache = new Map<string, string[]>();
  const celCache = new Map<string, string>();
  const regels = (teksten: readonly string[]) => teksten.map((tekst, i) => {
    const sleutel = `${i}:${tekst}`;
    let resultaat = regelCache.get(sleutel);
    if (!resultaat) {
      resultaat = breekRegels(tekst, vloer(binnen(i)), TABEL_TEKST_MM, 1.35);
      regelCache.set(sleutel, resultaat);
    }
    return resultaat;
  });
  const regelhoogte = TABEL_TEKST_MM * REGELHOOGTE;
  const hoogte = (aantal: number) => Math.max(KRINGENLIJST_RIJ_MM, aantal * regelhoogte + 2 * CEL_MARGE_MM + RAND_MM);
  const rij = (klasse: string, cellen: string[][], tekstKlasse: string) => {
    const h = hoogte(Math.max(1, ...cellen.map(cel => cel.length)));
    const html = '<div class="' + klasse + '" style="height:' + mm(h) + '">' + cellen.map((cel, i) => {
      const sleutel = `${i}:${tekstKlasse}:${cel.join("\n")}`;
      let resultaat = celCache.get(sleutel);
      if (!resultaat) {
        resultaat = '<div class="tabelcel" style="width:' + mm(breedtes[i]!) + '"><div>' + cel.map(regel => tekstRegel(regel, binnen(i), TABEL_TEKST_MM, tekstKlasse)).join('') + '</div></div>';
        celCache.set(sleutel, resultaat);
      }
      return resultaat;
    }).join('') + '</div>';
    return { html, hoogte: h };
  };
  const kop = rij("kopregel", regels(KOLOMMEN.map(k => c.teksten.kolommen[k.sleutel])), "kolomkop");
  const capaciteit = c.ruimte.hoogte - kop.hoogte - RAND_MM - 1;
  const groepHoogte = 6;
  const maxRegels = Math.floor((capaciteit - groepHoogte - 2 * CEL_MARGE_MM - RAND_MM) / regelhoogte);
  if (maxRegels < 1) throw new RangeError("Geen ruimte voor kringenlijstrijen");

  const paginas: Pagina[] = [];
  let body = "";
  let gebruikt = 0;
  let actieveGroep = "";
  const sluit = () => {
    paginas.push({ titel: c.teksten.paginatitels.kringenlijst, inhoud:
      '<div class="kringen" style="left:' + mm(c.papier.marge_mm) + ';top:' + mm(c.papier.marge_mm) + ';width:' + mm(c.ruimte.breedte) + '">' + kop.html + body + '</div>' });
    body = "";
    gebruikt = 0;
    actieveGroep = "";
  };
  const voegToe = (blok: { html: string; hoogte: number }, groep?: string) => {
    const extra = groep && groep !== actieveGroep ? groepHoogte : 0;
    if (body && gebruikt + blok.hoogte + extra > capaciteit) sluit();
    if (groep && groep !== actieveGroep) {
      body += `<div class="groepskop" style="height:${mm(groepHoogte)}">${tekstRegel(c.teksten.kolommen.kring + " " + groep, c.ruimte.breedte - 2, TABEL_TEKST_MM, "kop")}</div>`;
      gebruikt += groepHoogte;
      actieveGroep = groep;
    }
    body += blok.html;
    gebruikt += blok.hoogte;
  };
  const rijen = kringenlijst(c.doc, c.analyse, c.teksten);
  for (const r of rijen) {
    const cellen = regels(KOLOMMEN.map(k => r[k.sleutel]));
    const aantal = Math.max(1, ...cellen.map(cel => cel.length));
    // A single description may exceed a page. Split it without losing text and repeat its IDs.
    for (let start = 0; start < aantal; start += maxRegels) {
      const deel = cellen.map((cel, i) => start > 0 && (KOLOMMEN[i]!.sleutel === "kring" || KOLOMMEN[i]!.sleutel === "punt")
        ? cel : cel.slice(start, start + maxRegels));
      voegToe(rij("rij", deel, "cel"), r.kring);
    }
  }
  if (!rijen.length) voegToe({ html: '<div class="rij leeg" style="height:6mm">' + tekstRegel(c.teksten.geenKringen, c.ruimte.breedte - 2 * CEL_MARGE_MM, TABEL_TEKST_MM, "leeg") + "</div>", hoogte: 6 });
  if (body) sluit();
  return paginas;
}

/** Het AREI-artikel van een regel in de regelset van het document, of "" als het niet gekend is. */
function artikelVan(doc: InstallatieDocument, regelId: string): string {
  const regelset = Object.hasOwn(REGELSETS, doc.regelset) ? REGELSETS[doc.regelset] : undefined;
  return regelset?.regels.find((r) => r.id === regelId)?.artikel.trim() ?? "";
}

/** Het label van het onderwerp van een bevinding: het puntlabel, "Kring A" voor een kringbeveiliging, anders `nodeLabel`. */
function onderwerpLabel(c: Context, nodeId: NodeId): string {
  return onderwerpLabelGedeeld(c.doc, c.analyse, nodeId, c.teksten);
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

/** De kolommen van de tabel met differentieeltests, als aandeel van de tabelbreedte. */
const MEETTABEL_AANDELEN = [0.37, 0.21, 0.21, 0.21];
/** De tabel met differentieeltests is hooguit zo breed, in mm: smaller blijft ze leesbaar. */
const MEETTABEL_MAX_MM = 190;

/** De differentiëlen in de volgorde van het eendraadschema (diepte eerst vanaf de aansluiting). */
function differentiëlenInVolgorde(doc: InstallatieDocument, type: NodeType = "differentieel"): NodeId[] {
  const uit: NodeId[] = [];
  const bezocht = new Set<NodeId>();
  const stapel: NodeId[] = [doc.rootId];
  while (stapel.length) {
    const id = stapel.pop()!;
    if (bezocht.has(id) || !Object.hasOwn(doc.nodes, id)) continue;
    bezocht.add(id);
    const node = doc.nodes[id]!;
    if (node.type === type) uit.push(id);
    for (let i = node.kinderen.length - 1; i >= 0; i--) stapel.push(node.kinderen[i]!);
  }
  return uit;
}

/**
 * De geregistreerde metingen en de differentieeltests. Een ontbrekende waarde is "niet ingevuld";
 * er is geen grenswaarde en geen beoordeling, alleen de vaste zin die dat zegt.
 */
function metingBlokken(c: Context): Blok[] {
  const t = c.teksten;
  const m = t.metingen;
  const metingen = c.doc.meta.metingen;
  const breedte = c.ruimte.breedte;
  const regelHoogte = BIJLAGE_TEKST_MM * REGELHOOGTE;
  const blokken: Blok[] = [];
  const kop = (tekst: string) => blokken.push({
    html: tekstRegel(tekst, breedte, BIJLAGE_KOP_TEKST_MM, "kop"),
    hoogte: KOP_MARGE_MM + BIJLAGE_KOP_TEKST_MM * REGELHOOGTE,
    kop: true,
  });
  const tekst = (inhoud: string, klasse: string) => {
    for (const regel of breekRegels(inhoud, vloer(breedte), BIJLAGE_TEKST_MM, BIJLAGE_BREEDTE_FACTOR)) {
      blokken.push({ html: tekstRegel(regel, breedte, BIJLAGE_TEKST_MM, klasse), hoogte: regelHoogte, kop: false });
    }
  };
  kop(m.titel);
  for (const [label, waarde] of metingVelden(metingen, t, c.taal)) tekst(`${label}: ${waarde}`, "meting");
  if (metingen?.meettoestel) tekst(`${m.meettoestel}: ${metingen.meettoestel}`, "meting");
  if (metingen?.opmerking) tekst(`${m.opmerking}: ${metingen.opmerking}`, "meting");

  const ids = differentiëlenInVolgorde(c.doc);
  if (ids.length) {
    const tabelBreedte = Math.min(breedte, MEETTABEL_MAX_MM);
    const breedtes = MEETTABEL_AANDELEN.map(a => tabelBreedte * a);
    const rij = (cellen: string[], klasse: string, extra = "") => {
      const regels = cellen.map((cel, i) => breekRegels(cel, vloer(breedtes[i]! - CEL_MARGE_MM), BIJLAGE_TEKST_MM, BIJLAGE_BREEDTE_FACTOR));
      const hoogte = Math.max(1, ...regels.map(r => r.length)) * regelHoogte;
      return {
        html: `<div class="meetrij${klasse === "kolomkop" ? " kopregel" : ""}"${extra} style="height:${mm(hoogte)}">` +
          regels.map((r, i) => `<div style="width:${mm(breedtes[i]!)}">${r.map(regel => tekstRegel(regel, breedtes[i]! - CEL_MARGE_MM, BIJLAGE_TEKST_MM, klasse)).join("")}</div>`).join("") +
          "</div>",
        hoogte,
      };
    };
    kop(m.differentieeltests);
    // De kolomkop blijft bij de eerste rij (`kop: true`).
    blokken.push({ ...rij([m.referentie, m.gevoeligheid, m.resultaat, m.tijd], "kolomkop", ' data-tabel="differentieeltests"'), kop: true });
    const plaatsen = differentieelPlaatsen(c.doc, ids);
    const borden = differentiëlenInVolgorde(c.doc, "verdeelbord");
    const namen = new Map(ids.map(id => [id, differentieelNaam(c.doc.nodes[id] as NodeVan<"differentieel">, plaatsen.get(id) ?? 1, type => t.types[type])]));
    const aantalPerNaam = new Map<string, number>();
    for (const naam of namen.values()) aantalPerNaam.set(naam, (aantalPerNaam.get(naam) ?? 0) + 1);
    // De plaats telt per bord: alleen als twee namen anders gelijk zijn, komt de herkomst (bord of bovenliggend onderdeel) erbij.
    const herkomst = (id: NodeId): string | undefined => {
      if (aantalPerNaam.get(namen.get(id)!)! < 2) return undefined;
      const bord = bordVanNode(c.doc, id);
      if (bord !== undefined) {
        const node = c.doc.nodes[bord]!;
        return node.type === "verdeelbord" && node.naam?.trim() ? node.naam.trim() : `${t.types.verdeelbord} ${borden.indexOf(bord) + 1}`;
      }
      const ouder = c.doc.nodes[id]?.parentId;
      return ouder != null && Object.hasOwn(c.doc.nodes, ouder) ? t.types[c.doc.nodes[ouder]!.type] : undefined;
    };
    for (const id of ids) {
      const node = c.doc.nodes[id]!;
      if (node.type !== "differentieel") continue;
      // Dezelfde naam als in de editor.
      blokken.push({ ...rij([
        [namen.get(id), herkomst(id)].filter(Boolean).join(" · "),
        `${formatteerGetal(node.gevoeligheid_mA, c.taal)} mA`,
        node.testResultaat ? m.resultaten[node.testResultaat] : m.nietIngevuld,
        meetwaardeTekst(node.uitschakeltijd_ms, "ms", t, c.taal),
      ], "cel"), kop: false });
    }
  }
  tekst(m.geenBeoordeling, "bericht");
  return blokken;
}

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

  const dossier = dossierStatus(c.doc, c.analyse);
  if (!dossier.volledig) {
    const d = t.bijlage.dossier;
    kop(d.titel);
    tekst(d.uitleg, "bericht", volleBreedte);
    for (const veld of dossier.ontbreekt) tekst(d[veld], "bericht", volleBreedte);
    if (!dossier.plannen) tekst(d.plan, "bericht", volleBreedte);
    for (const pagina of c.doc.situatie.paginas.filter(p => !p.referentie && !p.achtergrond)) {
      tekst(`${pagina.titel} — ${d.zonderPlan}`, "bericht", volleBreedte);
    }
    for (const id of dossier.ongeplaatsteIds) {
      const onderwerp = ongeplaatstNaam(c.doc, c.analyse, id, c.teksten);
      tekst(`${onderwerp} — ${d.ongeplaatst}`, "bericht", volleBreedte);
    }
  }
  blokken.push(...metingBlokken(c));
  const voorBevindingen = blokken.length;
  const titels = { fout: t.bijlage.fouten, waarschuwing: t.bijlage.waarschuwingen, info: t.bijlage.info } as const;
  for (const ernst of ERNSTEN) {
    const lijst = bevindingen.filter((b) => b.ernst === ernst && (b.regelId !== "arei.situatie.niet-geplaatst" || b.afgeweken));
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
  if (dossier.volledig && blokken.length === voorBevindingen) tekst(t.bijlage.geenBevindingen, "leeg", volleBreedte);
  return blokken;
}

/** Verdeelt de blokken over pagina's; een kop blijft bij zijn eerste regel. */
/** `klasse` is de klasse van de tekstlaag: "bijlage", of "bijlage metingen" voor de slotpagina met metingen. */
function tekstPaginas(c: Context, blokken: readonly Blok[], titel: string, klasse = "bijlage"): Pagina[] {
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
    titel,
    inhoud:
      `<div class="${klasse}" style="left:${mm(c.papier.marge_mm)};top:${mm(c.papier.marge_mm)};` +
      `width:${mm(c.ruimte.breedte)};height:${mm(c.ruimte.hoogte)}">${groep.map((b) => b.html).join("")}</div>`,
  }));
}

function bijlagePaginas(c: Context, bevindingen: readonly Bevinding[], overgeslagen: readonly string[]): Pagina[] {
  return tekstPaginas(c, bijlageBlokken(c, bevindingen, overgeslagen), c.teksten.paginatitels.bijlage);
}

/** Volledige projectgegevens als het herhaalde cartouche anders te hoog zou worden. */
function metadataPaginas(c: Context, opties: PrintOpties, titels: readonly string[]): Pagina[] {
  const t = c.teksten;
  const blokken: Blok[] = [];
  const kop = (tekst: string) => blokken.push({
    html: tekstRegel(tekst, c.ruimte.breedte, BIJLAGE_KOP_TEKST_MM, "kop"),
    hoogte: KOP_MARGE_MM + BIJLAGE_KOP_TEKST_MM * REGELHOOGTE,
    kop: true,
  });
  const veld = (label: string, waarde: string | undefined) => {
    if (!waarde) return;
    for (const regel of breekRegels(`${label}: ${waarde}`, vloer(c.ruimte.breedte), BIJLAGE_TEKST_MM, BIJLAGE_BREEDTE_FACTOR)) {
      blokken.push({ html: tekstRegel(regel, c.ruimte.breedte, BIJLAGE_TEKST_MM, "metadata"), hoogte: BIJLAGE_TEKST_MM * REGELHOOGTE, kop: false });
    }
  };
  const adres = (a: Adres | undefined) => {
    if (!a) return;
    for (const sleutel of ["straat", "nummer", "bus", "postcode", "gemeente", "land"] as const) veld(t.metadata[sleutel], a[sleutel]);
  };
  const partij = (titel: string, p: Partij) => {
    kop(titel);
    veld(t.metadata.naam, p.naam);
    adres(p.adres);
    veld(t.metadata.ondernemingsnummer, p.ondernemingsnummer);
    veld(t.metadata.telefoon, p.telefoon);
    veld(t.metadata.email, p.email);
  };
  kop(t.metadata.titel);
  partij(t.cartouche.klant, c.doc.meta.klant);
  partij(t.cartouche.installateur, opties.installateur);
  if (c.doc.meta.keuringsorganisme) partij(t.metadata.keuringsorganisme, c.doc.meta.keuringsorganisme);
  kop(t.cartouche.werf);
  adres(c.doc.meta.werfadres);
  veld(t.cartouche.ean, c.doc.meta.ean);
  veld(t.cartouche.datum, formatteerDatum(opties.datum, c.taal));
  veld(t.cartouche.versie, opties.versieLabel);
  for (const titel of new Set(titels)) veld(t.metadata.paginatitel, titel);
  return tekstPaginas(c, blokken, t.metadata.titel);
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
  return doc.situatie.paginas.filter((p) => !p.referentie && bestandVan(p, afbeeldingen) === undefined).map((p) => p.titel);
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
  const beperking = !REGELSETS[doc.regelset]?.gepubliceerd;
  const cartoucheBasis = {
    papier, teksten, taal: opties.taal, meta: doc.meta, voeding: doc.voeding, installateur: opties.installateur,
    logo: opties.logo, datum: opties.datum, versieLabel: opties.versieLabel, nummer: 9999, totaal: 9999,
  };
  // Zonder bijlage komen de metingen op een eigen, korte slotpagina (anders staan ze in de bijlage).
  const titels = [teksten.paginatitels.bijlage, ...(onderdelen.bijlage ? [] : [teksten.metingen.titel])];
  if (onderdelen.eendraadschema) titels.push(teksten.paginatitels.eendraadschema);
  if (onderdelen.kringenlijst) titels.push(teksten.paginatitels.kringenlijst);
  if (onderdelen.situatieschema) {
    titels.push(...doc.situatie.paginas.filter(p => !p.referentie && bestandVan(p, opties.afbeeldingen) !== undefined)
      .map(p => `${teksten.paginatitels.situatieschema} — ${p.titel}`));
  }
  const volledigeHoogte = Math.max(...titels.map(titel => cartoucheHoogte({ ...cartoucheBasis, titel })));
  // Onbegrensde geldige invoer mag nooit alle tekenruimte innemen. De volledige gegevens
  // gaan dan naar vervolgpagina's, ook wanneer de gebruiker de bevindingenbijlage niet kiest.
  const metadataVervolg = volledigeHoogte > 60;
  const verwijzing = teksten.metadata.verwijzing;
  const cartoucheGegevens = metadataVervolg ? {
    ...cartoucheBasis,
    meta: {
      ...doc.meta,
      klant: { naam: verwijzing },
      werfadres: { straat: verwijzing, nummer: "", postcode: "", gemeente: "", land: "" },
      ean: verwijzing,
    },
    installateur: { naam: verwijzing },
    datum: verwijzing,
    versieLabel: verwijzing,
  } : cartoucheBasis;
  const cartoucheTitel = (titel: string) => metadataVervolg && titel.startsWith(`${teksten.paginatitels.situatieschema} — `)
    ? teksten.paginatitels.situatieschema : titel;
  const metadataHoogte = metadataVervolg
    ? Math.max(...[...titels.map(cartoucheTitel), teksten.metadata.titel].map(titel => cartoucheHoogte({ ...cartoucheGegevens, titel })))
    : volledigeHoogte;
  const beperkingHoogte = beperking ? 9 : 0;
  papier.cartoucheHoogte_mm = metadataHoogte + beperkingHoogte;
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
      if (pagina.referentie) continue;
      const bestand = bestandVan(pagina, opties.afbeeldingen);
      if (bestand === undefined) continue;
      const eigenPapier: Papier = { ...papier, cartoucheHoogte_mm: metadataHoogte, ...(pagina.afdruk ? { formaat: pagina.afdruk.papier, orientatie: pagina.afdruk.orientatie } : {}) };
      const eigenHoogte = cartoucheHoogte({ ...cartoucheGegevens, papier: eigenPapier, titel: cartoucheTitel(`${teksten.paginatitels.situatieschema} — ${pagina.titel}`) });
      eigenPapier.cartoucheHoogte_mm = eigenHoogte + beperkingHoogte;
      paginas.push(...situatiePaginas({ ...c, papier: eigenPapier, ruimte: bruikbaar(eigenPapier) }, pagina, bestand));
    }
  }
  if (onderdelen.kringenlijst) paginas.push(...kringenlijstPaginas(c));
  if (onderdelen.bijlage || paginas.length === 0) paginas.push(...bijlagePaginas(c, bevindingen, overgeslagen));
  else paginas.push(...tekstPaginas(c, metingBlokken(c), teksten.metingen.titel, "bijlage metingen"));
  if (metadataVervolg) paginas.push(...metadataPaginas(c, opties, titels));

  const totaal = paginas.length;
  const watermerk = opties.watermerk ? watermerkHtml(opties.watermerk) : "";
  const paginaStijlen = new Map<string, string>();
  const secties = paginas.map((pagina, i) => {
    const blad = pagina.papier ?? papier;
    const maat = papierMaat(blad.formaat, blad.orientatie);
    const naam = `blad${blad.formaat}${blad.orientatie ?? "liggend"}`;
    paginaStijlen.set(naam, `@page ${naam}{size:${maat.breedte}mm ${maat.hoogte}mm;margin:0}`);
    const footerHoogte = blad.cartoucheHoogte_mm - beperkingHoogte;
    paginaStijlen.set(`pagina${i}`, `.pagina:nth-of-type(${i + 1}){page:${naam};width:${mm(maat.breedte)};height:${mm(maat.hoogte)}}`);
    return `<section class="pagina">${pagina.inhoud}${cartouche({
      ...cartoucheGegevens, papier: { ...blad, cartoucheHoogte_mm: footerHoogte }, titel: cartoucheTitel(pagina.titel), nummer: i + 1, totaal,
    })}${beperking ? `<div class="controlebeperking" style="left:${mm(blad.marge_mm)};top:${mm(maat.hoogte - blad.marge_mm - footerHoogte - beperkingHoogte + 1)};width:${mm(bruikbaar(blad).breedte)}">${escapeXml(teksten.controlebeperking)}</div>` : ""}${watermerk}</section>`;
  });
  const maat = papierMaat(papier.formaat);
  const titel = [doc.meta.klant.naam, opties.versieLabel].filter((d) => d.trim() !== "").join(" — ");
  const html =
    "<!doctype html>\n" +
    `<html lang="${opties.taal}">\n<head>\n<meta charset="utf-8">\n` +
    `<title>${escapeXml(titel)}</title>\n` +
    `<style>\n${stijl(maat.breedte, maat.hoogte, opties.watermerk !== undefined)}\n${[...paginaStijlen.values()].join("\n")}\n</style>\n</head>\n<body>\n` +
    `${secties.join("\n")}\n</body>\n</html>\n`;
  return { html, paginas: totaal, overgeslagen };
}
