// Een eenvoudige rate limiter in het geheugen: hoogstens `max` pogingen per sleutel (een IP) in
// een glijdend venster. Voor routes buiten de limiter van Better Auth, zoals registreren via een
// uitnodiging. Eén proces, lokaal: geen gedeelde opslag nodig.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

export type LimietOpties = { max: number; vensterMs: number; nu?: () => number };

export type Poging = { toegelaten: boolean; wachtSeconden: number };

export type Limiet = {
  /** Telt een poging voor deze sleutel; geweigerd als er al `max` in het venster vallen. */
  probeer(sleutel: string): Poging;
  /** Vergeet alle tellers. */
  wis(): void;
};

/** Boven dit aantal sleutels worden verlopen tellers opgeruimd. */
const OPRUIMGRENS = 1000;

export function maakLimiet({ max, vensterMs, nu = Date.now }: LimietOpties): Limiet {
  const pogingen = new Map<string, number[]>();

  function ruimOp(tijd: number): void {
    for (const [sleutel, tijden] of pogingen) {
      if (tijden.every((t) => t <= tijd - vensterMs)) pogingen.delete(sleutel);
    }
  }

  return {
    probeer(sleutel) {
      const tijd = nu();
      if (pogingen.size > OPRUIMGRENS) ruimOp(tijd);
      const recent = (pogingen.get(sleutel) ?? []).filter((t) => t > tijd - vensterMs);
      if (recent.length >= max) {
        pogingen.set(sleutel, recent);
        const wachtMs = recent[0]! + vensterMs - tijd;
        return { toegelaten: false, wachtSeconden: Math.max(1, Math.ceil(wachtMs / 1000)) };
      }
      recent.push(tijd);
      pogingen.set(sleutel, recent);
      return { toegelaten: true, wachtSeconden: 0 };
    },
    wis() {
      pogingen.clear();
    },
  };
}
