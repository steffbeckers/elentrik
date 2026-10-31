// Maakt de PNG-iconen in public/ uit public/icoon.svg (de eigen getekende bliksemschicht). Eén keer
// draaien na een wijziging van het icoon; de PNG's worden gecommit.
//   node apps/web/scripts/maak-iconen.mjs
// De maskable variant en het apple-touch-icon krijgen een volle witte achtergrond (iOS vult
// transparantie zwart), met de schicht verkleind binnen de veilige zone (een cirkel van 80 %).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const publiek = (naam) => fileURLToPath(new URL(`../public/${naam}`, import.meta.url));

const svg = await readFile(publiek("icoon.svg"), "utf8");
const inhoud = svg.replace(/^\s*<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
const opAchtergrond =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<rect width="100" height="100" fill="#ffffff"/>' +
  `<g transform="translate(50 50) scale(0.72) translate(-50 -50)">${inhoud}</g></svg>`;

const iconen = [
  { naam: "icoon-192.png", maat: 192, bron: svg, transparant: true },
  { naam: "icoon-512.png", maat: 512, bron: svg, transparant: true },
  { naam: "icoon-maskable-512.png", maat: 512, bron: opAchtergrond, transparant: false },
  { naam: "apple-touch-icon.png", maat: 180, bron: opAchtergrond, transparant: false },
];

const browser = await chromium.launch();
try {
  const pagina = await browser.newPage();
  for (const { naam, maat, bron, transparant } of iconen) {
    await pagina.setViewportSize({ width: maat, height: maat });
    const groot = bron.replace("<svg ", `<svg width="${maat}" height="${maat}" `);
    await pagina.setContent(`<html><body style="margin:0;background:transparent">${groot}</body></html>`);
    const png = await pagina.locator("svg").screenshot({ omitBackground: transparant });
    await writeFile(publiek(naam), png);
    console.log(`${naam} (${maat}×${maat})`);
  }
} finally {
  await browser.close();
}
