# Lambda container image for the telemetry ingestion API.
#
# NOTE: a container image is NOT required for Lambda — a zip package is simpler
# (see server/README.md "zip alternative"). This image exists because enterprise
# pipelines often standardize on ECR. The Terraform uses package_type = "Image".

# ---- builder: pnpm install + Vite bundle, then prune to prod deps ----
FROM node:22.18.0-slim AS builder
WORKDIR /build
RUN corepack enable
COPY package.json .npmrc ./
COPY pnpm-lock.yaml* ./
RUN pnpm install
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm build
# Drop devDeps (hono/zod are already bundled into dist/index.js); leaves only
# the externalized runtime deps: pg + @aws-sdk/client-secrets-manager.
RUN pnpm prune --prod

# ---- runtime: AWS-provided Lambda Node 22 base image ----
FROM public.ecr.aws/lambda/nodejs:22
WORKDIR ${LAMBDA_TASK_ROOT}
COPY --from=builder /build/package.json ./
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./
# <file>.<exportedHandler> — index.js exports `handler`.
CMD [ "index.handler" ]
