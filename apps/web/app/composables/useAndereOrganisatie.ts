// Een schrijfactie kreeg 409 ANDERE_ORGANISATIE: in een ander tabblad werd intussen een andere
// organisatie actief. De sessie wordt opnieuw gelezen (de pagina volgt de nieuwe organisatie via
// haar watch op de actieve organisatie) en een melding zegt welke organisatie nu actief is. De
// actie wordt niet herhaald. Geeft true als de fout zo behandeld werd; anders meldt de aanroeper
// de fout zelf.
import { bestemming } from "~/sessie/bestemming";
import { behandelAndereOrganisatie } from "~/sessie/organisatie";
import { useSessieStore } from "~/stores/sessie";

export function useAndereOrganisatie(): (fout: unknown) => Promise<boolean> {
  const sessie = useSessieStore();
  const toast = useToast();
  const { t } = useI18n();
  const route = useRoute();
  return async function andereOrganisatie(fout: unknown): Promise<boolean> {
    const behandeld = await behandelAndereOrganisatie(fout, {
      laad: () => sessie.laad(),
      organisatieNaam: () => sessie.actieveOrganisatie?.naam ?? null,
      meld: (organisatie) =>
        toast.add({
          title: organisatie
            ? t("organisatie.andereOrganisatie.melding", { organisatie })
            : t("organisatie.andereOrganisatie.zonderNaam"),
          color: "warning",
        }),
    });
    if (!behandeld) return false;
    // Geen organisatie meer, of niet meer ingelogd: naar de pagina die daarbij hoort.
    const doel = bestemming(route, sessie.sessieInfo);
    if (doel) await navigateTo(doel, { replace: true });
    return true;
  };
}
