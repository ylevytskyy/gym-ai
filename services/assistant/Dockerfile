# Build from the repo root:
#   docker build -f services/assistant/Dockerfile -t aura-assistant .
# Node version: none pinned in the repo (engines >=18), so node:24-alpine.

FROM node:24-alpine AS build
WORKDIR /app

# 1. Shared package first: the assistant depends on it via file:../../packages/health-core
COPY packages/health-core/package.json packages/health-core/package-lock.json packages/health-core/
WORKDIR /app/packages/health-core
RUN npm ci --ignore-scripts
COPY packages/health-core/ ./
RUN npm run build

# 2. The assistant. It has no package-lock.json in the repo, so npm ci is not possible;
#    npm install is used without writing a lockfile.
WORKDIR /app/services/assistant
COPY services/assistant/package.json ./
RUN if [ -f package-lock.json ]; then npm ci --ignore-scripts; else npm install --ignore-scripts --no-package-lock; fi
COPY services/assistant/tsconfig.json ./
COPY services/assistant/src ./src
RUN npm run build

FROM node:24-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app

# Built shared package (package.json + dist only)
COPY --from=build /app/packages/health-core/package.json packages/health-core/package.json
COPY --from=build /app/packages/health-core/dist packages/health-core/dist

# Repo-level JSON the service loads at runtime (src/repo-files.ts walks up from dist/ to find them)
COPY schemas/ schemas/
COPY catalog/exercises.json catalog/exercises.json

WORKDIR /app/services/assistant
COPY services/assistant/package.json ./
RUN npm install --omit=dev --ignore-scripts --no-package-lock && npm cache clean --force
COPY --from=build /app/services/assistant/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
