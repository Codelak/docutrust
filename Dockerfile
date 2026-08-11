FROM node:20-slim AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-slim
WORKDIR /app
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

COPY --from=base /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations

RUN useradd -r -u 10001 docutrust
USER docutrust

EXPOSE 3000
CMD ["node", "src/index.js"]
