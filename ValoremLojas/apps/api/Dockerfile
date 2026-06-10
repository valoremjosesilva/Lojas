# ─── Build stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json            ./apps/api/package.json
COPY packages/database/package.json   ./packages/database/package.json

RUN npm install

COPY apps/api/          ./apps/api/
COPY packages/database/ ./packages/database/

RUN npx prisma generate --schema=packages/database/schema.prisma
RUN npm run build --workspace=apps/api

# ─── Production stage ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
COPY apps/api/package.json            ./apps/api/package.json
COPY packages/database/package.json   ./packages/database/package.json

RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/apps/api/dist        ./apps/api/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY packages/database/schema.prisma          ./packages/database/schema.prisma

WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main"]
