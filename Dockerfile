FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
# Copy the complete runtime boundaries, without development tools or credentials.
COPY --chown=node:node server.js ./
COPY --chown=node:node backend ./backend
COPY --chown=node:node frontend ./frontend
COPY --chown=node:node shared ./shared
COPY --chown=node:node game ./game
RUN mkdir -p /data && chown node:node /data
ENV PORT=3000 STATE_FILE=/data/rooms.json NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","server.js"]
