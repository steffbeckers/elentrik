// Gedeelde zoom-, pan- en pinchbediening voor de canvassen (eendraadschema en plan). De wiskunde
// zit puur in `editor/weergave.ts`; dit is de koppeling met het venster, de pointers en de toetsen.
import { computed, onBeforeUnmount, onMounted, reactive, ref, type Ref } from "vue";
import {
  begrens,
  MAX_ZOOM,
  MIN_ZOOM,
  pan,
  passendeWeergave,
  pinch,
  wielFactor,
  zoomRond,
  type Afmeting,
  type Punt,
  type Vingers,
  type Weergave,
} from "../editor/weergave";
import { spatieSchuift, type DoelSoort } from "./sneltoetsen";

/** Aantal pixels dat de muis moet bewegen voordat een klik een sleepbeweging wordt. */
export const SLEEP_DREMPEL_PX = 3;

export type CanvasWeergaveOpties = {
  venster: Readonly<Ref<HTMLElement | null>>;
  /** De afmeting van de inhoud (mm of rasterpixels), of null zolang er niets te tonen is. */
  inhoud: () => Afmeting | null;
  /** Ruimte rond de inhoud bij "Passend maken", in inhoudseenheden. */
  marge: () => number;
  /** De maximale zoom (relatief aan de passende weergave); zonder deze optie `MAX_ZOOM`. */
  maxZoom?: (passend: Weergave, venster: Afmeting) => number;
  /** Een eigen sleepbeweging van de component moet stoppen: een tweede vinger, of het venster verliest de focus. */
  onderbreek?: () => void;
};

type Pan = { startX: number; startY: number; begin: Weergave; pointerId: number; actief: boolean };
type Pinch = { a: number; b: number; start: Vingers; begin: Weergave };

