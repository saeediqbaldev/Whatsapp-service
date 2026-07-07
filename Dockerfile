FROM node:20-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY index.js .
RUN mkdir -p /app/auth
EXPOSE 3000
CMD ["npm", "start"]
