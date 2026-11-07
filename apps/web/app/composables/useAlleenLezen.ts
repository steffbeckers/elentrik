// Een schrijfactie kreeg 402 PROJECT_LIMIET (het project gaat over de gratis limiet) of
// PROJECT_ALLEEN_LEZEN (het project is gestempeld en niet vrijgegeven). Een melding legt uit wat er
// aan de hand is, in plaats van een generieke fout. Geeft "limiet" of "alleen-lezen" als de fout zo
// behandeld werd (waar, dus); anders false en meldt de aanroeper de fout zelf.
import { behandelSchrijfweigering } from "~/abonnement/weergave";
import { useSessieStore } from "~/stores/sessie";

export function useAlleenLezen(): (fout: unknown) => Promise<"limiet" | "alleen-lezen" | false> {
  const sessie = useSessieStore();
  const toast = useToast();
  const { t } = useI18n();
  return async function alleenLezen(fout: unknown): Promise<"limiet" | "alleen-lezen" | false> {
    const behandeld = await behandelSchrijfweigering(fout, () => sessie.laad());
    if (behandeld) {
      toast.add({
        title: t(behandeld === "limiet" ? "abonnement.weigering.limiet" : "abonnement.weigering.alleenLezen"),
        color: "warning",
      });
    }
    return behandeld;
  };
}
