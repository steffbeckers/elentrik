import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useVersieStore, ZONDER_WAARSCHUWING_MS } from "../app/stores/versie";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("toonMelding", () => {
  test("een nieuwe build geeft een melding, tot ze gemeld is", () => {
    const store = useVersieStore();
    expect(store.toonMelding).toBe(false);
    store.meldBuild("b");
    expect(store.toonMelding).toBe(true);
    store.markeerGemeld();
    expect(store.toonMelding).toBe(false);
    store.meldBuild("c");
    expect(store.toonMelding).toBe(true);
  });

  test("een vereiste update geeft geen toast: het modale venster neemt het over", () => {
    const store = useVersieStore();
    store.meldBuild("b");
    store.meldServerversie("999");
    expect(store.vereist).toBe(true);
    expect(store.toonMelding).toBe(false);
  });
});

describe("meldServerversie", () => {
  test("een ander getal zet vereist; het gaat nooit terug", () => {
    const store = useVersieStore();
    store.meldServerversie("1");
    expect(store.vereist).toBe(false);
    store.meldServerversie("2");
    expect(store.vereist).toBe(true);
    store.meldServerversie("1");
    store.meldServerversie(null);
    expect(store.vereist).toBe(true);
  });

  test("een onleesbare waarde doet niets", () => {
    const store = useVersieStore();
    store.meldServerversie("x");
    store.meldServerversie(undefined);
    expect(store.vereist).toBe(false);
  });

  test("meldVereist zet vereist", () => {
    const store = useVersieStore();
    store.meldVereist();
    expect(store.vereist).toBe(true);
  });
});

describe("herlaad", () => {
  test("met voorHerladen naar true: zonder waarschuwing, en herladen", async () => {
    const store = useVersieStore();
    const herlaad = vi.fn();
    store.zetVoorHerladen(async () => true);
    await store.herlaad(herlaad);
    expect(store.zonderWaarschuwing).toBe(true);
    expect(herlaad).toHaveBeenCalledTimes(1);
  });

  test("met voorHerladen naar false: de waarschuwing blijft, en het herlaadt toch", async () => {
    const store = useVersieStore();
    const herlaad = vi.fn();
    store.zetVoorHerladen(async () => false);
    await store.herlaad(herlaad);
    expect(store.zonderWaarschuwing).toBe(false);
    expect(herlaad).toHaveBeenCalledTimes(1);
  });

  test("zonder voorHerladen: zonder waarschuwing", async () => {
    const store = useVersieStore();
    const herlaad = vi.fn();
    await store.herlaad(herlaad);
    expect(store.zonderWaarschuwing).toBe(true);
    expect(herlaad).toHaveBeenCalledTimes(1);
  });

  test("een afgemelde voorHerladen telt niet meer", async () => {
    const store = useVersieStore();
    const voor = vi.fn(async () => false);
    store.zetVoorHerladen(voor);
    store.zetVoorHerladen(null);
    await store.herlaad(vi.fn());
    expect(voor).not.toHaveBeenCalled();
    expect(store.zonderWaarschuwing).toBe(true);
  });

  test("de vlag gaat terug na een korte tijd, zodat een geannuleerde herlading de waarschuwing herstelt", async () => {
    vi.useFakeTimers();
    try {
      const store = useVersieStore();
      store.zetVoorHerladen(async () => true);
      await store.herlaad(vi.fn());
      expect(store.zonderWaarschuwing).toBe(true);
      await vi.advanceTimersByTimeAsync(ZONDER_WAARSCHUWING_MS - 1);
      expect(store.zonderWaarschuwing).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(store.zonderWaarschuwing).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
