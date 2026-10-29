// De cartouche: een strook van `cartoucheHoogte_mm` onderaan elke pagina, binnen de marge.
import { papierMaat, type Papier } from "@elentrik/layout";
import type { Adres, InstallatieDocument, Partij } from "@elentrik/model";
import { escapeXml, getal } from "@elentrik/symbols";
import { LOCALES, type Taal, type Teksten } from "../teksten/index";
import { RAND_MM } from "./stijl";
import { afkorten, breekRegels, tekstRegel, vloer } from "./tekst";

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
const AANDELEN = [0.25, 0.16, 0.16, 0.25, 0.09, 0.09];

export type CartoucheGegevens = {
  papier: Papier;
  teksten: Teksten;
  taal: Taal;
  meta: InstallatieDocument["meta"];
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
  return new Intl.DateTimeFormat(LOCALES[taal], { day: "numeric", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(moment);
}

/** Het label van een handtekeningvak loopt over hoogstens twee regels: het vak is smal. */
function handtekening(label: string, breedte: number): string {
  const regels = breekRegels(label, vloer(breedte), TEKST_MM);
  // Wat niet op twee regels past, wordt op de tweede regel afgekort met "…".
  const getoond = regels.length > 2 ? [regels[0]!, afkorten(regels.slice(1).join(" "), vloer(breedte), TEKST_MM)] : regels;
  return getoond.map((r) => tekstRegel(r, breedte, TEKST_MM, "label")).join("");
}

type Vak = { links: number; boven: number; breedte: number; hoogte: number };

function vakHtml(soort: string, vak: Vak, inhoud: string): string {
  return (
    `<div class="vak ${soort}" style="left:${getal(vak.links)}mm;top:${getal(vak.boven)}mm;` +
    `width:${getal(vak.breedte)}mm;height:${getal(vak.hoogte)}mm;padding:${getal(VAK_MARGE_MM)}mm">${inhoud}</div>`
  );
}

/** De HTML van de cartouche voor één pagina; elke tekst wordt binnen zijn vak afgekort en geëscaped. */
export function cartouche(g: CartoucheGegevens): string {
  const { papier, teksten: t } = g;
  const maat = papierMaat(papier.formaat);
  const breedte = maat.breedte - 2 * papier.marge_mm;
  const boven = maat.hoogte - papier.marge_mm - papier.cartoucheHoogte_mm;
  const binnenHoogte = papier.cartoucheHoogte_mm - 2 * VAK_MARGE_MM - 2 * RAND_MM;

  const vakOp = (i: number) => {
    const aandeelLinks = AANDELEN.slice(0, i).reduce((som, a) => som + a, 0);
    // Elk vak na het eerste schuift één randdikte naar links, zodat aangrenzende randen samenvallen.
    const overlap = i === 0 ? 0 : RAND_MM;
    const vak: Vak = {
      links: papier.marge_mm + breedte * aandeelLinks - overlap,
      boven,
      breedte: breedte * (AANDELEN[i] ?? 0) + overlap,
      hoogte: papier.cartoucheHoogte_mm,
    };
    return { vak, tekstBreedte: vak.breedte - 2 * VAK_MARGE_MM - 2 * RAND_MM };
  };
  const [installateur, klant, werf, titel, hand1, hand2] = [vakOp(0), vakOp(1), vakOp(2), vakOp(3), vakOp(4), vakOp(5)];
  const regel = (tekst: string, b: number, klasse = "", grootte = TEKST_MM) => tekstRegel(tekst, b, grootte, klasse);

  // Logo en installateur.
  let logo = "";
  let installateurBreedte = installateur.tekstBreedte;
  let installateurInspringing = "";
  if (g.logo !== undefined) {
    logo =
      `<img class="logo" src="${escapeXml(g.logo)}" alt="" style="left:${getal(VAK_MARGE_MM)}mm;top:${getal(VAK_MARGE_MM)}mm;` +
      `width:${getal(LOGO_BREEDTE_MM)}mm;height:${getal(binnenHoogte)}mm">`;
    installateurBreedte -= LOGO_BREEDTE_MM + LOGO_TUSSENRUIMTE_MM;
    installateurInspringing = ` style="margin-left:${getal(LOGO_BREEDTE_MM + LOGO_TUSSENRUIMTE_MM)}mm"`;
  }
  const [iAdres1, iAdres2] = adresRegels(g.installateur.adres);
  const installateurHtml =
    logo +
    `<div class="kolom"${installateurInspringing}>` +
    regel(t.cartouche.installateur, installateurBreedte, "label") +
    regel(g.installateur.naam, installateurBreedte, "naam") +
    regel(iAdres1, installateurBreedte) +
    regel(iAdres2, installateurBreedte) +
    regel(g.installateur.telefoon ?? "", installateurBreedte) +
    regel(g.installateur.email ?? "", installateurBreedte) +
    "</div>";

  const [kAdres1, kAdres2] = adresRegels(g.meta.klant.adres);
  const klantHtml =
    regel(t.cartouche.klant, klant.tekstBreedte, "label") +
    regel(g.meta.klant.naam, klant.tekstBreedte, "naam") +
    regel(kAdres1, klant.tekstBreedte) +
    regel(kAdres2, klant.tekstBreedte);

  const [wAdres1, wAdres2] = adresRegels(g.meta.werfadres);
  const werfHtml =
    regel(t.cartouche.werf, werf.tekstBreedte, "label") +
    regel(wAdres1, werf.tekstBreedte) +
    regel(wAdres2, werf.tekstBreedte) +
    regel(`${t.cartouche.ean}: ${g.meta.ean ?? ""}`.trim(), werf.tekstBreedte);

  const titelHtml =
    regel(g.titel, titel.tekstBreedte, "titel", TITEL_MM) +
    regel(`${t.cartouche.datum}: ${formatteerDatum(g.datum, g.taal)}`, titel.tekstBreedte) +
    regel(`${t.cartouche.versie}: ${g.versieLabel}`, titel.tekstBreedte) +
    regel(`${t.cartouche.pagina} ${g.nummer} / ${g.totaal}`, titel.tekstBreedte, "paginanummer");

  return (
    '<div class="cartouche">' +
    vakHtml("installateur", installateur.vak, installateurHtml) +
    vakHtml("klant", klant.vak, klantHtml) +
    vakHtml("werf", werf.vak, werfHtml) +
    vakHtml("titel", titel.vak, titelHtml) +
    vakHtml("handtekening", hand1.vak, handtekening(t.cartouche.handtekeningInstallateur, hand1.tekstBreedte)) +
    vakHtml("handtekening", hand2.vak, handtekening(t.cartouche.handtekeningKeurder, hand2.tekstBreedte)) +
    "</div>"
  );
}
