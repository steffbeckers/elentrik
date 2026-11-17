// Alleen lokaal (nuxt dev): zonder image is ELENTRIK_REVISIE leeg. Neem dan de commit van de checkout,
// zodat de versie (shared/versie.ts) ook hier zichtbaar is. Zonder git blijft hij leeg. In het image
// zet de build-arg de variabele en laat deze plugin hem met rust.
import { execFileSync } from "node:child_process";
import { defineNitroPlugin } from "nitropack/runtime";

export default defineNitroPlugin(() => {
  if (!import.meta.dev || process.env.ELENTRIK_REVISIE?.trim()) return;
  try {
    process.env.ELENTRIK_REVISIE = execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Geen git: geen versie.
  }
});
