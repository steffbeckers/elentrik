// De CSS van het printdocument: één inline <style>, zonder externe lettertypes of links.
import { getal } from "@elentrik/symbols";

/** De lijndikte van kaders en tabelranden in mm. */
export const RAND_MM = 0.25;
/** De regelhoogte als factor van de tekstgrootte. */
export const REGELHOOGTE = 1.3;
/** De rijhoogte van de kringenlijst in mm. */
export const KRINGENLIJST_RIJ_MM = 6;
/** De horizontale binnenmarge van een cel in de kringenlijst in mm. */
export const CEL_MARGE_MM = 1;
/** De inspringing van de motivatie en de auteur van een afwijking in de bijlage, in mm. */
export const INSPRINGING_MM = 5;
/** De ruimte boven een kop in de bijlage, in mm. */
export const KOP_MARGE_MM = 2;

/** De stijl voor pagina's van `breedte` × `hoogte` mm. */
export function stijl(breedte: number, hoogte: number): string {
  const b = getal(breedte);
  const h = getal(hoogte);
  const rand = `${getal(RAND_MM)}mm solid #000`;
  return [
    `@page { size: ${b}mm ${h}mm; margin: 0 }`,
    "html, body { margin: 0; padding: 0; background: #fff; color: #000; }",
    "body { font-family: sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }",
    `.pagina { position: relative; width: ${b}mm; height: ${h}mm; overflow: hidden; break-after: page; page-break-after: always; }`,
    ".pagina:last-child { break-after: auto; page-break-after: auto; }",
    ".pagina > svg { position: absolute; left: 0; top: 0; }",
    `.t { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: ${REGELHOOGTE}; }`,
    // Alleen op tekstregels: "titel" is ook de klasse van een cartouchevak.
    ".t.label, .t.titel, .t.naam, .t.kop, .t.kolomkop { font-weight: bold; }",
    `.cartouche .vak { position: absolute; box-sizing: border-box; border: ${rand}; overflow: hidden; }`,
    ".cartouche .logo { position: absolute; object-fit: contain; object-position: left top; }",
    ".kader { position: absolute; overflow: hidden; }",
    ".kader > img, .kader > svg { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }",
    ".kader > svg { color: #000; }",
    // Geen <table>: met border-collapse is de rijafstand in Chromium groter dan de opgegeven hoogte.
    // Elke rij is exact KRINGENLIJST_RIJ_MM hoog, onderrand inbegrepen; de tabel geeft de boven- en linkerrand.
    `.kringen { position: absolute; box-sizing: border-box; border-top: ${rand}; border-left: ${rand}; }`,
    `.kringen .rij, .kringen .kopregel { display: flex; height: ${getal(KRINGENLIJST_RIJ_MM)}mm; }`,
    `.kringen .tabelcel { box-sizing: border-box; flex: none; height: ${getal(KRINGENLIJST_RIJ_MM)}mm; padding: 0 ${getal(CEL_MARGE_MM)}mm; ` +
      `border-right: ${rand}; border-bottom: ${rand}; display: flex; align-items: center; overflow: hidden; }`,
    ".bijlage { position: absolute; }",
    `.bijlage .motivatie, .bijlage .door { margin-left: ${getal(INSPRINGING_MM)}mm; }`,
    `.bijlage .kop { margin-top: ${getal(KOP_MARGE_MM)}mm; }`,
  ].join("\n");
}
