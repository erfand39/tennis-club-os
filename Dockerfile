FROM node:24.15.0-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY next.config.mjs tsconfig.json next-env.d.ts ./
COPY src ./src
COPY local/auth-client.mjs ./local/auth-client.mjs
COPY supabase/types ./supabase/types
COPY prototype ./prototype
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:24.15.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=node:node /app/package.json /app/next.config.mjs ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --chown=node:node scripts/migrate-local.mjs scripts/owner-recovery.mjs ./scripts/
COPY --chown=node:node supabase/migrations ./supabase/migrations
COPY --chown=node:node local/auth-client.mjs ./local/auth-client.mjs
COPY --chown=node:node local/migrations ./local/migrations
USER node
EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
