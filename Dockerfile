# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci

FROM deps AS builder
WORKDIR /app
COPY tsconfig.base.json ./
COPY server/tsconfig.json server/tsconfig.json
COPY server/src server/src
COPY server/migrations server/migrations
COPY client/tsconfig.json client/tsconfig.json
COPY client/vite.config.ts client/vite.config.ts
COPY client/index.html client/index.html
COPY client/src client/src
RUN npm run build

FROM node:22-alpine AS api-deps
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci --omit=dev --workspaces --include-workspace-root && npm cache clean --force

FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=api-deps --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=api-deps --chown=node:node /app/node_modules node_modules
COPY --from=api-deps --chown=node:node /app/server/package.json server/package.json
COPY --from=builder --chown=node:node /app/server/dist server/dist
COPY --chown=node:node docs/api/openapi.yaml docs/api/openapi.yaml
USER node
EXPOSE 3000
CMD ["node", "server/dist/src/server.js"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS client
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/client/dist /usr/share/nginx/html
EXPOSE 8080
