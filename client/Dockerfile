# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Use npm ci for faster, more reliable installs
RUN npm ci

# Accept build arguments
ARG REACT_APP_API_URL
ARG REACT_APP_SOCKET_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_SOCKET_URL=$REACT_APP_SOCKET_URL

# Copy source code last to maximize cache hits
COPY . .
RUN npm run build

# Production stage - simple container to copy files
FROM alpine:latest

WORKDIR /app

# Copy built files to a volume that will be mounted to host
COPY --from=builder /app/build ./build

# Create a script to copy files to the mounted volume
RUN echo '#!/bin/sh' > /copy-files.sh && \
    echo 'cp -r /app/build/* /output/' >> /copy-files.sh && \
    echo 'echo "Client build files copied to dockerdata/client-build"' >> /copy-files.sh && \
    echo 'sleep infinity' >> /copy-files.sh && \
    chmod +x /copy-files.sh

CMD ["/copy-files.sh"]