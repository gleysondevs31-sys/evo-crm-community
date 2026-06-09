# Root Dockerfile for Render.
# Render looks for ./Dockerfile by default; keep this file at the repository root.
FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=10000

COPY package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY apps ./apps
COPY modules ./modules
COPY packages ./packages
COPY prisma ./prisma
COPY docs ./docs

EXPOSE 10000

CMD ["node", "apps/api/server.js"]
