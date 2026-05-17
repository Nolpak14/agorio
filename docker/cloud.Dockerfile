# Multi-stage build for the self-hosted cloud.agorio.dev app.
#
# Stage 1: install workspace deps (the cloud app depends on the SDK build).
# Stage 2: build Next.js standalone.
# Stage 3: minimal runtime image.

FROM node:20-alpine AS deps
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY cloud/package.json cloud/package-lock.json ./cloud/
RUN npm ci --include=dev
RUN cd cloud && npm ci --include=dev

FROM node:20-alpine AS build
WORKDIR /workspace
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/cloud/node_modules ./cloud/node_modules
COPY . .
RUN npm run build
RUN cd cloud && npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Copy the standalone Next output + static assets.
COPY --from=build /workspace/cloud/.next/standalone ./
COPY --from=build /workspace/cloud/.next/static ./.next/static
COPY --from=build /workspace/cloud/public ./public 2>/dev/null || true

# Drizzle CLI is needed for the `migrate` service in docker-compose.yml.
RUN npm install --omit=dev -g drizzle-kit@latest

EXPOSE 3000
CMD ["node", "server.js"]
