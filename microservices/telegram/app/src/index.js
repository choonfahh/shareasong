const Telegraf = require(`telegraf`);
const express = require(`express`);
const fetch = require(`node-fetch`);
const Markup = require(`telegraf/markup`);
const Extra = require(`telegraf/extra`);
const Composer = require(`telegraf/composer`);
const session = require(`telegraf/session`);
const Stage = require(`telegraf/stage`);
const WizardScene = require(`telegraf/scenes/wizard`);
const Scene = require("telegraf/scenes/base");
const { mount } = require("telegraf");
const { enter, leave } = Stage;
const config = require(`./config.json`);
const msg = config.reply;

// process.env.DATA_WEBHOOK_URL

// JSON API request options
const requestOptions = {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  }
};

// Count how many requests there are in the database and start process of sending
function requestCount() {
  let body = {
    type: "count",
    args: {
      table: "request"
    }
  };

  requestOptions.body = JSON.stringify(body);
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let total = result.count;
      for (requestNumber = 1; requestNumber <= total; requestNumber++) {
        getRequest(requestNumber);
      }
    })
    .catch(error => {
      return console.log(`requestCount Failed: ${error}`);
    });
}

// Get request content
function getRequest(requestNumber) {
  let body = {
    type: "select",
    args: {
      table: "request",
      columns: ["content"],
      where: {
        id: {
          $eq: requestNumber
        }
      }
    }
  };

  requestOptions.body = JSON.stringify(body);
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let content = result[0].content;
      sendRequest(requestNumber, content);
    })
    .catch(error => {
      return console.log(`getRequest Failed: ${error}`);
    });
}

// Send request to users who are supposed to receive it
function sendRequest(requestNumber, content) {
  let body = {
    type: "select",
    args: {
      table: "bot_user",
      columns: ["telegram_id", "first_name", "last_name"],
      where: {
        $and: [
          {
            telegram_id: {
              $gte: "0"
            }
          },
          {
            last_request_received: {
              $eq: requestNumber - 1
            }
          }
        ]
      }
    }
  };

  requestOptions.body = JSON.stringify(body);
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      if (result.length !== 0) {
        for (selectedUser = 0; selectedUser < result.length; selectedUser++) {
          let userId = result[selectedUser].telegram_id;
          return bot.telegram
            .sendMessage(
              userId,
              `Hey ${
                result[selectedUser].first_name
              } there's an incoming song request!`
            )
            .then(() => {
              bot.telegram.sendMessage(
                userId,
                `${content}\n\n<b>Would you like to recommend a song?</b>`,
                {
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: msg.recommend.intent,
                          callback_data: `create-reply`
                        }
                      ]
                    ]
                  }
                }
              );
            })
            .then(deliveredRequest(requestNumber, userId));
        }
      }
    })
    .catch(error => {
      return console.log(`sendRequest Failed: ${error}`);
    });
}

// Update backend after request is delivered
function deliveredRequest(requestNumber, userId) {
  let body = {
    type: "bulk",
    args: [
      {
        type: "update",
        args: {
          table: "request",
          where: {
            id: {
              $eq: requestNumber
            }
          },
          $inc: {
            delivered_count: "1"
          }
        }
      },
      {
        type: "update",
        args: {
          table: "bot_user",
          where: {
            telegram_id: {
              $eq: userId
            }
          },
          $inc: {
            last_request_received: "1"
          }
        }
      }
    ]
  };

  requestOptions.body = JSON.stringify(body);
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      return console.log(`deliveredRequest Failed: ${error}`);
    });
}

// User indicates to start recommendProcess
function create(ctx) {
  ctx.reply(``); // Workaround to ensure delivery of messages
  ctx.state.queryNumber = ctx.callbackQuery.message.message_id;
  ctx.state.queryContext = ctx.callbackQuery.message.text.split("\n\n")[0];
  return (
    ctx.answerCbQuery(msg.recommend.start),
    ctx.scene.enter(`recommend-process`)
  );
}

// User cancels recommendProcess
function cancel(ctx) {
  return ctx.scene.leave(), ctx.reply(msg.recommend.cancel);
}

// User redo recommendProcess
function redo(ctx) {
  return (
    ctx.wizard.selectStep(1),
    ctx.reply(
      msg.recommend.select,
      Extra.inReplyTo(ctx.scene.state.queryNumber)
    )
  );
}

// User select song for recommendProcess
function select(ctx) {
  ctx.scene.state.queryNumber = ctx.state.queryNumber;
  ctx.scene.state.queryContext = ctx.state.queryContext;
  return (
    ctx.reply(
      msg.recommend.select,
      Extra.inReplyTo(ctx.scene.state.queryNumber)
    ),
    ctx.wizard.next()
  );
}

