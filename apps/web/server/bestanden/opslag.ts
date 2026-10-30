// Bestandsopslag achter een interface, zodat een andere opslag later kan volgen.
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module
// rechtstreeks (ruling E1).
import { createReadStream } from "node:fs";
import { mkdir, readdir, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

export interface BestandOpslag {
  schrijf(sleutel: string, data: Uint8Array): Promise<void>;
  lees(sleutel: string): Promise<ReadableStream<Uint8Array> | null>;
  bestaat(sleutel: string): Promise<boolean>;
  /**
   * Alle bestanden in de opslag met hun laatste wijzigingstijd; sleutels met `/`, ongeacht het platform.
   * Bestanden en mappen waarvan de naam met `@` of `.` begint (NAS-metadata zoals `@eaDir`), tellen niet mee.
   */
  lijst(): Promise<{ sleutel: string; gewijzigd: Date }[]>;
  /** Wist een bestand. Een bestand dat al weg is, is geen fout. */
  verwijder(sleutel: string): Promise<void>;
  /** Bestaat de opslagmap zelf (als map)? Onwaar bij een niet-aangekoppeld volume. */
  bestaatWortel(): Promise<boolean>;
  /**
   * Wist een map, maar alleen als ze leeg is: een map met iets erin, of die er niet is, blijft
   * zoals ze is (geen fout). De opslagmap zelf wordt nooit gewist. Veilig naast een upload die
   * tegelijk een bestand in die map maakt: het wissen van een niet-lege map faalt gewoon.
   */
  wisLegeMap(map: string): Promise<void>;
}

const STANDAARD_MAP = ".data/bestanden";

/** Namen die met `@` of `.` beginnen zijn metadata van de NAS of het besturingssysteem, nooit onze sleutels. */
const METADATA = /^[@.]/;

/** Zoveel keer probeert `schrijf` het opnieuw als de map er net tussenuit gehaald is. */
const SCHRIJF_POGINGEN = 5;

/**
 * Wat `rmdir` zegt als er (net) iets in de map staat of ze er niet meer is: dan is er niets te doen.
 * Windows meldt een map waar op dat moment in geschreven wordt als `EPERM` of `EBUSY`.
 */
const NIET_LEEG_OF_WEG = new Set(["ENOTEMPTY", "EEXIST", "ENOENT", "EPERM", "EBUSY"]);

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
      // `wisLegeMap` kan de map tussen `mkdir` en `writeFile` wegnemen: dan maken we ze opnieuw.
      for (let poging = 1; ; poging++) {
        try {
          await mkdir(dirname(volledig), { recursive: true });
          await writeFile(volledig, data);
          return;
        } catch (fout) {
          // Windows meldt een map die net gewist wordt als `EPERM`.
          const code = (fout as NodeJS.ErrnoException).code;
          if ((code !== "ENOENT" && code !== "EPERM") || poging >= SCHRIJF_POGINGEN) throw fout;
        }
      }
    },
    async lees(sleutel) {
      const volledig = pad(sleutel);
      if (!(await isBestand(volledig))) return null;
      return Readable.toWeb(createReadStream(volledig)) as ReadableStream<Uint8Array>;
    },
    async bestaat(sleutel) {
      return isBestand(pad(sleutel));
    },
    async lijst() {
      const gevonden: { sleutel: string; gewijzigd: Date }[] = [];
      async function loop(map: string, voorvoegsel: string): Promise<void> {
        let items;
        try {
          items = await readdir(map, { withFileTypes: true });
        } catch (fout) {
          if ((fout as NodeJS.ErrnoException).code === "ENOENT") return;
          throw fout;
        }
        for (const item of items) {
          // NAS-metadata (Synology `@eaDir`, `@tmp`, macOS `.DS_Store`, `.AppleDouble`): geen bestand van ons.
          // Zo ziet de opruimtaak het niet als "bestand zonder rij" en wist ze het niet.
          if (METADATA.test(item.name)) continue;
          const volledig = join(map, item.name);
          if (item.isDirectory()) {
            await loop(volledig, `${voorvoegsel}${item.name}/`);
          } else if (item.isFile()) {
            try {
              gevonden.push({ sleutel: `${voorvoegsel}${item.name}`, gewijzigd: (await stat(volledig)).mtime });
            } catch (fout) {
              // Tussen het lezen van de map en de stat gewist: dan is het er niet meer.
              if ((fout as NodeJS.ErrnoException).code !== "ENOENT") throw fout;
            }
          }
        }
      }
      await loop(wortel, "");
      return gevonden;
    },
    async verwijder(sleutel) {
      try {
        await unlink(pad(sleutel));
      } catch (fout) {
        if ((fout as NodeJS.ErrnoException).code === "ENOENT") return;
        throw fout;
      }
    },
    async bestaatWortel() {
      try {
        return (await stat(wortel)).isDirectory();
      } catch (fout) {
        if ((fout as NodeJS.ErrnoException).code === "ENOENT" || (fout as NodeJS.ErrnoException).code === "ENOTDIR") {
          return false;
        }
        throw fout;
      }
    },
    async wisLegeMap(map) {
      // De opslagmap zelf ("", ".", "a/..") wordt nooit gewist; een pad erbuiten wordt geweigerd door `pad`.
      if (resolve(wortel, map) === wortel) return;
      try {
        await rmdir(pad(map));
      } catch (fout) {
        if (NIET_LEEG_OF_WEG.has((fout as NodeJS.ErrnoException).code ?? "")) return;
        throw fout;
      }
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
