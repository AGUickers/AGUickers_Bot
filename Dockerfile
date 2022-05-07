FROM node:slim
WORKDIR /usr/src/app
RUN apt update && apt install -y git wget python
COPY package*.json ./
RUN npm install
COPY . .
CMD node app.js
