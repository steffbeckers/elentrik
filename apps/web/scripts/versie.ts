// Drukt de volgende versie af (zie shared/semver.ts), voor de image-workflow:
//   node apps/web/scripts/versie.ts            → bv. 1.1.0
// Met --json ook de vorige tag: {"vorigeTag":"v1.0.0","versie":"1.1.0"}.
// Node 24 voert dit TypeScript-bestand rechtstreeks uit (type stripping).
import { execFileSync } from "node:child_process";
import { bepaalVersie } from "../shared/semver.ts";

const uitkomst = bepaalVersie((args) => execFileSync("git", args, { encoding: "utf8" }));
process.stdout.write(process.argv.includes("--json") ? `${JSON.stringify(uitkomst)}\n` : `${uitkomst.versie}\n`);
