FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 3002
CMD ["node", "src/index.js"]
