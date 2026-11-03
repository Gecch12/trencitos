FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Runtime modules and browser resources currently live at the repository root.
# Keep the extracted game modules together; server.js still controls public URLs.
COPY --chown=node:node *.js *.mjs *.css *.html ./
COPY --chown=node:node game ./game
COPY --chown=node:node assets ./assets
RUN mkdir -p /data && chown node:node /data
ENV PORT=3000 STATE_FILE=/data/rooms.json NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","server.js"]
