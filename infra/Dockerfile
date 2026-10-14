FROM node:22.23.2-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
RUN pnpm --filter @helios/worker deploy --prod --legacy /runtime
FROM node:22.23.2-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
CMD ["node","apps/web/server.js"]
FROM node:22.23.2-bookworm-slim AS worker
WORKDIR /app
COPY --from=build --chown=node:node /runtime ./apps/worker
RUN ln -s apps/worker/node_modules node_modules && mkdir packages && ln -s ../apps/worker/node_modules/@helios/backend packages/backend
ENV NODE_ENV=production
USER node
CMD ["node_modules/.bin/tsx","apps/worker/src/index.ts"]

