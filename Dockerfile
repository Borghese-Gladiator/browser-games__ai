# syntax=docker/dockerfile:1

# Build stage: install all deps (incl. dev) and produce the static client in dist/.
# Copy the whole context (minus .dockerignore) so a new workspace needs no edit here.
FROM node:22-slim AS build
WORKDIR /app

COPY . .
RUN npm ci
RUN npm run build

# Runtime stage: keep only production deps and the source the gateway imports.
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY . .
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "bin/dev-server.js"]
