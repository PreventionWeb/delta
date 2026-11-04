# Use the official Node.js 24 image as the base
FROM node:24-bookworm-slim

# Set the working directory to /delta
WORKDIR /delta

# Expose the port that the application will use
EXPOSE 3000

# Set the environment variables (development-only image)
ENV NODE_ENV=development
ENV PORT=3000

# Run the command to start the application using the unified single-port server
CMD ["sh", "-c", "PORT=${PORT:-3000} yarn dev"]