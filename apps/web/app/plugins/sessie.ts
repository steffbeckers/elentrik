// Geeft de sessie-store haar API. Tijdens SSR stuurt `useRequestFetch` de cookies van het verzoek
// mee naar /api/mij, zodat de server de sessie kent en de middleware al op de server doorverwijst:
// een beschermde pagina flitst nooit even op vóór de doorverwijzing.
import { useSessieStore, type Mij } from "~/stores/sessie";

export default defineNuxtPlugin(() => {
  const haal = useRequestFetch();
  useSessieStore().gebruikApi({
    mij: () => haal<Mij>("/api/mij"),
    async wisselActief(organisatieId) {
      await $fetch("/api/organisaties/actief", { method: "POST", body: { organisatieId } });
    },
    async uitloggen() {
      const { error } = await useAuthClient().signOut();
      if (error) throw error;
    },
  });
});
