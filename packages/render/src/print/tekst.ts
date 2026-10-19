// Tekst passend maken in een vak van vaste breedte, met de geschatte breedte uit `layout`.
import { tekstBreedte } from "@elentrik/layout";
import { escapeXml, getal } from "@elentrik/symbols";

const WEGLATING = "…";

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

/**
 * Breekt de tekst greedy op woorden in regels die elk in `breedte_mm` passen. Witruimte wordt
 * samengevoegd, een regeleinde blijft een regeleinde, een woord dat langer is dan een regel wordt
 * hard gebroken. Een lege tekst geeft geen regels. Gooit een `RangeError` als er geen teken past.
 */
export function breekRegels(tekst: string, breedte_mm: number, grootte_mm: number): string[] {
  const max = tekensPerRegel(breedte_mm, grootte_mm);
  if (max < 1) throw new RangeError(`Geen teken past in ${breedte_mm} mm bij ${grootte_mm} mm`);
  const regels: string[] = [];
  for (const alinea of tekst.split("\n")) {
    let regel = "";
    for (let woord of alinea.split(/\s+/).filter((w) => w !== "")) {
      if (regel !== "" && regel.length + 1 + woord.length <= max) {
        regel += ` ${woord}`;
        continue;
      }
      if (regel !== "") regels.push(regel);
      while (woord.length > max) {
        // Bij één teken per regel kan een surrogaatpaar niet geknipt worden; het gaat dan heel mee.
        const stuk = knip(woord, max) || woord.slice(0, 2);
        regels.push(stuk);
        woord = woord.slice(stuk.length);
      }
      regel = woord;
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
 * Eén tekstregel als `<div class="t …">` met een vaste breedte en tekstgrootte in mm. De tekst wordt
 * afgekort tot hij past en daarna geëscaped.
 */
export function tekstRegel(tekst: string, breedte_mm: number, grootte_mm: number, klasse = ""): string {
  const breedte = vloer(breedte_mm);
  const klassen = klasse === "" ? "t" : `t ${klasse}`;
  return (
    `<div class="${klassen}" style="width:${getal(breedte)}mm;font-size:${getal(grootte_mm)}mm">` +
    `${escapeXml(afkorten(tekst, breedte, grootte_mm))}</div>`
  );
}
