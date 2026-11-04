import type { Ref } from "vue";
import { useSessieStore } from "../stores/sessie";
export function useAdminGegevens<T>(sleutel: string, haal: () => Promise<T>, watch: Ref<unknown>[] = []) {
  const gebruiker = useSessieStore().gebruiker?.id;
  return useAsyncData(`admin:${gebruiker}:${sleutel}`, haal, { server: false, watch });
}