// User explain song for recommendProcess
function explain(ctx) {
  ctx.scene.state.songName = ctx.message.text.split("-")[0];
  ctx.scene.state.songArtist = ctx.message.text.split("-")[1];
  return ctx.reply(msg.recommend.explain), ctx.wizard.next();
}

// User dedicates song for recommendProcess
function dedicate(ctx) {
  ctx.scene.state.songExplain = ctx.message.text;
  return ctx.reply(msg.recommend.dedicate), ctx.wizard.next();
}

// Send API request to get request_id and user_id
function deliverOne(ctx) {
  let body = {
    type: "bulk",
    args: [
      {
        type: "select",
        args: {
          table: "request",
          columns: [
            "id",
            {
              name: "user",
              columns: ["first_name", "last_name"]
            }
          ],
          where: {
            content: {
              $eq: ctx.scene.state.queryContext
            }
          }
        }
      },
      {
        type: "select",
        args: {
          table: "bot_user",
          columns: ["id"],
          where: {
            telegram_id: {
              $eq: ctx.message.chat.id
            }
          }
        }
      }
    ]
  };

  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let requestId = result[0][0].id;
      let recipient = result[0][0].user.first_name;
      let userId = result[1][0].id;
      return deliverTwo(ctx, requestId, recipient, userId);
    })
    .catch(error => {
      return console.log(`deliverOne Failed: ${error}`);
    });
}

// send api request to post recommendation
function deliverTwo(ctx, requestId, recipient, userId) {
  songDedicate = ctx.message.text;
  let body = {
    type: "bulk",
    args: [
      {
        type: "insert",
        args: {
          table: "recommendation",
          objects: [
            {
              song: ctx.scene.state.songName,
              artist: ctx.scene.state.songArtist,
              request_id: requestId,
              explanation: ctx.scene.state.songExplain,
              dedication: ctx.scene.state.songDedicate,
              user_id: userId
            }
          ]
        }
      },
      {
        type: "update",
        args: {
          table: "request",
          where: {
            id: {
              $eq: requestId
            }
          },
          $inc: {
            replied_count: "1"
          }
        }
      },
      {
        type: "update",
        args: {
          table: "bot_user",
          where: {
            telegram_id: {
              $eq: ctx.message.chat.id
            }
          },
          $inc: {
            recommendation_count: "1"
          },
          $default: ["last_active"]
        }
      }
    ]
  };

  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return deliverThree(ctx, recipient);
    })
    .catch(error => {
      return console.log(`deliverTwo Failed: ${error}`);
    });
}

// send delivered message, validation, next request
function deliverThree(ctx, recipient) {
  let subscribeStatus = true;
  let responseTime = 1000 * 60 * 7; // User receives validation response after 7 mins
  return (
    ctx.reply(msg.recommend.deliver),
    subscribeUpdate(ctx, subscribeStatus),
    setTimeout(() => {
      return ctx.reply(`${recipient} really loved your recommendation!`);
    }, responseTime),
    ctx.scene.leave()
  );
}

// Send API request to create new user inside bot_user
function createUser(ctx) {
  let body = {
    type: "insert",
    args: {
      table: "bot_user",
      objects: [
        {
          telegram_id: ctx.message.chat.id,
          first_name: ctx.message.chat.first_name,
          last_name: ctx.message.chat.last_name
        }
      ]
    }
  };

  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return ctx.reply(msg.basic.welcome);
    })
    .catch(error => {
      return console.log(`createUser Failed: ${error}`);
    });
}

// Send API request to check whether user exists
function checkUser(ctx) {
  let body = {
    type: "select",
    args: {
      table: "bot_user",
      columns: ["id"],
      where: {
        telegram_id: {
          $eq: ctx.message.chat.id
        }
      }
    }
  };

  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      if (result[0] === undefined) {
        return createUser(ctx);
      } else {
        return ctx.reply(msg.basic.start);
      }
    })
    .catch(error => {
      return console.log(`checkUser Failed: ${error}`);
    });
}

// Send API to update subscribe status
function subscribeUpdate(ctx, subscribeStatus) {
  let body = {
    type: "update",
    args: {
      table: "bot_user",
      where: {
        telegram_id: {
          $eq: ctx.message.chat.id
        }
      },
      $set: {
        subscribe_status: subscribeStatus
      },
      $default: ["last_active"]
    }
  };
  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      return console.log(`subscribeUpdate Failed: ${error}`);
    });
}

