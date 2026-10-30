FROM node:22-alpine
WORKDIR /app
COPY --chown=node:node package.json data.js map-layout.js engine.js bots.js practice.js server.js index.html app.js style.css ./
RUN mkdir -p /data && chown node:node /data
ENV PORT=3000 STATE_FILE=/data/rooms.json NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node","server.js"]
