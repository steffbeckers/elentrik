// Een schrijfactie kreeg 402 ABONNEMENT_VEREIST: de organisatie mag niet meer schrijven. De sessie
// wordt opnieuw gelezen (de app wordt alleen-lezen) en een melding legt uit wat er aan de hand is,
// in plaats van een generieke fout. Geeft true als de fout zo behandeld werd; anders meldt de
// aanroeper de fout zelf.
import { behandelSchrijfweigering } from "~/abonnement/weergave";
import { useSessieStore } from "~/stores/sessie";

export function useAlleenLezen(): (fout: unknown) => Promise<boolean> {
  const sessie = useSessieStore();
  const toast = useToast();
  const { t } = useI18n();
  return async function alleenLezen(fout: unknown): Promise<boolean> {
    const behandeld = await behandelSchrijfweigering(fout, () => sessie.laad());
    if (behandeld) toast.add({ title: t("abonnement.banner.alleenLezen"), color: "warning" });
    return behandeld;
  };
}
