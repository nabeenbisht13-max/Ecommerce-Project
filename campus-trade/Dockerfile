FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
# No third-party dependencies, so nothing to install yet.
# When you add some, replace this with: COPY package-lock.json ./ && RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000 3001 3002 3003 3004
# Default: run all three processes in one container. docker-compose overrides this per service.
CMD ["node", "start-all.js"]
