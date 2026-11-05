// De cartouche: een strook van `cartoucheHoogte_mm` onderaan elke pagina, binnen de marge.
import { papierMaat, voedingTekst, type Papier } from "@elentrik/layout";
import type { Adres, InstallatieDocument, Partij } from "@elentrik/model";
import { escapeXml, getal } from "@elentrik/symbols";
import { LOCALES, type Taal, type Teksten } from "../teksten/index";
import { RAND_MM, REGELHOOGTE } from "./stijl";
import { breekRegels, tekstRegel, vloer } from "./tekst";

/** De binnenmarge van een vak in mm. */
const VAK_MARGE_MM = 1.5;
/** Tekstgrootte in de cartouche in mm (de minimale tekstgrootte). */
const TEKST_MM = 2.5;
/** Tekstgrootte van de paginatitel in mm. */
const TITEL_MM = 3.5;
/** Breedte van het logo en de ruimte tussen logo en tekst in mm. */
const LOGO_BREEDTE_MM = 18;
const LOGO_TUSSENRUIMTE_MM = 2;

/**
 * De vakken van links naar rechts, als aandeel van de breedte van de cartouche: installateur,
 * klant, werf, paginatitel en de twee handtekeningen.
 */
const AANDELEN = [0.25, 0.16, 0.16, 0.21, 0.11, 0.11];
const DATUM_FORMATTEERDERS = new Map<Taal, Intl.DateTimeFormat>();

export type CartoucheGegevens = {
  papier: Papier;
  teksten: Teksten;
  taal: Taal;
  meta: InstallatieDocument["meta"];
  voeding: InstallatieDocument["voeding"];
  installateur: Partij;
  logo: string | undefined;
  titel: string;
  /** Een ISO-datum (`2026-10-19`); de cartouche maakt haar op in de locale van `taal`. */
  datum: string;
  versieLabel: string;
  nummer: number;
  totaal: number;
};

function adresRegels(adres: Adres | undefined): [string, string] {
  if (!adres) return ["", ""];
  const bus = adres.bus ? ` bus ${adres.bus}` : "";
  return [`${adres.straat} ${adres.nummer}${bus}`.trim(), `${adres.postcode} ${adres.gemeente}`.trim()];
}

/**
 * Een ISO-datum (`2026-10-19`) als dag/maand/jaar met een jaar van vier cijfers, bv. `19/10/2026` (in elke taal; een dag onder de 10 heeft één cijfer: `5/03/2026`).
 * De datum is een kalenderdag zonder tijdzone: ze wordt in UTC opgemaakt. Wat geen ISO-datum is, blijft zoals het is.
 */
export function formatteerDatum(datum: string, taal: Taal): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datum.trim());
  if (!iso) return datum;
  const [jaar, maand, dag] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  const moment = new Date(Date.UTC(jaar, maand - 1, dag));
  // Een onmogelijke datum (30 februari) schuift door in `Date`: dan is het geen kalenderdag.
  if (moment.getUTCMonth() !== maand - 1 || moment.getUTCDate() !== dag) return datum;
  let formatter = DATUM_FORMATTEERDERS.get(taal);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(LOCALES[taal], { day: "numeric", month: "2-digit", year: "numeric", timeZone: "UTC" });
    DATUM_FORMATTEERDERS.set(taal, formatter);
  }
  return formatter.format(moment);
}

type VakInhoud = { soort: string; breedte: number; html: string; hoogte: number };

