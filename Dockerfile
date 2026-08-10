FROM node:18-alpine

# Install ffmpeg for video processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json ./

# Install dependencies
RUN npm install --production

# Copy application code
COPY server.js ./
COPY scripts/ ./scripts/
COPY public/ ./public/
COPY data/images/ ./data/images/

# Create data directories for volumes
RUN mkdir -p data/movies data/serie data/thumbnail data/uploads

EXPOSE 3000

CMD ["node", "server.js"]