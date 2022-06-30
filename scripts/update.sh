#!/bin/sh
cd ..
git stash
git pull
npm update
touch ../update