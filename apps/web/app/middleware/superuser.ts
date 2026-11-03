import { useSessieStore } from "~/stores/sessie";
import { foutStatus } from "~/sessie/fouten";

export default defineNuxtRouteMiddleware(async () => {
  const sessie = useSessieStore();
  const { $i18n } = useNuxtApp();
  try {
    await useRequestFetch()("/api/admin/sessie", {
      headers: { "x-elentrik-gebruiker": sessie.gebruiker?.id ?? "" },
    });
  } catch (fout) {
    const status = foutStatus(fout);
    return abortNavigation(createError({ statusCode: status === 401 || status === 403 ? status : 503,
      statusMessage: $i18n.t(status === 401 || status === 403 ? "fouten.NIET_TOEGELATEN" : "admin.onbereikbaar"), fatal: true }));
  }
});
