// De tooltip bij een markering in het canvas (eendraadschema en plan). Met de muis verschijnt hij
// bij aanwijzen; een klik of tik zet hem vast tot de volgende klik elders, zodat hij ook zonder
// muis te lezen is. De inhoud en de plaats staan in `components/editor/MarkeringTip.vue`.

export type MarkeringTipDoel = { nodeId: string; rect: DOMRect; vast: boolean };

/** Het attribuut op een markering: een klik daarop sluit de tooltip niet. */
export const MARKERING_ATTRIBUUT = "data-markering";

export function useMarkeringTip() {
  const tip = ref<MarkeringTipDoel | null>(null);

  function toon(event: Event, nodeId: string, vast = false): void {
    const doel = event.currentTarget;
    if (!(doel instanceof Element)) return;
    tip.value = { nodeId, rect: doel.getBoundingClientRect(), vast };
  }

  /** Bij aanwijzen met de muis; een aanraking volgt met een tik (`toon` met `vast`). */
  function wijsAan(event: PointerEvent, nodeId: string): void {
    if (event.pointerType !== "mouse" || tip.value?.vast) return;
    toon(event, nodeId);
  }

  /** De aanwijzer verlaat de markering: een vastgezette tooltip blijft staan. */
  function verlaat(): void {
    if (!tip.value?.vast) tip.value = null;
  }

  function verberg(): void {
    tip.value = null;
  }

  function bijPointerDown(event: PointerEvent): void {
    if (!(event.target instanceof Element && event.target.closest(`[${MARKERING_ATTRIBUUT}]`))) verberg();
  }
  function bijToets(event: KeyboardEvent): void {
    if (event.key === "Escape") verberg();
  }

  // De markering verschuift bij zoomen, pannen of een ander venster: de tooltip hoort dan niet meer bij haar plaats.
  onMounted(() => {
    window.addEventListener("pointerdown", bijPointerDown, true);
    window.addEventListener("wheel", verberg, { capture: true, passive: true });
    window.addEventListener("resize", verberg);
    window.addEventListener("keydown", bijToets, true);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("pointerdown", bijPointerDown, true);
    window.removeEventListener("wheel", verberg, true);
    window.removeEventListener("resize", verberg);
    window.removeEventListener("keydown", bijToets, true);
  });

  return { tip, toon, wijsAan, verlaat, verberg };
}
