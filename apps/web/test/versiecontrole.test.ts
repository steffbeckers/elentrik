// De eigen versiecontrole: vergelijkt de build-id uit latest.json met de eigen build, vraagt
// /api/gezondheid op voor de minimumversie, en blijft lopen na een nieuwe build en na een fout.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { koppelVensters, maakVersiecontrole, VRAAG_TIMEOUT_MS, type VensterVoorControle } from "../app/versie/controle";

const INTERVAL = 300_000;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function maak(over: Partial<Parameters<typeof maakVersiecontrole>[0]> = {}) {
  const bijNieuweBuild = vi.fn<(id: string) => void>();
  const haalLaatsteBuildId = vi.fn<(signal: AbortSignal) => Promise<string>>(async () => "eigen");
  const haalGezondheid = vi.fn<(signal: AbortSignal) => Promise<unknown>>(async () => ({ ok: true }));
  const opties = { eigenBuildId: "eigen", haalLaatsteBuildId, haalGezondheid, bijNieuweBuild, intervalMs: INTERVAL, ...over };
  return { controle: maakVersiecontrole(opties), ...opties };
}

describe("controleer", () => {
  test("dezelfde build: geen melding", async () => {
    const { controle, bijNieuweBuild, haalLaatsteBuildId, haalGezondheid } = maak();
    await controle.controleer();
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
    expect(haalGezondheid).toHaveBeenCalledTimes(1);
    expect(bijNieuweBuild).not.toHaveBeenCalled();
  });

  test("een andere build: bijNieuweBuild met de id, en de controle blijft lopen", async () => {
    const { controle, bijNieuweBuild } = maak({ haalLaatsteBuildId: vi.fn(async () => "nieuw") });
    controle.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(bijNieuweBuild).toHaveBeenCalledWith("nieuw");
    expect(bijNieuweBuild).toHaveBeenCalledTimes(1);
    // Na een nieuwe build stopt de controle niet (anders dan die van Nuxt zelf).
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(bijNieuweBuild).toHaveBeenCalledTimes(2);
    controle.stop();
  });

  test("een mislukte controle wordt genegeerd en de volgende loopt gewoon", async () => {
    const haal = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValue("nieuw");
    const { controle, bijNieuweBuild } = maak({ haalLaatsteBuildId: haal });
    controle.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(bijNieuweBuild).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(bijNieuweBuild).toHaveBeenCalledWith("nieuw");
    controle.stop();
  });

  test("haalGezondheid draait ook als latest.json faalt", async () => {
    const { controle, haalGezondheid } = maak({
      haalLaatsteBuildId: vi.fn(async () => {
        throw new Error("503");
      }),
    });
    await expect(controle.controleer()).resolves.toBeUndefined();
    expect(haalGezondheid).toHaveBeenCalledTimes(1);
  });

  test("een falende gezondheidscontrole gooit niet en latest.json telt toch", async () => {
    const { controle, bijNieuweBuild } = maak({
      haalLaatsteBuildId: vi.fn(async () => "nieuw"),
      haalGezondheid: vi.fn(async () => {
        throw new Error("503");
      }),
    });
    await expect(controle.controleer()).resolves.toBeUndefined();
    expect(bijNieuweBuild).toHaveBeenCalledWith("nieuw");
  });

  test("een falende bijNieuweBuild gooit niet", async () => {
    const { controle } = maak({
      haalLaatsteBuildId: vi.fn(async () => "nieuw"),
      bijNieuweBuild: () => {
        throw new Error("kapot");
      },
    });
    await expect(controle.controleer()).resolves.toBeUndefined();
  });

  test("geen twee controles tegelijk", async () => {
    let los: (id: string) => void = () => {};
    const haal = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          los = resolve;
        }),
    );
    const { controle, haalGezondheid } = maak({ haalLaatsteBuildId: haal });
    const eerste = controle.controleer();
    const tweede = controle.controleer();
    los("eigen");
    await Promise.all([eerste, tweede]);
    expect(haal).toHaveBeenCalledTimes(1);
    expect(haalGezondheid).toHaveBeenCalledTimes(1);
    // Daarna kan er weer een lopen.
    const derde = controle.controleer();
    los("eigen");
    await derde;
    expect(haal).toHaveBeenCalledTimes(2);
  });
});

