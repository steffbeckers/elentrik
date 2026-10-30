# Het image van Elentrik. Bouwen vanuit de repo-root (de workspace-pakketten staan buiten apps/web):
#   docker build -f apps/web/Dockerfile -t elentrik-web .
#
# Alle configuratie komt bij het opstarten uit de omgeving (DATABASE_URL, BETTER_AUTH_*, NUXT_*, ...),
# niets ervan zit in het image; zie deploy/nas/.env.voorbeeld.

# Een exacte basis, minstens twee weken oud. pnpm via corepack op de versie waarmee pnpm-lock.yaml
# gemaakt is (pnpm komt overeen met `packageManager` in de root-package.json).
FROM node:24.21.0-slim AS bouw
ENV CI=true \
    NODE_OPTIONS=--max-old-space-size=4096
RUN corepack enable && corepack prepare pnpm@12.15.0 --activate
WORKDIR /app

# Eerst alleen de manifesten: de installatielaag blijft in de cache zolang de afhankelijkheden gelijk zijn.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/arei/package.json packages/arei/
COPY packages/layout/package.json packages/layout/
COPY packages/model/package.json packages/model/
COPY packages/render/package.json packages/render/
COPY packages/symbols/package.json packages/symbols/
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY tsconfig.base.json ./
COPY packages packages
COPY apps/web apps/web
RUN NODE_ENV=production pnpm --filter @elentrik/web build

# Het migratiescript (migreer.mjs) heeft drizzle-orm en postgres nodig. Nitro neemt in .output alleen mee wat de
# server zelf importeert, en de migrator hoort daar niet bij. Beide pakketten hebben geen eigen
# afhankelijkheden: een kopie zonder symlinks volstaat.
RUN mkdir -p /migratie/node_modules \
 && cp -rL apps/web/node_modules/drizzle-orm apps/web/node_modules/postgres /migratie/node_modules/ \
 && find /migratie/node_modules \( -name '*.d.ts' -o -name '*.d.cts' -o -name '*.d.mts' -o -name '*.map' \) -delete

FROM node:24.21.0-slim AS runtime
LABEL org.opencontainers.image.source="https://github.com/steffbeckers/elentrik" \
      org.opencontainers.image.title="elentrik-web"
# NODE_ENV=production is nodig: alleen dan weigert de opstartcontrole een onvolledige configuratie.
ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=3000
WORKDIR /app
COPY --from=bouw /app/apps/web/.output ./.output
COPY --from=bouw /app/apps/web/server/db/migraties ./migraties
COPY --from=bouw /migratie/node_modules ./node_modules
COPY apps/web/docker/migreer.mjs ./migreer.mjs
COPY --chmod=0755 apps/web/docker/start.sh ./start.sh

# Niet als root. Compose zet `user:` op ELENTRIK_UID:ELENTRIK_GID; de bestandenmap moet voor die
# gebruiker beschrijfbaar zijn.
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/gezondheid').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/app/start.sh"]