export function useCanvasWeergave(opties: CanvasWeergaveOpties) {
  const grootte = reactive({ breedte: 0, hoogte: 0 });
  const weergave = ref<Weergave>({ x: 0, y: 0, b: 1, h: 1 });
  const viewBox = computed(() => {
    const { x, y, b, h } = weergave.value;
    return `${x} ${y} ${b} ${h}`;
  });
  let heeftPassendeWeergave = false;

  const ruimteIngedrukt = ref(false);
  const sleept = ref(false);

  // --- Zoom ----------------------------------------------------------------

  /** De weergave waarop de hele inhoud (plus marge) in het venster past, gecentreerd. */
  function passend(): Weergave | null {
    const inhoud = opties.inhoud();
    return inhoud ? passendeWeergave(inhoud, grootte, opties.marge()) : null;
  }

  /** De zoomgrenzen bij deze passende weergave. */
  function zoomGrenzen(p: Weergave): { min: number; max: number } {
    return { min: MIN_ZOOM, max: opties.maxZoom ? opties.maxZoom(p, grootte) : MAX_ZOOM };
  }

  function maakPassend(): void {
    const w = passend();
    if (!w) return;
    weergave.value = w;
    heeftPassendeWeergave = true;
  }

  /** Maakt passend als dat nog nooit lukte (de inhoud kan pas na het mounten bestaan). */
  function passendAlsNodig(): void {
    if (!heeftPassendeWeergave) maakPassend();
  }

  /** Andere inhoud: opnieuw passend maken, of zodra het venster een afmeting heeft. */
  function passendOpnieuw(): void {
    heeftPassendeWeergave = false;
    maakPassend();
  }

  /** Houdt het midden van de weergave binnen de inhoud, zodat die niet uit beeld kan raken. */
  function binnenInhoud(w: Weergave): Weergave {
    const inhoud = opties.inhoud();
    return inhoud ? begrens(w, inhoud) : w;
  }

  function zoomOpWiel(event: WheelEvent): void {
    const p = passend();
    const vensterEl = opties.venster.value;
    if (!p || !vensterEl) return;
    const rect = vensterEl.getBoundingClientRect();
    const anker = {
      fx: (event.clientX - rect.left) / rect.width,
      fy: (event.clientY - rect.top) / rect.height,
    };
    const factor = wielFactor(event.deltaY, event.deltaMode, window.innerHeight);
    weergave.value = binnenInhoud(zoomRond(weergave.value, p, anker, factor, grootte, zoomGrenzen(p)));
  }

  // --- Klikken onderdrukken ------------------------------------------------

  let klikOnderdrukt = false;
  /** Pointers waarvan de sleep afgebroken is: hun pointerup geeft geen klik. */
  const teNegeren = new Set<number>();

  /** De klik die op deze pointerup volgt, is geen selectie. */
  function onderdrukKlik(): void {
    klikOnderdrukt = true;
    setTimeout(() => (klikOnderdrukt = false), 0);
  }

  /** Een afgebroken sleep: de klik bij het latere loslaten van deze pointer telt niet. */
  function negeerTotLoslaten(pointerId: number): void {
    teNegeren.add(pointerId);
  }

  // --- Pannen en pinchen ---------------------------------------------------

  let panSleep: Pan | null = null;
  let pinchSleep: Pinch | null = null;
  /** De vingers die het venster raken, op hun laatste positie. */
  const aanraking = new Map<number, Punt>();

  function stopPan(pointerId?: number): Pan | null {
    const s = panSleep;
    if (!s || (pointerId !== undefined && s.pointerId !== pointerId)) return null;
    panSleep = null;
    sleept.value = false;
    const el = opties.venster.value;
    if (el?.hasPointerCapture(s.pointerId)) el.releasePointerCapture(s.pointerId);
    return s;
  }

  function stopPinch(): Pinch | null {
    const p = pinchSleep;
    pinchSleep = null;
    if (p) sleept.value = false;
    return p;
  }

  function startPinch(): void {
    const [eerste, tweede] = [...aanraking];
    if (!eerste || !tweede) return;
    const gestopt = stopPan();
    if (gestopt) negeerTotLoslaten(gestopt.pointerId);
    opties.onderbreek?.();
    pinchSleep = { a: eerste[0], b: tweede[0], start: { a: eerste[1], b: tweede[1] }, begin: weergave.value };
    sleept.value = true;
  }

  /** Of er nu met twee vingers gezoomd wordt; dan start geen andere sleepbeweging. */
  function pincht(): boolean {
    return pinchSleep !== null;
  }

  /**
   * Een pointer gaat neer. `magPannen` zegt of de component deze pointer laat pannen (lege ruimte,
   * of de spatie ingedrukt). Een tweede vinger start altijd een pinch.
   */
  function pointerDown(event: PointerEvent, magPannen: boolean): void {
    if (event.button !== 0) return;
    // Een nieuwe beweging van deze pointer: een oude afgebroken sleep telt niet meer.
    teNegeren.delete(event.pointerId);
    if (event.pointerType === "touch") {
      aanraking.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinchSleep) return;
      if (aanraking.size === 2) {
        startPinch();
        return;
      }
    }
    // Een pan waarvan de pointerup gemist werd, stopt hier.
    stopPan();
    if (!magPannen) return;
    panSleep = {
      startX: event.clientX,
      startY: event.clientY,
      begin: weergave.value,
      pointerId: event.pointerId,
      actief: false,
    };
  }

  function pointerMove(event: PointerEvent): void {
    const vensterEl = opties.venster.value;
    if (aanraking.has(event.pointerId)) aanraking.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const p = pinchSleep;
    if (p && (event.pointerId === p.a || event.pointerId === p.b)) {
      const a = aanraking.get(p.a);
      const b = aanraking.get(p.b);
      const pas = passend();
      if (!a || !b || !pas || !vensterEl) return;
      weergave.value = binnenInhoud(pinch(p.begin, pas, p.start, { a, b }, vensterEl.getBoundingClientRect(), zoomGrenzen(pas)));
      return;
    }

    const s = panSleep;
    if (!s || !vensterEl || event.pointerId !== s.pointerId) return;
    // Geen knop meer ingedrukt: de pointerup is ons ontgaan.
    if (event.buttons === 0) {
      stopPan();
      return;
    }
    const dx = event.clientX - s.startX;
    const dy = event.clientY - s.startY;
    if (!s.actief) {
      if (Math.hypot(dx, dy) < SLEEP_DREMPEL_PX) return;
      s.actief = true;
      sleept.value = true;
      // Pas bij het slepen vastleggen: anders zou een gewone klik op het venster zelf landen.
      vensterEl.setPointerCapture(event.pointerId);
    }
    const rect = vensterEl.getBoundingClientRect();
    weergave.value = binnenInhoud(pan(s.begin, dx, dy, { breedte: rect.width, hoogte: rect.height }));
  }

  function pointerUp(event: PointerEvent): void {
    aanraking.delete(event.pointerId);
    if (teNegeren.delete(event.pointerId)) onderdrukKlik();
    const p = pinchSleep;
    if (p && (event.pointerId === p.a || event.pointerId === p.b)) {
      stopPinch();
      negeerTotLoslaten(event.pointerId === p.a ? p.b : p.a);
      onderdrukKlik();
      return;
    }
    const s = stopPan(event.pointerId);
    if (s && (s.actief || ruimteIngedrukt.value)) onderdrukKlik();
  }

  /**
   * `pointercancel`, of `lostpointercapture` van het venster zelf (bind met `.self`: bij touch en pen
   * verliest het kindelement onder de vinger zijn impliciete capture zodra het venster ze overneemt,
   * en dat mag de sleep niet stoppen). De beweging stopt zonder klik.
   */
  function pointerAfgebroken(event: PointerEvent): void {
    stopPan(event.pointerId);
    // Een vrijgegeven capture (bv. bij de start van een pinch) laat de vinger zelf op het venster.
    if (event.type === "lostpointercapture") return;
    aanraking.delete(event.pointerId);
    const p = pinchSleep;
    if (p && (event.pointerId === p.a || event.pointerId === p.b)) stopPinch();
  }

  // --- Toetsen en focus ----------------------------------------------------

  /** Spatie ingedrukt op een gewoon doel: de canvas schuift mee. Geeft `true` als de toets verwerkt is. */
  function spatieOmlaag(event: KeyboardEvent, soort: DoelSoort): boolean {
    if (!spatieSchuift(event.key, soort)) return false;
    ruimteIngedrukt.value = true;
    event.preventDefault();
    return true;
  }

  function toetsLosgelaten(event: KeyboardEvent): void {
    if (event.key === " ") ruimteIngedrukt.value = false;
  }

  /** Een keyup of pointerup buiten het venster komt niet aan: alles loslaten als het venster de focus verliest. */
  function focusKwijt(): void {
    ruimteIngedrukt.value = false;
    stopPinch();
    stopPan();
    aanraking.clear();
    opties.onderbreek?.();
  }

  // --- Levenscyclus --------------------------------------------------------

  let observer: ResizeObserver | undefined;

  function metingBijgewerkt(breedte: number, hoogte: number): void {
    if (breedte === 0 || hoogte === 0) return;
    const vorige = { ...grootte };
    grootte.breedte = breedte;
    grootte.hoogte = hoogte;
    if (!heeftPassendeWeergave) {
      maakPassend();
    } else if (vorige.breedte > 0) {
      // Zelfde schaal, ander venster: de breedte blijft, de hoogte volgt de beeldverhouding.
      const w = weergave.value;
      weergave.value = { ...w, h: w.b * (hoogte / breedte) };
    }
  }

  onMounted(() => {
    const el = opties.venster.value;
    if (el) {
      metingBijgewerkt(el.clientWidth, el.clientHeight);
      observer = new ResizeObserver(() => metingBijgewerkt(el.clientWidth, el.clientHeight));
      observer.observe(el);
    }
    window.addEventListener("keyup", toetsLosgelaten);
    window.addEventListener("blur", focusKwijt);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    window.removeEventListener("keyup", toetsLosgelaten);
    window.removeEventListener("blur", focusKwijt);
  });

  return {
    grootte,
    weergave,
    viewBox,
    ruimteIngedrukt,
    sleept,
    maakPassend,
    passendAlsNodig,
    passendOpnieuw,
    zoomOpWiel,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerAfgebroken,
    pincht,
    klikOnderdrukt: () => klikOnderdrukt,
    onderdrukKlik,
    negeerTotLoslaten,
    spatieOmlaag,
  };
}
