# Builds and runs the web deployment: @pcad/server (Express + SQLite +
# Google OAuth) serving the built @pcad/ui bundle as static files. The
# desktop (Electron) package is not needed for this image; its binary
# download is skipped so the build works on any Node base image/host.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/desktop/package.json packages/desktop/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace=@pcad/core \
 && npm run build --workspace=@pcad/ui \
 && npm run build --workspace=@pcad/server
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/server/dist packages/server/dist

EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
