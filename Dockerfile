FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Run sync once at startup, then daily at 3:00 AM via crond
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
