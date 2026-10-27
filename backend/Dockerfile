FROM node:22-slim

# ffmpeg/ffprobe are used for video-evidence frame extraction (src/cv/video.js).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .

ENV PORT=8000
EXPOSE 8000
CMD ["node", "src/server.js"]