/** Wrap before measuring: exported fields retain every character, at readable size. */
function vakken(g: CartoucheGegevens): VakInhoud[] {
  const t = g.teksten;
  const breedte = papierMaat(g.papier.formaat, g.papier.orientatie).breedte - 2 * g.papier.marge_mm;
  type Veld = [string, string?, number?];
  const maak = (i: number, soort: string, velden: Veld[], metLogo = false): VakInhoud => {
    const vakBreedte = breedte * AANDELEN[i]! + (i === 0 ? 0 : RAND_MM);
    const inspringing = metLogo ? LOGO_BREEDTE_MM + LOGO_TUSSENRUIMTE_MM : 0;
    const tekstBreedte = vakBreedte - 2 * VAK_MARGE_MM - 2 * RAND_MM - inspringing;
    let hoogte = 0;
    const regels = velden.map(([tekst, klasse = "", grootte = TEKST_MM]) =>
      breekRegels(tekst, vloer(tekstBreedte), grootte, 1.35).map(regel => {
        hoogte += grootte * REGELHOOGTE;
        return tekstRegel(regel, tekstBreedte, grootte, klasse);
      }).join("")
    ).join("");
    return { soort, breedte: vakBreedte, hoogte, html: metLogo
      ? '<div class="kolom" style="margin-left:' + getal(inspringing) + 'mm">' + regels + '</div>'
      : regels };
  };
  const [i1, i2] = adresRegels(g.installateur.adres);
  const [k1, k2] = adresRegels(g.meta.klant.adres);
  const [w1, w2] = adresRegels(g.meta.werfadres);
  return [
    maak(0, "installateur", [[t.cartouche.installateur, "label"], [g.installateur.naam, "naam"], [i1], [i2], [g.installateur.telefoon ?? ""], [g.installateur.email ?? ""]], g.logo !== undefined),
    maak(1, "klant", [[t.cartouche.klant, "label"], [g.meta.klant.naam, "naam"], [k1], [k2]]),
    maak(2, "werf", [[t.cartouche.werf, "label"], [w1], [w2], [t.cartouche.ean + ": " + (g.meta.ean ?? "")], [voedingTekst(g.voeding.stroomtype), "voeding"]]),
    maak(3, "titel", [[g.titel, "titel", TITEL_MM], [t.cartouche.datum + ": " + formatteerDatum(g.datum, g.taal)], [t.cartouche.versie + ": " + g.versieLabel], [t.cartouche.pagina + " " + g.nummer + " / " + g.totaal, "paginanummer"]]),
    maak(4, "handtekening", [[t.cartouche.handtekeningInstallateur, "label"]]),
    maak(5, "handtekening", [[t.cartouche.handtekeningKeurder, "label"]]),
  ];
}

/** Reserve sufficient height for complete metadata before paginating the drawing/table. */
export function cartoucheHoogte(g: CartoucheGegevens): number {
  return Math.max(g.papier.cartoucheHoogte_mm, Math.ceil(Math.max(...vakken(g).map(v => v.hoogte)) + 2 * VAK_MARGE_MM + 2 * RAND_MM));
}

/** Complete escaped, multiline metadata; the same measurement is used by print pagination. */
export function cartouche(g: CartoucheGegevens): string {
  const inhoud = vakken(g);
  const hoogte = Math.max(g.papier.cartoucheHoogte_mm, Math.ceil(Math.max(...inhoud.map(v => v.hoogte)) + 2 * VAK_MARGE_MM + 2 * RAND_MM));
  const boven = papierMaat(g.papier.formaat, g.papier.orientatie).hoogte - g.papier.marge_mm - hoogte;
  let links = g.papier.marge_mm;
  return '<div class="cartouche">' + inhoud.map((vak, i) => {
    const logo = i === 0 && g.logo !== undefined
      ? '<img class="logo" src="' + escapeXml(g.logo) + '" alt="" style="left:' + getal(VAK_MARGE_MM) + 'mm;top:' + getal(VAK_MARGE_MM) + 'mm;width:' + getal(LOGO_BREEDTE_MM) + 'mm;height:' + getal(hoogte - 2 * VAK_MARGE_MM - 2 * RAND_MM) + 'mm">'
      : '';
    const html = '<div class="vak ' + vak.soort + '" style="left:' + getal(links) + 'mm;top:' + getal(boven) + 'mm;width:' + getal(vak.breedte) + 'mm;height:' + getal(hoogte) + 'mm;padding:' + getal(VAK_MARGE_MM) + 'mm">' + logo + vak.html + '</div>';
    links += vak.breedte - RAND_MM;
    return html;
  }).join('') + '</div>';
}
