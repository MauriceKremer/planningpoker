# Multi-stage: the client bundle is built inside this image and served by the
# same image — no copy-container, no bind-mounted build directory, no
# dockerdata round-trip. The client source arrives as a named build context
# (compose: build.additional_contexts.client).
FROM node:20-alpine AS client-build
WORKDIR /app

COPY --from=client package*.json ./
RUN npm ci

# No API/socket env baking: the bundle uses same-origin relative endpoints by
# default (CSP connect-src 'self' only allows same origin anyway). Dev uses
# client/.env via dev-setup.sh.

COPY --from=client . .
RUN npm run build

FROM nginx:alpine

RUN rm /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-main.conf /etc/nginx/nginx.conf

COPY --from=client-build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]