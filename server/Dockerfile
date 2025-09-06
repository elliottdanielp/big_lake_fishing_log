FROM node:18-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --production --silent || true
COPY . .
EXPOSE 3917
CMD ["node","index.js"]
