# 1. Use official Bun image (already has Bun installed)
FROM oven/bun:latest

# 2. Set working directory
WORKDIR /app

# 3. Copy package.json and bun.lockb for dependency caching
COPY package.json bun.lockb* ./

# 4. Install dependencies using Bun
RUN bun install

# 5. Copy all source files
COPY . .

# 6. Build TypeScript (NestJS)
RUN bun run build

# 7. Expose the port your NestJS app listens on
EXPOSE 3000

# 8. Start the app
CMD ["bun", "start"]
