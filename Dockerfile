FROM node:slim
WORKDIR /usr/src/app
RUN apt update && apt install -y git wget python3 build-essential
RUN git clone https://github.com/AGUickers/AGUickers_Bot.git /usr/src/app
RUN npm install
RUN chmod 777 /usr/src/app/scripts/*
RUN touch firstrun
CMD node app.js
