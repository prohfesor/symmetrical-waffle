# Builds and runs the web deployment: @wafflecad/server (Express + SQLite +
# Google OAuth) serving the built @wafflecad/ui bundle as static files. The
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
RUN npm run build --workspace=@wafflecad/core \
 && npm run build --workspace=@wafflecad/ui \
 && npm run build --workspace=@wafflecad/server
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8787 \
    DB_PATH=/data/wafflecad.sqlite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/ui/dist packages/ui/dist
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/server/dist packages/server/dist

# Accounts, drawings, sessions and the generated session secret live here: mount a volume to keep them.
RUN mkdir -p /data && chown node:node /data
VOLUME /data
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "packages/server/dist/index.js"]