describe("time-out", () => {
  test("een vraag die nooit antwoordt houdt de volgende controle niet tegen", async () => {
    // Een fetch die nooit klaarkomt en het signaal negeert.
    const haal = vi
      .fn<(signal: AbortSignal) => Promise<string>>()
      .mockImplementationOnce(() => new Promise<string>(() => {}))
      .mockResolvedValue("nieuw");
    const { controle, bijNieuweBuild, haalGezondheid } = maak({ haalLaatsteBuildId: haal });

    const eerste = controle.controleer();
    // Zolang de vraag hangt, doet een tweede controle niets.
    await controle.controleer();
    expect(haal).toHaveBeenCalledTimes(1);

    // Na de time-out is de eerste controle klaar (zonder te gooien) en loopt een nieuwe weer.
    await vi.advanceTimersByTimeAsync(VRAAG_TIMEOUT_MS);
    await expect(eerste).resolves.toBeUndefined();
    await controle.controleer();
    expect(haal).toHaveBeenCalledTimes(2);
    expect(haalGezondheid).toHaveBeenCalledTimes(2);
    expect(bijNieuweBuild).toHaveBeenCalledWith("nieuw");
  });

  test("de time-out breekt het signaal af, en een snelle vraag laat het met rust", async () => {
    const signalen: AbortSignal[] = [];
    const { controle } = maak({
      haalGezondheid: vi.fn(async (signal: AbortSignal) => {
        signalen.push(signal);
        return new Promise<unknown>(() => {});
      }),
      haalLaatsteBuildId: vi.fn(async (signal: AbortSignal) => {
        signalen.push(signal);
        return "eigen";
      }),
    });
    const lopend = controle.controleer();
    await vi.advanceTimersByTimeAsync(VRAAG_TIMEOUT_MS);
    await lopend;
    const [build, gezondheid] = signalen;
    expect(build!.aborted).toBe(false);
    expect(gezondheid!.aborted).toBe(true);
  });

  test("een eigen timeoutMs wordt gebruikt", async () => {
    const { controle, haalLaatsteBuildId } = maak({
      timeoutMs: 1_000,
      haalLaatsteBuildId: vi.fn(() => new Promise<string>(() => {})),
    });
    const lopend = controle.controleer();
    await vi.advanceTimersByTimeAsync(1_000);
    await lopend;
    const tweede = controle.controleer();
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    await tweede;
  });
});

describe("start en stop", () => {
  test("start controleert niet meteen, stop houdt de interval tegen", async () => {
    const { controle, haalLaatsteBuildId } = maak();
    controle.start();
    expect(haalLaatsteBuildId).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
    controle.stop();
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
  });

  test("twee keer start geeft één interval", async () => {
    const { controle, haalLaatsteBuildId } = maak();
    controle.start();
    controle.start();
    await vi.advanceTimersByTimeAsync(INTERVAL);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
    controle.stop();
  });
});

// Een nep-venster met de twee dingen die `koppelVensters` gebruikt.
function nepVenster() {
  const luisteraars = new Map<string, Set<() => void>>();
  const doc = { visibilityState: "hidden" as "hidden" | "visible" };
  const venster: VensterVoorControle = {
    addEventListener: (type, fn) => {
      if (!luisteraars.has(type)) luisteraars.set(type, new Set());
      luisteraars.get(type)!.add(fn);
    },
    removeEventListener: (type, fn) => {
      luisteraars.get(type)?.delete(fn);
    },
    document: {
      get visibilityState() {
        return doc.visibilityState;
      },
      addEventListener: (type, fn) => {
        if (!luisteraars.has(`doc:${type}`)) luisteraars.set(`doc:${type}`, new Set());
        luisteraars.get(`doc:${type}`)!.add(fn);
      },
      removeEventListener: (type, fn) => {
        luisteraars.get(`doc:${type}`)?.delete(fn);
      },
    },
  };
  return {
    venster,
    zichtbaar: (waarde: "hidden" | "visible") => {
      doc.visibilityState = waarde;
      luisteraars.get("doc:visibilitychange")?.forEach((fn) => fn());
    },
    online: () => luisteraars.get("online")?.forEach((fn) => fn()),
    aantal: () => [...luisteraars.values()].reduce((som, s) => som + s.size, 0),
  };
}

describe("koppelVensters", () => {
  test("zichtbaar worden geeft één controle, ook na een mislukte", async () => {
    const { controle, haalLaatsteBuildId, haalGezondheid } = maak({
      haalLaatsteBuildId: vi
        .fn<() => Promise<string>>()
        .mockRejectedValueOnce(new Error("503"))
        .mockResolvedValue("eigen"),
    });
    const nep = nepVenster();
    koppelVensters(controle, nep.venster);

    // Verborgen worden telt niet.
    nep.zichtbaar("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(haalLaatsteBuildId).not.toHaveBeenCalled();

    // Eén keer zichtbaar: één controle, die mislukt zonder iets te gooien.
    nep.zichtbaar("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
    expect(haalGezondheid).toHaveBeenCalledTimes(1);

    // De volgende keer zichtbaar loopt er weer één.
    nep.zichtbaar("hidden");
    nep.zichtbaar("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(2);
  });

  test("weer online geeft één controle", async () => {
    const { controle, haalLaatsteBuildId } = maak();
    const nep = nepVenster();
    koppelVensters(controle, nep.venster);
    nep.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(haalLaatsteBuildId).toHaveBeenCalledTimes(1);
  });

  test("de teruggegeven functie ontkoppelt alles", async () => {
    const { controle, haalLaatsteBuildId } = maak();
    const nep = nepVenster();
    const ontkoppel = koppelVensters(controle, nep.venster);
    ontkoppel();
    expect(nep.aantal()).toBe(0);
    nep.zichtbaar("visible");
    nep.online();
    await vi.advanceTimersByTimeAsync(0);
    expect(haalLaatsteBuildId).not.toHaveBeenCalled();
  });
});
