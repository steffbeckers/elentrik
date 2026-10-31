import type { Voorinstelling } from "@elentrik/model";
import { aanDelen, bediening, type Kaart } from "~/editor/symbolen";

/**
 * De vertaalde teksten van het symbolenvenster: naam, uitleg en AREI-verwijzing van een kaart, de
 * korte naam van een combinatie, en de tekst waarin het zoekveld zoekt (in de actieve taal).
 */
export function useSymboolNamen() {
  const { t, locale } = useI18n();

  const kaartNaam = (kaart: Kaart): string => t(`editor.types.${kaart.type}`);
  const uitleg = (kaart: Kaart): string => t(`editor.symbolen.uitleg.${kaart.type}`);
  const arei = (kaart: Kaart): string =>
    t("editor.symbolen.arei", { rubriek: t(`editor.symbolen.rubrieken.${kaart.rubriek}`) });
  const soortNaam = (soort: string): string => t(`velden.soort.opties.${soort}`);
  const veldNaam = (sleutel: string): string => t(`velden.${sleutel}.label`);

  /** Een ja/nee-veld midden in een opsomming begint met een kleine letter: "Wissel, waterdicht". */
  function klein(tekst: string): string {
    return tekst.charAt(0).toLocaleLowerCase(locale.value) + tekst.slice(1);
  }

  /** De korte naam van een combinatie, bv. "Randaarde, kinderbeveiliging". */
  function korteNaam(kaart: Kaart, voorinstelling: Voorinstelling): string {
    const delen = aanDelen(kaart, voorinstelling).map((deel, i) => {
      if ("soort" in deel) return soortNaam(deel.soort);
      return i === 0 ? veldNaam(deel.veld) : klein(veldNaam(deel.veld));
    });
    if (delen.length > 0) return delen.join(", ");
    return kaart.velden.length === 0 ? t("editor.symbolen.standaard") : t("editor.symbolen.zonderOpties");
  }

  /** De korte naam van een voorinstelling met, als het afwijkt van de standaard, het aantal. */
  function variantTekst(kaart: Kaart, voorinstelling: Voorinstelling): string {
    const naam = korteNaam(kaart, voorinstelling);
    const aantal = bediening(kaart, voorinstelling).aantal;
    return aantal === bediening(kaart, {}).aantal ? naam : t("editor.symbolen.metAantal", { naam, aantal });
  }

  /** Naam, uitleg en de namen van alle varianten: waar het zoekveld in zoekt. */
  function zoekTekst(kaart: Kaart): string {
    const varianten = kaart.velden.flatMap((veld) =>
      veld.sleutel === "soort" ? veld.waarden.map((w) => soortNaam(String(w))) : [veldNaam(veld.sleutel)],
    );
    return [kaartNaam(kaart), uitleg(kaart), ...varianten].join(" ");
  }

  return { kaartNaam, uitleg, arei, soortNaam, veldNaam, korteNaam, variantTekst, zoekTekst };
}
