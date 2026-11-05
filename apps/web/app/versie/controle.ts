// De eigen versiecontrole van de browser. Nuxt controleert zelf maar tot de eerste nieuwe build
// en stopt voorgoed na een mislukte controle; deze blijft lopen.
//
// Een controle vraagt twee dingen op, elk met een eigen foutafhandeling: de build-id van de server
// (`latest.json`, voor de toast) en `/api/gezondheid` (alleen voor de header met de minimumversie,
// voor het modale venster; die leest de omhulling van `fetch`, app/versie/fetch.ts). Een mislukte vraag
// (de update is nog bezig, de verbinding is weg) wordt stil genegeerd: de volgende controle probeert
// het opnieuw. Een vraag die niet antwoordt wordt na een time-out afgebroken, anders bleef `bezig`
// voor altijd waar en liep er nooit meer een controle.
//
// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1).

/** Hoe lang één vraag mag duren voor ze wordt afgebroken. */
export const VRAAG_TIMEOUT_MS = 15_000;

export type VersiecontroleOpties = {
  /** De build waar deze pagina uit komt. */
  eigenBuildId: string;
  /** De id van de nieuwste build op de server. Gooit bij een niet-ok antwoord. Geef `signal` aan `fetch`. */
  haalLaatsteBuildId: (signal: AbortSignal) => Promise<string>;
  /** Vraagt de gezondheid op; het antwoord zelf telt niet, wel de header ervan. Geef `signal` aan `fetch`. */
  haalGezondheid: (signal: AbortSignal) => Promise<unknown>;
  /** Bij elke controle waarvan de server een andere build heeft. */
  bijNieuweBuild: (id: string) => void;
  intervalMs: number;
  /** Time-out per vraag; standaard `VRAAG_TIMEOUT_MS`. */
  timeoutMs?: number;
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
  const timeoutMs = opties.timeoutMs ?? VRAAG_TIMEOUT_MS;

  // Eén vraag met een time-out: het signaal gaat naar `fetch`, en de belofte valt ook zelf af (een
  // vraag die het signaal negeert houdt de controle dan niet vast). Gooit bij de time-out.
  async function metTimeout<T>(vraag: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const afbreker = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const verlopen = new Promise<never>((_, afwijzen) => {
      timer = setTimeout(() => {
        afbreker.abort();
        afwijzen(new Error("time-out"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([vraag(afbreker.signal), verlopen]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function controleBuild(): Promise<void> {
    try {
      const id = await metTimeout(opties.haalLaatsteBuildId);
      if (id !== opties.eigenBuildId) opties.bijNieuweBuild(id);
    } catch {
      // Stil genegeerd.
    }
  }

  async function controleGezondheid(): Promise<void> {
    try {
      await metTimeout(opties.haalGezondheid);
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
