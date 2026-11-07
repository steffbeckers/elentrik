import type { MateriaalRij } from "@elentrik/model";
// Pure util: de CSV voor een Belgische Excel. `;` als scheidingsteken (Excel nl/fr-BE gebruikt de
// decimale komma), UTF-8 met BOM zodat accenten kloppen, CRLF, en velden met ; " of een regeleinde
// tussen aanhalingstekens (RFC 4180, met "" als ontsnapping).
// Het type heet `MateriaalRij` in @elentrik/model (niet `MateriaalRegel`).

/** Alle tekst komt uit de vertaalbestanden, aangereikt door de aanroeper: de util blijft puur. */
export type MateriaalCsvTeksten = {
  kop: { materiaal: string; uitvoering: string; hoeveelheid: string; eenheid: string };
  stuk: string;
  stuks: string;
  meter: string;
  /** Bij een leiding waarvan een deel van de lengtes ontbreekt. */
  lengteOntbreekt: string;
};

export type MateriaalCsvOpties = {
  teksten: MateriaalCsvTeksten;
  /** De leesbare uitvoering van een rij; zonder dit staan de eigenschappen als veld=waarde. */
  uitvoering?: (rij: MateriaalRij) => string;
  /** De vertaalde naam van het soort; zonder dit staat het soort zelf in de cel. */
  materiaal?: (rij: MateriaalRij) => string;
};

/** Excel voert cellen die met = + - @ (of tab/CR) beginnen uit als formule: een `'` ervoor houdt ze tekst. */
function veld(waarde: string): string {
  const veilig = /^[=+\-@\t\r]/.test(waarde) ? `'${waarde}` : waarde;
  return /[;"\r\n]/.test(veilig) ? `"${veilig.replaceAll('"', '""')}"` : veilig;
}

/**
 * De CSV voor een Belgische Excel: `;`, UTF-8 BOM, CRLF en de decimale komma in elke taal (het
 * scheidingsteken `;` richt zich al op een Belgische Excel). `_taal` houdt de handtekening gelijk aan
 * die van de lijst; de teksten zijn al vertaald.
 */
export function materiaalCsv(regels: MateriaalRij[], _taal: string, opties: MateriaalCsvOpties): string {
  const { teksten } = opties;
  const uitvoering = opties.uitvoering
    ?? ((r: MateriaalRij) => Object.entries(r.eigenschappen).map(([k, w]) => `${k}=${String(w)}`).join(" · "));
  const kop = [teksten.kop.materiaal, teksten.kop.uitvoering, teksten.kop.hoeveelheid, teksten.kop.eenheid];
  const lijnen = [kop.map(veld).join(";")];
  for (const r of regels) {
    const alleOntbreken = r.eenheid === "m" && r.ontbrekendeLengtes === r.nodeIds.length;
    const aantal = alleOntbreken ? "" : String(Math.round(r.hoeveelheid * 1000) / 1000).replace(".", ",");
    const eenheid = r.eenheid === "m" ? teksten.meter : r.hoeveelheid === 1 ? teksten.stuk : teksten.stuks;
    const deel = r.ontbrekendeLengtes > 0 && !alleOntbreken;
    const uitv = [uitvoering(r), deel ? teksten.lengteOntbreekt : ""].filter(Boolean).join(" · ");
    lijnen.push([(opties.materiaal ?? ((x: MateriaalRij) => x.type))(r), uitv, aantal, eenheid].map(veld).join(";"));
  }
  return `\uFEFF${lijnen.join("\r\n")}\r\n`;
}

/** `<projectnaam>-materiaallijst.csv`, zonder tekens die in een bestandsnaam niet mogen. */
export function bestandsnaamMateriaalCsv(projectnaam: string): string {
  // eslint-disable-next-line no-control-regex
  const veilig = projectnaam.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return `${veilig || "project"}-materiaallijst.csv`;
}
