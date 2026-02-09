FROM oven/bun:1.3.4-slim AS build

WORKDIR /app

COPY package.json package.json
COPY apps/basket/package.json ./apps/basket/package.json
COPY packages/*/package.json ./packages/

COPY packages/ ./packages/

RUN bun install --ignore-scripts

COPY apps/basket/src ./apps/basket/src
COPY apps/basket/tsconfig.json ./apps/basket/tsconfig.json

ENV NODE_ENV=production

WORKDIR /app/apps/basket

RUN bun build \
	--compile \
	--minify-whitespace \
	--minify-syntax \
	--target bun \
	--outfile /app/server \
	--sourcemap \
	--bytecode \
	./src/index.ts

FROM gcr.io/distroless/cc

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 4000