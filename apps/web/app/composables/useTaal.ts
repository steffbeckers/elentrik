// De taal van de interface: de huidige taal en wisselen (de taalkiezer). De logica staat in
// app/sessie/taal.ts; hier komen de echte afhankelijkheden bij: de i18n-module, `$fetch`, de
// sessie-store en een toast.
import { vertaalFout } from "~/fouten";
import { maakTaalWissel } from "~/sessie/taal";
import { useSessieStore } from "~/stores/sessie";
import { isTaal, type Taal } from "../../shared/taal";

export function useTaal(): { taal: Readonly<Ref<Taal>>; zetTaal(taal: Taal): Promise<void> } {
  const { locale, setLocale, t } = useI18n();
  const sessie = useSessieStore();
  const toast = useToast();

  const taal = computed<Taal>(() => (isTaal(locale.value) ? locale.value : "nl"));

  const { zetTaal } = maakTaalWissel({
    zetLocale: (nieuw) => setLocale(nieuw),
    aangemeld: () => sessie.gebruiker !== null,
    // `pad as string`: zonder getypeerde route-inferentie (die loopt hier vast op de diepte).
    bewaar: (pad, opties) => $fetch<{ taal: Taal }>(pad as string, opties),
    bijFout: (fout, soort) =>
      toast.add(
        soort === "wisselen"
          ? { title: t("taal.wisselenMislukt"), color: "error" }
          : { title: t("taal.bewarenMislukt"), description: vertaalFout(fout, t), color: "warning" },
      ),
    bijBewaard: (nieuw) => {
      if (sessie.gebruiker) sessie.gebruiker.taal = nieuw;
    },
  });

  return { taal, zetTaal };
}
