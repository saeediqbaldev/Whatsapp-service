FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache git
COPY package.json .
RUN npm install
COPY index.js .
RUN mkdir -p /app/auth
EXPOSE 3000
CMD ["npm", "start"]
