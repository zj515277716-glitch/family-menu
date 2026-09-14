# family-menu api 镜像（自 docker-compose.yml dockerfile_inline 迁出，2026-09-14）
# 迁出原因：构建资源限制需经 compose build.args / docker build --build-arg 注入，
# 而 dockerfile_inline 无法被独立构建命令引用；独立 Dockerfile 为标准形态。
# corepack 拉 pnpm 本体默认走 npmjs（海外），国内服务器会超时——改走 npmmirror
FROM node:22-slim AS builder
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
# 构建期 node 堆软限制（2026-09-14 OOM 治理，用户裁决：build 限资源不升配）
# 服务器 1.8G RAM：pnpm install/tsc 峰值经此钳制，防把系统推向全局 OOM（dockerd 被杀）。
# 超限则 node 进程自崩（build 失败 exit 非 0，可重试），伤不到运行时。勿移除。
ARG NODE_OPTIONS=--max-old-space-size=768
ENV NODE_OPTIONS=${NODE_OPTIONS}
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY tools/ ./tools/
RUN pnpm install --frozen-lockfile
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN pnpm --filter @family-menu/shared build \
    && pnpm --filter @family-menu/engine build \
    && pnpm --filter @family-menu/list-merger build \
    && pnpm --filter @family-menu/api build

FROM node:22-slim AS runner
WORKDIR /app
COPY --from=builder /app/ ./
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "apps/api/dist/server.js"]
