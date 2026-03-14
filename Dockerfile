FROM node:24-bookworm-slim AS build

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---

FROM node:24-bookworm-slim AS runtime

RUN apt-get update && \
    apt-get install -y --no-install-recommends gnubg gnubg-data && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=build /app/build build/
COPY --from=build /app/node_modules node_modules/
COPY --from=build /app/package.json .
COPY --from=build /app/prisma prisma/

ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0
ENV GNU_BG_PATH=/usr/games/gnubg

EXPOSE 8080

CMD ["node", "build"]
