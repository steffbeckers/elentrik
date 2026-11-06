import type { MateriaalRij } from "@elentrik/model";
// Pure util: de CSV voor een Belgische Excel. `;` als scheidingsteken (Excel nl/fr-BE gebruikt de
// decimale komma), UTF-8 met BOM zodat accenten kloppen, CRLF, en velden met ; " of een regeleinde
// tussen aanhalingstekens (RFC 4180, met "" als ontsnapping).
// Het type heet `MateriaalRij` in @elentrik/model (niet `MateriaalRegel`).

type Taal = "nl" | "fr" | "en";
// Bewust hier en niet uit de vertaalbestanden: die worden voor de browser tot berichtfuncties gecompileerd.
const TEKSTEN: Record<Taal, { kop: [string, string, string, string]; stuk: string; stuks: string; meter: string }> = {
  nl: { kop: ["Materiaal", "Uitvoering", "Hoeveelheid", "Eenheid"], stuk: "stuk", stuks: "stuks", meter: "m" },
  fr: { kop: ["Matériel", "Exécution", "Quantité", "Unité"], stuk: "pièce", stuks: "pièces", meter: "m" },
  en: { kop: ["Material", "Specification", "Quantity", "Unit"], stuk: "pc", stuks: "pcs", meter: "m" },
};
const DECIMAAL: Record<Taal, string> = { nl: ",", fr: ",", en: "." };

export type MateriaalCsvOpties = {
  /** De leesbare uitvoering van een rij; zonder dit staan de eigenschappen als veld=waarde. */
  uitvoering?: (rij: MateriaalRij) => string;
  /** De vertaalde naam van het soort; zonder dit staat het soort zelf in de cel. */
  materiaal?: (rij: MateriaalRij) => string;
};

function veld(waarde: string): string {
  return /[;"\r\n]/.test(waarde) ? `"${waarde.replaceAll('"', '""')}"` : waarde;
}

export function materiaalCsv(regels: MateriaalRij[], taal: string, opties: MateriaalCsvOpties = {}): string {
  const t: Taal = taal === "fr" || taal === "en" ? taal : "nl";
  const tekst = TEKSTEN[t];
  const decimaal = DECIMAAL[t];
  const uitvoering = opties.uitvoering
    ?? ((r: MateriaalRij) => Object.entries(r.eigenschappen).map(([k, w]) => `${k}=${String(w)}`).join(" · "));
  const lijnen = [tekst.kop.map(veld).join(";")];
  for (const r of regels) {
    const onbekend = r.eenheid === "m" && r.ontbrekendeLengtes === r.nodeIds.length;
    const aantal = onbekend ? "" : String(Math.round(r.hoeveelheid * 1000) / 1000).replace(".", decimaal);
    const eenheid = r.eenheid === "m" ? tekst.meter : r.hoeveelheid === 1 ? tekst.stuk : tekst.stuks;
    lijnen.push([(opties.materiaal ?? ((x: MateriaalRij) => x.type))(r), uitvoering(r), aantal, eenheid].map(veld).join(";"));
  }
  return `\uFEFF${lijnen.join("\r\n")}\r\n`;
}

/** `<projectnaam>-materiaallijst.csv`, zonder tekens die in een bestandsnaam niet mogen. */
export function bestandsnaamMateriaalCsv(projectnaam: string): string {
  // eslint-disable-next-line no-control-regex
  const veilig = projectnaam.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim();
  return `${veilig || "project"}-materiaallijst.csv`;
}
