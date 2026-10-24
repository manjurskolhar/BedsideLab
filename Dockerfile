FROM node:22-alpine
WORKDIR /app
COPY server.js scoring.js ./
COPY public ./public
COPY seed ./seed
ENV PORT=8080
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["node", "server.js"]
