FROM mhart/alpine-node:8

WORKDIR /src

# Add package.json
ADD app/src/package.json /src/package.json

#install node modules
RUN yarn install

#Add the source code
ADD app/src /src

CMD ["node", "index.js"]

EXPOSE 8080
