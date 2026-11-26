FROM node:24-bookworm-slim
WORKDIR /app
COPY backend/server.cjs ./backend/server.cjs
RUN mkdir /data && chown node:node /data
USER node
ENV PORT=3000 HOST=0.0.0.0 DB_PATH=/data/scout.sqlite
EXPOSE 3000
CMD ["node", "backend/server.cjs"]
