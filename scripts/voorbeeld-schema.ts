import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  referentieAppartement,
  referentieMetOnderbord,
  referentieRijwoning,
  referentieWoning,
} from "../packages/arei/src/testing/index";
import { opmaak } from "../packages/layout/src/index";
import { schemaPaginaSvg, schemaStripSvg } from "../packages/render/src/index";

/**
 * Schrijft van elke referentie-installatie een strook en alle A4-pagina's naar
 * `out/`, plus `out/index.html` om ze samen te bekijken.
 */
const uitMap = join(import.meta.dirname, "..", "out");
mkdirSync(uitMap, { recursive: true });

const referenties = [
  { naam: "appartement", bouw: referentieAppartement },
  { naam: "rijwoning", bouw: referentieRijwoning },
  { naam: "woning", bouw: referentieWoning },
  { naam: "met-onderbord", bouw: referentieMetOnderbord },
];

const secties: string[] = [];
for (const { naam, bouw } of referenties) {
  const o = opmaak(bouw());
  const bestanden: string[] = [];
  const schrijf = (bestand: string, svg: string): void => {
    writeFileSync(join(uitMap, bestand), svg, "utf8");
    bestanden.push(bestand);
    console.log(`out/${bestand}`);
  };
  schrijf(`${naam}-strook.svg`, schemaStripSvg(o));
  for (const pagina of o.paginas) {
    schrijf(`${naam}-p${pagina.index + 1}.svg`, schemaPaginaSvg(o, pagina.index));
  }
  const afbeeldingen = bestanden
    .map((b) => `<img src="${b}" alt="${b}" style="display:block;max-width:100%;margin:0 0 1rem;border:1px solid #ccc">`)
    .join("\n    ");
  secties.push(`  <section>\n    <h2>${naam}</h2>\n    ${afbeeldingen}\n  </section>`);
}

const html = `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <title>Eendraadschema's</title>
</head>
<body style="font-family:sans-serif;margin:1rem">
  <h1>Referentie-installaties</h1>
${secties.join("\n")}
</body>
</html>
`;
writeFileSync(join(uitMap, "index.html"), html, "utf8");
console.log("out/index.html");
