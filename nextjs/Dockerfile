# syntax=docker/dockerfile:1.7

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=fitness-api-yarn-dev,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --non-interactive --production=false

FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN --mount=type=cache,id=fitness-api-yarn-prod,target=/usr/local/share/.cache/yarn,sharing=locked \
    yarn install --frozen-lockfile --non-interactive --production=true

FROM node:${NODE_VERSION} AS build
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/yarn.lock ./yarn.lock
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
