# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm install

COPY apps/web/ ./apps/web/

RUN npm run build --workspace=apps/web

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json

RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/apps/web/.next    ./apps/web/.next
COPY apps/web/next.config.mjs              ./apps/web/next.config.mjs

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web"]
