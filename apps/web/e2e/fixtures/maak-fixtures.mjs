// Maakt de testbestanden voor de end-to-end tests, zonder externe bibliotheken:
//   plan.png     1200 x 800, een eenvoudige plattegrond met lijnen
//   plan-2p.pdf  2 A4-pagina's met elk een lijntekening
// Gebruik: pnpm --filter @elentrik/web e2e:fixtures. De uitvoer staat in git; het script is deterministisch.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const map = dirname(fileURLToPath(import.meta.url));

// --- PNG -------------------------------------------------------------------

const CRC_TABEL = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABEL[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngBlok(type, data) {
  const kop = Buffer.alloc(4);
  kop.writeUInt32BE(data.length);
  const typeEnData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeEnData));
  return Buffer.concat([kop, typeEnData, crc]);
}

const BREEDTE = 1200;
const HOOGTE = 800;

function maakPlanPng() {
  // RGB, 8 bit; elke rij begint met filtertype 0 (geen filter).
  const rij = 1 + BREEDTE * 3;
  const pixels = Buffer.alloc(rij * HOOGTE, 0xff);
  for (let y = 0; y < HOOGTE; y++) pixels[y * rij] = 0;

  const zet = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= BREEDTE || y >= HOOGTE) return;
    const i = y * rij + 1 + x * 3;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  };
  const dikte = 3;
  const horizontaal = (y, x0, x1, kleur) => {
    for (let x = x0; x <= x1; x++) for (let d = 0; d < dikte; d++) zet(x, y + d, kleur);
  };
  const verticaal = (x, y0, y1, kleur) => {
    for (let y = y0; y <= y1; y++) for (let d = 0; d < dikte; d++) zet(x + d, y, kleur);
  };

  const zwart = [0x20, 0x20, 0x20];
  const grijs = [0xc8, 0xc8, 0xc8];
  // Raster van 100 px.
  for (let y = 100; y < HOOGTE; y += 100) horizontaal(y, 0, BREEDTE - 1, grijs);
  for (let x = 100; x < BREEDTE; x += 100) verticaal(x, 0, HOOGTE - 1, grijs);
  // Buitenmuren en twee binnenmuren.
  horizontaal(60, 100, 1100, zwart);
  horizontaal(736, 100, 1100, zwart);
  verticaal(100, 60, 738, zwart);
  verticaal(1098, 60, 738, zwart);
  verticaal(600, 60, 450, zwart);
  horizontaal(450, 100, 600, zwart);
  // Een diagonaal als herkenbaar kenmerk.
  for (let t = 0; t < 400; t++) for (let d = 0; d < dikte; d++) zet(700 + t, 200 + t + d, zwart);

  const kop = Buffer.alloc(13);
  kop.writeUInt32BE(BREEDTE, 0);
  kop.writeUInt32BE(HOOGTE, 4);
  kop[8] = 8; // bitdiepte
  kop[9] = 2; // kleurtype: RGB
  // compressie, filter en interlace blijven 0.
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngBlok("IHDR", kop),
    pngBlok("IDAT", deflateSync(pixels, { level: 9 })),
    pngBlok("IEND", Buffer.alloc(0)),
  ]);
}

// --- PDF -------------------------------------------------------------------

function maakPdf(paginas) {
  const objecten = []; // index 0 = object 1
  const voeg = (inhoud) => objecten.push(inhoud) && objecten.length;

  const catalogus = voeg(null);
  const pagina_boom = voeg(null);
  const paginaIds = [];
  for (const tekening of paginas) {
    const stroom = Buffer.from(tekening, "latin1");
    const inhoudId = voeg(
      Buffer.concat([Buffer.from(`<< /Length ${stroom.length} >>\nstream\n`), stroom, Buffer.from("\nendstream")]),
    );
    paginaIds.push(
      voeg(
        `<< /Type /Page /Parent ${pagina_boom} 0 R /MediaBox [0 0 595 842] /Contents ${inhoudId} 0 R /Resources << >> >>`,
      ),
    );
  }
  objecten[catalogus - 1] = `<< /Type /Catalog /Pages ${pagina_boom} 0 R >>`;
  objecten[pagina_boom - 1] =
    `<< /Type /Pages /Kids [${paginaIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginaIds.length} >>`;

  const delen = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const posities = [];
  let lengte = delen[0].length;
  objecten.forEach((inhoud, i) => {
    posities.push(lengte);
    const blok = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.isBuffer(inhoud) ? inhoud : Buffer.from(inhoud),
      Buffer.from("\nendobj\n"),
    ]);
    delen.push(blok);
    lengte += blok.length;
  });

  const xref = [`xref\n0 ${objecten.length + 1}\n`, "0000000000 65535 f \n"];
  for (const positie of posities) xref.push(`${String(positie).padStart(10, "0")} 00000 n \n`);
  xref.push(
    `trailer\n<< /Size ${objecten.length + 1} /Root ${catalogus} 0 R >>\nstartxref\n${lengte}\n%%EOF\n`,
  );
  delen.push(Buffer.from(xref.join("")));
  return Buffer.concat(delen);
}

/** Een lijntekening op een A4-pagina (595 x 842 pt); `variant` verschilt per pagina. */
function tekening(variant) {
  const lijnen = ["2 w", "50 50 495 742 re S"]; // kader
  if (variant === 1) {
    // Pagina 1: een plattegrond met een tussenmuur en een diagonaal.
    lijnen.push("300 50 m 300 450 l S", "50 450 m 300 450 l S", "300 450 m 545 792 l S");
  } else {
    // Pagina 2: een ander beeld, zodat de twee pagina's te onderscheiden zijn.
    lijnen.push("50 421 m 545 421 l S", "297 50 m 297 792 l S", "100 100 m 500 700 l S");
  }
  return lijnen.join("\n");
}

writeFileSync(join(map, "plan.png"), maakPlanPng());
writeFileSync(join(map, "plan-2p.pdf"), maakPdf([tekening(1), tekening(2)]));
console.log("plan.png en plan-2p.pdf geschreven in", map);
