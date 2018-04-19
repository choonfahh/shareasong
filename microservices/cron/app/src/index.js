const fetch = require(`node-fetch`);
const CronJob = require('cron').CronJob;

// process.env.DATA_WEBHOOK_URL
// "https://data.fusee48.hasura-app.io/v1/query"

// JSON API request options
const requestOptions = {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  }
};

var requestTimer = new CronJob({
  cronTime: '*/15 * * * *', // Reduce every 15 mins
  onTick: () => {
    let body = {
        "type": "update",
        "args": {
            "table": "bot_user",
            "where": {
                "next_request_timer": {
                    "$gt": "0"
                }
            },
            "$inc": {
                "next_request_timer": "-1"
            }
        }
    };

    requestOptions.body = JSON.stringify(body);
    fetch("https://data.fusee48.hasura-app.io/v1/query", requestOptions)
      .then(response => {
        return response.json();
      })
      .then(result => {
        return console.log(`requestTimerDecrement Success`);
      })
      .catch(error => {
        return console.log(`requestTimerDecrement Failed: ${error}`);
      });
  },
  start: false
});

requestTimer.start();
