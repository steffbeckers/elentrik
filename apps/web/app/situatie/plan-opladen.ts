// Expliciete imports, geen Nuxt-auto-imports: Vitest importeert deze module rechtstreeks
// (ruling E1). De uploadvolgorde en de foutvertaling van "Plan toevoegen", los van de dialoog.
import type { SituatiePagina } from "@elentrik/model";
import type { BestandenApi } from "../composables/useBestandenApi";
import { httpStatus } from "../composables/useProjectenApi";
import { foutCode } from "../sessie/fouten";
import { ABONNEMENT_VEREIST } from "../../shared/abonnement";

const OPSLAG_VOL = "OPSLAG_VOL";

export type PlanUploader = Pick<BestandenApi, "upload">;

export type PlanInvoer = {
  /** Het bestand zoals de gebruiker het koos (PDF, PNG of JPEG). */
  origineel: Blob;
  /** Het raster dat getoond wordt; dezelfde blob als `origineel` als het bestand zelf volstaat. */
  raster: Blob;
  naam: string;
  /** Het gekozen paginanummer (1-gebaseerd) bij een PDF. */
  pdfPagina?: number;
};

export type PlanAchtergrond = NonNullable<SituatiePagina["achtergrond"]>;

export function isAfgebroken(fout: unknown): boolean {
  return typeof fout === "object" && fout !== null && (fout as { name?: unknown }).name === "AbortError";
}

function vereisNietAfgebroken(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DOMException("Upload afgebroken", "AbortError");
}

/**
 * Uploadt het origineel en daarna het raster; een afbeelding die zelf als raster dient gaat één keer.
 * De afmetingen komen uit het antwoord van de server voor het rasterbestand: dat is wat opgeslagen
 * en geserveerd wordt. Gooit bij de eerste mislukking; er is dan niets om terug te draaien.
 */
export async function laadPlanOp(
  api: PlanUploader,
  projectId: string,
  invoer: PlanInvoer,
  signal?: AbortSignal,
): Promise<PlanAchtergrond> {
  vereisNietAfgebroken(signal);
  const origineel = await api.upload(projectId, "plan-origineel", invoer.origineel, invoer.naam, signal);
  let raster = origineel;
  if (invoer.raster !== invoer.origineel) {
    vereisNietAfgebroken(signal);
    raster = await api.upload(projectId, "plan-raster", invoer.raster, `${invoer.naam}.png`, signal);
  }
  if (raster.breedte_px === undefined || raster.hoogte_px === undefined) {
    throw new Error("De server gaf geen afmetingen voor het raster");
  }
  return {
    origineelBestandId: origineel.id,
    rasterBestandId: raster.id,
    ...(invoer.pdfPagina === undefined ? {} : { pdfPagina: invoer.pdfPagina }),
    breedte_px: raster.breedte_px,
    hoogte_px: raster.hoogte_px,
  };
}

/**
 * `opslagVol` (413 OPSLAG_VOL) heeft geen eigen tekst onder `editor.situatie.toevoegen.fout`: de
 * dialoog toont dan `fouten.OPSLAG_VOL`, de vertaling van de foutcode.
 */
export type UploadFoutSleutel = "onbekendType" | "teGroot" | "tePixels" | "opslagVol" | "mislukt";

/** De sleutel onder `editor.situatie.toevoegen.fout` voor een mislukte upload (of `opslagVol`, zie `UploadFoutSleutel`). */
export function foutSleutel(fout: unknown): UploadFoutSleutel {
  switch (httpStatus(fout)) {
    case 415:
      return "onbekendType";
    case 413:
      return foutCode(fout) === OPSLAG_VOL ? "opslagVol" : "teGroot";
    case 422:
      return "tePixels";
    default:
      return "mislukt";
  }
}

/**
 * Wat een mislukte upload de gebruiker meldt. Een 402 `ABONNEMENT_VEREIST` (de organisatie mag niet
 * meer schrijven) gaat eerst langs `alleenLezen`, de bestaande alleen-lezenafhandeling (de sessie
 * opnieuw lezen en de alleen-lezenmelding tonen): dan is er niets meer te melden (null). Anders de
 * sleutel onder `editor.situatie.toevoegen.fout`.
 */
export async function uploadFoutMelding(
  fout: unknown,
  alleenLezen: (fout: unknown) => Promise<boolean>,
): Promise<UploadFoutSleutel | null> {
  if (httpStatus(fout) === 402 && foutCode(fout) === ABONNEMENT_VEREIST && (await alleenLezen(fout))) return null;
  return foutSleutel(fout);
}
