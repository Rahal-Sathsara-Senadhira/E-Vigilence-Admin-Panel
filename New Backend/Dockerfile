# The backend on Railway (docs/22 §1). Railway builds this when the service's
# root directory is "New Backend" (railway.json selects the Dockerfile).
# Production dependencies only: no test tools, no MongoDB test binary.

FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a code-only change reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# The app, and the scripts and data run on the server (create-main-admin,
# import-reference-data).
COPY src ./src
COPY scripts ./scripts
COPY data ./data

# Settings come from Railway's variables, never from a file in the image.
USER node
CMD ["node", "src/server.js"]
