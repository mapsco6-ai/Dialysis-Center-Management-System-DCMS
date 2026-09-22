FROM node:22-bookworm-slim

WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm install

COPY packages/shared packages/shared
COPY apps/web apps/web

WORKDIR /repo/apps/web

ARG NEXT_PUBLIC_API_URL=/api/v2
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Next resolves rewrites() at build time into the routes manifest, so the
# API proxy target has to be present here, not only at run time.
ARG API_PROXY_TARGET=http://api:3001
ENV API_PROXY_TARGET=$API_PROXY_TARGET

RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start"]
