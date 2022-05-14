FROM node:slim
WORKDIR /usr/src/app
RUN apt update && apt install -y git wget python3 build-essential
COPY package*.json ./
RUN npm install
COPY . .
RUN chmod 777 /usr/src/app/scripts/*
RUN git init
RUN git remote set-url origin https://github.com/alexavil/AGUickers_Bot.git
CMD node app.js
