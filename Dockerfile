FROM node:slim
WORKDIR /usr/src/app
RUN apt update && apt install -y git wget python3 build-essential
COPY package*.json ./
RUN npm install
RUN chmod 777 ./scripts/*
COPY . .
CMD node app.js
