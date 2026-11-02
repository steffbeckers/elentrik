import type { DropdownMenuItem } from "@nuxt/ui";
import { useSessieStore } from "~/stores/sessie";

/** Beide menu's wisselen via dezelfde vertrekbeveiliging in de sessie-store. */
export function useOrganisatieKeuzes() {
  const sessie = useSessieStore();
  const { t } = useI18n();
  const toast = useToast();
  const bezig = ref(false);

  async function kies(id: string) {
    if (bezig.value || id === sessie.actieveOrganisatieId) return;
    bezig.value = true;
    try {
      if (await sessie.wissel(id)) await navigateTo("/");
    } catch {
      toast.add({ title: t("menu.wisselenMislukt"), color: "error" });
    } finally {
      bezig.value = false;
    }
  }

  const organisatieItems = computed<DropdownMenuItem[]>(() => sessie.organisaties.map(organisatie => ({
    type: "checkbox",
    label: organisatie.naam,
    description: t(`rollen.${organisatie.rol}`),
    slot: "organisatie-optie",
    organisatieId: organisatie.id,
    checked: organisatie.id === sessie.actieveOrganisatieId,
    disabled: bezig.value,
    onSelect: () => kies(organisatie.id),
  })));

  function organisatieOptie(item: unknown): { label?: string; organisatieId?: string } {
    return item as { label?: string; organisatieId?: string };
  }

  return { bezig, organisatieItems, organisatieOptie };
}
