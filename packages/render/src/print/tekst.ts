// Tekst passend maken in een vak van vaste breedte, met de geschatte breedte uit `layout`.
import { tekstBreedte } from "@elentrik/layout";
import { escapeXml, getal } from "@elentrik/symbols";

const WEGLATING = "…";

/**
 * Gewone witruimte: hier mag een regel breken. De vaste spaties U+00A0 en U+202F staan er bewust
 * niet bij (`\s` omvat ze wel): Frans zet er een voor ":", ";", "?" en "!" en gebruikt U+202F als
 * duizendtalscheiding, en die moeten bij hun woord blijven.
 */
const WITRUIMTE = /[ \t\n\r\f\v]+/;

/** Hoeveel tekens (UTF-16-eenheden, zoals `tekstBreedte` telt) er in `breedte_mm` passen. */
function tekensPerRegel(breedte_mm: number, grootte_mm: number): number {
  const perTeken = tekstBreedte("x", grootte_mm);
  // De kleine marge vangt afrondingsfouten op, zoals 20 / 1.5 = 13.333…
  return perTeken > 0 ? Math.floor(breedte_mm / perTeken + 1e-9) : 0;
}

/** Knipt na `n` eenheden, maar nooit midden in een surrogaatpaar. */
function knip(tekst: string, n: number): string {
  const code = tekst.charCodeAt(n - 1);
  return code >= 0xd800 && code <= 0xdbff ? tekst.slice(0, n - 1) : tekst.slice(0, n);
}

/**
 * De tekst ongewijzigd als hij in `breedte_mm` past, anders afgekort met "…" zodat hij past.
 * Waar zelfs "…" niet in past, geeft dit een lege tekst.
 */
export function afkorten(tekst: string, breedte_mm: number, grootte_mm: number): string {
  if (tekstBreedte(tekst, grootte_mm) <= breedte_mm) return tekst;
  const n = tekensPerRegel(breedte_mm, grootte_mm);
  if (n < 1) return "";
  return knip(tekst, n - WEGLATING.length).trimEnd() + WEGLATING;
}

export type BreekOpties = {
  /**
   * Cijfers tellen op de gewone schatting van `tekstBreedte` (0,6 em; het breedste cijfer in Noto Sans
   * en Arial is 0,572 em) in plaats van met `factor`: een EAN of telefoonnummer blijft zo vaker heel.
   */
  smalleCijfers?: boolean;
  /** Een woord mag ook na een koppelteken breken ("Sint-" / "Truiden"), vóór het hard gebroken wordt. */
  koppeltekens?: boolean;
};

/**
 * Breekt de tekst greedy op woorden in regels die elk in `breedte_mm` passen. Witruimte wordt
 * samengevoegd, een regeleinde blijft een regeleinde, een woord dat langer is dan een regel wordt
 * hard gebroken. Een lege tekst geeft geen regels. Gooit een `RangeError` als er geen teken past.
 * `factor` vermenigvuldigt de geschatte tekenbreedte: groter dan 1 is voorzichtiger (minder tekens per regel).
 */
export function breekRegels(tekst: string, breedte_mm: number, grootte_mm: number, factor = 1, opties: BreekOpties = {}): string[] {
  const max = tekensPerRegel(breedte_mm / factor, grootte_mm);
  if (max < 1) throw new RangeError(`Geen teken past in ${breedte_mm} mm bij ${grootte_mm} mm`);
  // Zonder smalle cijfers telt elk teken voor één: dan is dit exact het aantal tekens per regel.
  const ruimte = opties.smalleCijfers ? breedte_mm / factor / tekstBreedte("x", grootte_mm) + 1e-9 : max;
  const gewicht = (code: number) => (opties.smalleCijfers && code >= 48 && code <= 57 ? 1 / factor : 1);
  const past = (regel: string) => {
    if (!opties.smalleCijfers) return regel.length <= ruimte;
    let n = 0;
    for (let i = 0; i < regel.length; i++) n += gewicht(regel.charCodeAt(i));
    return n <= ruimte;
  };
  /** Het langste begin van `woord` dat op een regel past. */
  const passendBegin = (woord: string) => {
    let n = 0;
    let i = 0;
    while (i < woord.length && n + gewicht(woord.charCodeAt(i)) <= ruimte) n += gewicht(woord.charCodeAt(i++));
    // Bij één teken per regel kan een surrogaatpaar niet geknipt worden; het gaat dan heel mee.
    return knip(woord, i) || woord.slice(0, 2);
  };
  const regels: string[] = [];
  for (const alinea of tekst.split("\n")) {
    let regel = "";
    for (const woord of alinea.split(WITRUIMTE).filter((w) => w !== "")) {
      // Na een koppelteken volgt het volgende deel zonder spatie.
      const delen = opties.koppeltekens ? woord.split(/(?<=-)(?=[^-])/) : [woord];
      for (const [i, origineel] of delen.entries()) {
        let deel = origineel;
        const verbinding = i === 0 ? " " : "";
        if (regel !== "" && past(regel + verbinding + deel)) {
          regel += verbinding + deel;
          continue;
        }
        if (regel !== "") regels.push(regel);
        while (!past(deel)) {
          const stuk = passendBegin(deel);
          regels.push(stuk);
          deel = deel.slice(stuk.length);
        }
        regel = deel;
      }
    }
    if (regel !== "") regels.push(regel);
  }
  return regels;
}

/** Rondt een breedte af naar beneden op 2 decimalen, zodat de geschreven breedte nooit groter is. */
export function vloer(mm: number): number {
  return Math.floor(mm * 100 + 1e-9) / 100;
}

/**
 * Eén tekstregel als `<div class="t …">` met een vaste breedte en tekstgrootte in mm. Witruimte
 * (ook regeleinden en tabs, maar niet de vaste spaties) wordt één spatie, zodat de regel nooit hoger wordt; daarna wordt de
 * tekst afgekort tot hij past en geëscaped.
 */
export function tekstRegel(tekst: string, breedte_mm: number, grootte_mm: number, klasse = ""): string {
  const breedte = vloer(breedte_mm);
  const eenRegel = tekst.split(WITRUIMTE).filter((w) => w !== "").join(" ");
  const klassen = klasse === "" ? "t" : `t ${klasse}`;
  return (
    `<div class="${klassen}" style="width:${getal(breedte)}mm;font-size:${getal(grootte_mm)}mm">` +
    `${escapeXml(afkorten(eenRegel, breedte, grootte_mm))}</div>`
  );
}
