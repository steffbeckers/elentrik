// De editor bewaart concepten per gebruiker: zonder ingelogde gebruiker start hij niet. De globale
// middleware `aangemeld` stuurt dan al naar /inloggen; dit is de tweede, harde grens voor de editor.
import { useSessieStore } from "~/stores/sessie";

export default defineNuxtRouteMiddleware((to) => {
  if (useSessieStore().gebruiker) return;
  return navigateTo(`/inloggen?terug=${encodeURIComponent(to.fullPath)}`, { replace: true });
});
