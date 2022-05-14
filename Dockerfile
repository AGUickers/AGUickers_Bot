FROM node:slim
WORKDIR /usr/src/app
RUN apt update && apt install -y git wget python3 build-essential
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod 777 /usr/src/app/scripts/*
RUN git init
CMD node app.js
