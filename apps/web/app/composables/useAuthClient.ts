// De Better Auth-client voor de app, met de plugins voor organisaties en magic links.
// In de browser is er één gedeelde client. Op de server krijgt elk verzoek een eigen client met
// de cookies van dat verzoek, zodat sessies van verschillende gebruikers nooit gedeeld worden.
import { inferAdditionalFields, magicLinkClient, organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";
import { useRequestHeaders, useRequestURL } from "#imports";

export function maakAuthClient(opties: { baseURL?: string; headers?: Record<string, string> } = {}) {
  return createAuthClient({
    baseURL: opties.baseURL,
    fetchOptions: opties.headers ? { headers: opties.headers } : undefined,
    plugins: [
      organizationClient(),
      magicLinkClient(),
      inferAdditionalFields({
        user: { wachtendeBedrijfsnaam: { type: "string", required: false } },
      }),
    ],
  });
}

export type AuthClient = ReturnType<typeof maakAuthClient>;

let browserClient: AuthClient | undefined;

export function useAuthClient(): AuthClient {
  if (import.meta.server) {
    return maakAuthClient({
      baseURL: useRequestURL().origin,
      headers: useRequestHeaders(["cookie"]),
    });
  }
  browserClient ??= maakAuthClient();
  return browserClient;
}
