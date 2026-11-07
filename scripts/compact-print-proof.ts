import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { InstallatieDocument } from "../packages/model/src/index";
import { analyseer } from "../packages/arei/src/index";
import { compactSchemaFixture } from "../packages/render/test/fixtures/compact-schema";
import { printHtml } from "../packages/render/src/index";
import { maakPdf } from "../apps/web/server/pdf/gotenberg";

// Synthetic pagination evidence only; no claim to reproduce the saved UI project or certify it.
const output = process.argv[2] ?? "out/compact-print/after";
await mkdir(output, { recursive: true });
const doc: InstallatieDocument = process.argv[3]
  ? JSON.parse((await readFile(process.argv[3], "utf8")).replace(/^\uFEFF/, ""))
  : structuredClone(compactSchemaFixture());
if (!process.argv[3]) doc.meta.klant.naam = "Synthetische bronstructuur — 16 kringen";
doc.meta.datum = "2026-11-06";
await writeFile(`${output}/fixture.json`, JSON.stringify(doc, null, 2));
const manifest = [];
for (const taal of ["nl", "fr", "en"] as const) {
  const r = printHtml(doc, analyseer(doc), [], {
    papier: "A3", taal, datum: doc.meta.datum, versieLabel: "Compacte afdruk — structurele proef",
    onderdelen: { eendraadschema: true, situatieschema: false, kringenlijst: false, bijlage: false },
    installateur: { naam: "TEST — geen uitvoeringsdossier" }, afbeeldingen: {},
  });
  await writeFile(`${output}/${taal}.html`, r.html);
  await writeFile(`${output}/${taal}.pdf`, await maakPdf({ html: r.html, papier: "A3", bestanden: [] }));
  const layout = r.html.split('<section class="pagina">').slice(1).map(p => ({
    schaal: Number(p.match(/scale\(([^)]+)\)/)?.[1]), symbolen: (p.match(/data-node-id=/g) ?? []).length,
  }));
  manifest.push({ taal, paginas: r.paginas, layout });
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