// User subs to request pings; sub on by default
function subscribe(ctx) {
  ctx.reply(``); // Workaround to ensure delivery of messages
  let subscribeStatus = true;
  return subscribeUpdate(ctx, subscribeStatus), ctx.reply(msg.recommend.sub);
}

// User unsubs to request pings
function unsubscribe(ctx) {
  ctx.reply(``); // Workaround to ensure delivery of messages
  let subscribeStatus = false;
  return subscribeUpdate(ctx, subscribeStatus), ctx.reply(msg.recommend.unsub);
}

// recommendProcess scenes
const recommendProcess = new WizardScene(
  `recommend-process`,
  mount(`callback_query`, ctx => {
    select(ctx); // Step 1: Select Song
  }),
  mount(`text`, ctx => {
    explain(ctx); // Step 2: Explain Why
  }),
  mount(`text`, ctx => {
    dedicate(ctx); // Step 3: Dedicate Message
  }),
  mount(`text`, ctx => {
    deliverOne(ctx); // Step 4: Deliver Recommendation (1-3)
  })
);

// User cancels current input
recommendProcess.command(`cancel`, ctx => {
  cancel(ctx);
});

// User unsubs during recommendProcess
recommendProcess.command(`unsub`, ctx => {
  cancel(ctx);
  unsubscribe(ctx);
});

// User restarts recommendProcess
recommendProcess.command(`redo`, ctx => {
  redo(ctx);
});

// User can only subscribe without any existing process; this function prevents wizard from moving forward
recommendProcess.command(`sub`, ctx => {
  subscribe(ctx);
});

// askProcess initialized
const askProcess = new Scene(`ask-process`);

// User prompted to join waiting list to ask for music
askProcess.enter(ctx => ctx.reply(msg.ask.intent));

// Send API to update subscribe status
function waitingUpdate(ctx, waitingStatus) {
  let body = {
    type: "update",
    args: {
      table: "bot_user",
      where: {
        telegram_id: {
          $eq: ctx.message.chat.id
        }
      },
      $set: {
        waiting_list: waitingStatus
      },
      $default: ["last_active"]
    }
  };
  requestOptions.body = JSON.stringify(body);
  ctx.reply(``); // Workaround to ensure delivery of messages
  fetch(process.env.DATA_WEBHOOK_URL, requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      return console.log(`waitingUpdate Failed: ${error}`);
    });
}

// User indicates to join the waiting list
askProcess.command(`join`, ctx => {
  let waitingStatus = true;
  return (
    waitingUpdate(ctx, waitingStatus),
    ctx.reply(msg.ask.join),
    ctx.scene.leave()
  );
});

// User declines to join the waiting list
askProcess.command(`no`, ctx => {
  let waitingStatus = false;
  return (
    waitingUpdate(ctx, waitingStatus),
    ctx.reply(msg.ask.decline),
    ctx.scene.leave()
  );
});

// Only accepts two commands inside the process
askProcess.on(`message`, ctx => {
  return ctx.reply(msg.ask.default);
});

// Bot, server, stage initialized
const server = express();
let requestFreq = 1000 * 60 * 60 * 24; // New request appears daily.
let sessionMax = 60 * 10; // recommendProcess lasts for 10 minutes max.
const stage = new Stage([recommendProcess, askProcess], {
  ttl: sessionMax
});
const bot = new Telegraf(process.env.TELEGRAM_API); // for dev, use dev.Api

// Creation of server at port 8080
server.listen(8080);

server.get("/", (req, res) => {
  res.send("Share A Song Bot");
});

// Creation of bot webhook to initiate
server.use(bot.webhookCallback("/" + process.env.TELEGRAM_WEBHOOK_PATH));
bot.telegram.setWebhook(
  process.env.TELEGRAM_WEBHOOK_URL + process.env.TELEGRAM_WEBHOOK_PATH
);

// Utility of session and stage middleware
bot.use(session());
bot.use(stage.middleware());

// Upon bot start
bot.start(ctx => {
  checkUser(ctx);
});

// User enters the asking process
bot.command(`ask`, enter(`ask-process`));

// User can only subscribe without any existing process
bot.command(`sub`, ctx => {
  subscribe(ctx);
});

// User can also unsub outside of recommendProcess
bot.command(`unsub`, ctx => {
  unsubscribe(ctx);
});

// Internal testing purposes
bot.command(`version`, ctx => {
  return ctx.reply(`This version is currently for internal testing`);
})

// Redirect to start of recommendationProcess
bot.action(`create-reply`, ctx => {
  create(ctx);
});

// No running processes in the bot
bot.on(`message`, ctx => {
  return ctx.reply(msg.basic.default);
});

// Bot activated
bot.startPolling();

// Daily request notif refresh
setInterval(requestCount, requestFreq);
