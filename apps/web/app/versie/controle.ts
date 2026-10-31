// De eigen versiecontrole van de browser. Nuxt controleert zelf maar tot de eerste nieuwe build
// en stopt voorgoed na een mislukte controle; deze blijft lopen.
//
// Een controle vraagt twee dingen op, elk met een eigen foutafhandeling: de build-id van de server
// (`latest.json`, voor de toast) en `/api/gezondheid` (alleen voor de header met de minimumversie,
// voor het modale venster; die leest de omhulling van `$fetch`). Een mislukte vraag (de update is nog
// bezig, de verbinding is weg) wordt stil genegeerd: de volgende controle probeert het opnieuw.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

export type VersiecontroleOpties = {
  /** De build waar deze pagina uit komt. */
  eigenBuildId: string;
  /** De id van de nieuwste build op de server. Gooit bij een niet-ok antwoord. */
  haalLaatsteBuildId: () => Promise<string>;
  /** Vraagt de gezondheid op; het antwoord zelf telt niet, wel de header ervan. */
  haalGezondheid: () => Promise<unknown>;
  /** Bij elke controle waarvan de server een andere build heeft. */
  bijNieuweBuild: (id: string) => void;
  intervalMs: number;
};

export type Versiecontrole = {
  /** Start de interval. Een tweede `start` doet niets. */
  start(): void;
  stop(): void;
  /** Eén controle; gooit nooit. Is er al één bezig, dan gebeurt er niets. */
  controleer(): Promise<void>;
};

export function maakVersiecontrole(opties: VersiecontroleOpties): Versiecontrole {
  let timer: ReturnType<typeof setInterval> | null = null;
  let bezig = false;

  async function controleBuild(): Promise<void> {
    try {
      const id = await opties.haalLaatsteBuildId();
      if (id !== opties.eigenBuildId) opties.bijNieuweBuild(id);
    } catch {
      // Stil genegeerd.
    }
  }

  async function controleGezondheid(): Promise<void> {
    try {
      await opties.haalGezondheid();
    } catch {
      // Stil genegeerd.
    }
  }

  async function controleer(): Promise<void> {
    if (bezig) return;
    bezig = true;
    try {
      await Promise.all([controleBuild(), controleGezondheid()]);
    } finally {
      bezig = false;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      timer = setInterval(() => void controleer(), opties.intervalMs);
    },
    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
    controleer,
  };
}

/** Wat `koppelVensters` van een venster gebruikt: `window` past er rechtstreeks op. */
export type VensterVoorControle = {
  addEventListener(type: "online", luisteraar: () => void): void;
  removeEventListener(type: "online", luisteraar: () => void): void;
  document: {
    readonly visibilityState: string;
    addEventListener(type: "visibilitychange", luisteraar: () => void): void;
    removeEventListener(type: "visibilitychange", luisteraar: () => void): void;
  };
};

/**
 * Eén controle als het tabblad weer zichtbaar wordt, en één als de browser weer online komt.
 * Verborgen worden telt niet. Geeft een functie terug die alles ontkoppelt.
 */
export function koppelVensters(controle: Versiecontrole, venster: VensterVoorControle): () => void {
  const bijZichtbaar = () => {
    if (venster.document.visibilityState === "visible") void controle.controleer();
  };
  const bijOnline = () => void controle.controleer();
  venster.document.addEventListener("visibilitychange", bijZichtbaar);
  venster.addEventListener("online", bijOnline);
  return () => {
    venster.document.removeEventListener("visibilitychange", bijZichtbaar);
    venster.removeEventListener("online", bijOnline);
  };
}
