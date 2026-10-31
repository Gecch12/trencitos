FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --chown=node:node board-3d.js wagon-preview.js wagon-renderer.js wagon-models.mjs board-camera.js board-3d.css data.js map-layout.js game-ui.js lobby-ui.js engine.js game-clock.js bots.js practice-bot.js practice.js multiplayer.js room-store.js supabase-store.js durable-queue.js account-auth.js account-seats.js account-ui.js server.js index.html privacy.html privacy.css app.js style.css game.css responsive.css lobby.css practice-planner.js practice-tactics.js practice-search.js ./
COPY --chown=node:node assets ./assets
RUN mkdir -p /data && chown node:node /data
ENV PORT=3000 STATE_FILE=/data/rooms.json NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","server.js"]
