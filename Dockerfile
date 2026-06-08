# Root Dockerfile for Render.
# Render looks for ./Dockerfile by default; keep this file at the repository root.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

COPY apps/render-preview ./apps/render-preview
COPY docs/atto-flow ./docs/atto-flow
COPY docs/attozap ./docs/attozap
COPY modules/atto-ai/README.md ./modules/atto-ai/README.md

EXPOSE 10000

CMD ["node", "apps/render-preview/server.js"]
