// Bestandsopslag achter een interface, zodat een andere opslag later kan volgen.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { Readable } from "node:stream";

export interface BestandOpslag {
  schrijf(sleutel: string, data: Uint8Array): Promise<void>;
  lees(sleutel: string): Promise<ReadableStream<Uint8Array> | null>;
  bestaat(sleutel: string): Promise<boolean>;
}

const STANDAARD_MAP = ".data/bestanden";

export function maakLokaleOpslag(map: string): BestandOpslag {
  const wortel = resolve(map);

  /** Een sleutel mag nooit buiten de opslagmap uitkomen. */
  function pad(sleutel: string): string {
    const volledig = resolve(wortel, sleutel);
    if (!volledig.startsWith(wortel + sep)) throw new Error(`Ongeldige opslagsleutel: ${sleutel}`);
    return volledig;
  }

  async function isBestand(volledig: string): Promise<boolean> {
    try {
      return (await stat(volledig)).isFile();
    } catch (fout) {
      if ((fout as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw fout;
    }
  }

  return {
    async schrijf(sleutel, data) {
      const volledig = pad(sleutel);
      await mkdir(dirname(volledig), { recursive: true });
      await writeFile(volledig, data);
    },
    async lees(sleutel) {
      const volledig = pad(sleutel);
      if (!(await isBestand(volledig))) return null;
      return Readable.toWeb(createReadStream(volledig)) as ReadableStream<Uint8Array>;
    },
    async bestaat(sleutel) {
      return isBestand(pad(sleutel));
    },
  };
}

let huidige: BestandOpslag | undefined;

export function gebruikOpslag(): BestandOpslag {
  huidige ??= maakLokaleOpslag(process.env.ELENTRIK_BESTANDEN_DIR || STANDAARD_MAP);
  return huidige;
}

/** Alleen voor tests: vervangt de opslag die `gebruikOpslag()` teruggeeft. */
export function zetOpslag(opslag: BestandOpslag): void {
  huidige = opslag;
}
