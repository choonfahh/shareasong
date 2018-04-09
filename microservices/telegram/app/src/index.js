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

// Declaration of user variables
var pendingSession;
var subscribeStatus = true;
var waitingList;
var nextRequestTimer = 0;
var pendingRequest;

// Temporal storage of JSON variables - strictly synchronous
var queryNumber;
var queryContext;
var songName;
var songArtist;
var songExplain;
var songDedicate;

// Send API to update pending Request
function pendingRequestUpdate(ctx) {
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
        pending_request: pendingRequest
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
      return;
    })
    .catch(error => {
      return console.log(`pendingRequestUpdate Failed: ${error}`);
    });
}

// Send API request to get last request received
function checkLastRequest(ctx) {
  let body = {
    type: "bulk",
    args: [
      {
        type: "select",
        args: {
          table: "bot_user",
          columns: ["last_request_received"],
          where: {
            telegram_id: {
              $eq: ctx.message.chat.id
            }
          }
        }
      },
      {
        type: "count",
        args: {
          table: "request"
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
      pendingRequest = false;
      pendingRequestUpdate(ctx);
      let lastRequest = result[0][0].last_request_received;
      let totalRequests = result[1].count;
      let refreshUpdate = 1000 * 60 * 60 * 0.5; // Refreshes whether there's any new requests in one hour
      if (nextRequestTimer === 0) {
        if (lastRequest === totalRequests) {
          return setTimeout(checkLastRequest, refreshUpdate, ctx, lastRequest);
        } else {
          if (subscribeStatus) {
            return getRequest(ctx, lastRequest);
          } else {
            return;
          }
        }
      } else {
        return;
      }
    })
    .catch(error => {
      return console.log(`checkLastRequest Failed: ${error}`);
    });
}

// Send API request to get request details
function getRequest(ctx, lastRequest) {
  let body = {
    type: "select",
    args: {
      table: "request",
      columns: ["content"],
      where: {
        id: {
          $eq: lastRequest + 1
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
      let requestContent = result[0].content;
      return request(ctx, requestContent, lastRequest);
    })
    .catch(error => {
      return console.log(`getRequest Failed: ${error}`);
    });
}

// Send API request to update successful request delivery
function deliveredRequest(ctx, lastRequest) {
  let body = {
    type: "bulk",
    args: [
      {
        type: "update",
        args: {
          table: "request",
          where: {
            id: {
              $eq: lastRequest + 1
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
              $eq: ctx.message.chat.id
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
  ctx.reply(``); // Workaround to ensure delivery of messages
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

// Send API to update next Request timer
function nextRequestTimerUpdate(ctx) {
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
        next_request_timer: nextRequestTimer
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
      return;
    })
    .catch(error => {
      return console.log(`subscribeUpdate Failed: ${error}`);
    });
}

// Request ping to user
function request(ctx, requestContent, lastRequest) {
  nextRequestTimer = 24 / 0.5;
  pendingRequest = true;
  pendingRequestUpdate(ctx);
  let newRequest = 1000 * 60 * 60 * 24; // User receives new request after 1 day
  let countdownDecrement = 1000 * 60 * 60 * 0.5; // Updates countdown every hour
  let requestCountdown = setInterval(() => {
    nextRequestTimer--;
    nextRequestTimerUpdate(ctx);
    if (nextRequestTimer === 0) {
      clearInterval(requestCountdown);
    }
  }, countdownDecrement);
  ctx.reply(``); // Workaround to ensure delivery of messages
  return (
    ctx
      .reply(
        `Hey ${ctx.message.chat.first_name} there's an incoming song request!`
      )
      .then(() => {
        return ctx.replyWithHTML(
          `${requestContent}\n\n<b>Would you like to recommend a song?</b>`,
          Markup.inlineKeyboard([
            Markup.callbackButton(msg.recommend.intent, `create-reply`)
          ]).extra()
        );
      })
      .then(deliveredRequest(ctx, lastRequest)),
    setTimeout(checkLastRequest, newRequest, ctx)
  );
}

// User indicates to start recommendProcess
function create(ctx) {
  queryNumber = ctx.callbackQuery.message.message_id;
  queryContext = ctx.callbackQuery.message.text.split("\n\n")[0];
  subscribeStatus = true;
  return (
    ctx.answerCbQuery(msg.recommend.create),
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
    ctx.reply(msg.recommend.select, Extra.inReplyTo(queryNumber))
  );
}

// User select song for recommendProcess
function select(ctx) {
  pendingSession = ctx.scene.session.current;
  return (
    ctx.reply(msg.recommend.select, Extra.inReplyTo(queryNumber)),
    ctx.wizard.next()
  );
}

// User explain song for recommendProcess
function explain(ctx) {
  let songRaw = ctx.message.text;
  songName = songRaw.split("-")[0];
  songArtist = songRaw.split("-")[1];
  return ctx.reply(msg.recommend.explain), ctx.wizard.next();
}

// User dedicates song for recommendProcess
function dedicate(ctx) {
  songExplain = ctx.message.text;
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
              $eq: queryContext
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
              song: songName,
              artist: songArtist,
              request_id: requestId,
              explanation: songExplain,
              dedication: songDedicate,
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
  pendingSession = undefined;
  let responseTime = 1000 * 60 * 7; // User receives validation response after 7 mins
  ctx.reply(``); // Workaround to ensure delivery of messages
  return (
    ctx.reply(msg.recommend.deliver),
    setTimeout(() => {
      return ctx.reply(`${recipient} really loved your recommendation!`);
    }, responseTime),
    ctx.scene.leave()
  );
}

// Send API request to create new user inside bot_user
function createUser(ctx) {
  pendingSession = undefined;
  subscribeStatus = true;
  waitingList = false;
  nextRequestTimer = 0;
  pendingRequest = false;

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
      return checkLastRequest(ctx);
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
function subscribeUpdate(ctx) {
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
  if (subscribeStatus) {
    return ctx.reply(msg.recommend.subExist);
  } else {
    if (pendingRequest) {
      subscribeStatus = true;
      return subscribeUpdate(ctx), ctx.reply(msg.recommend.sub);
    } else {
      subscribeStatus = true;
      return (
        subscribeUpdate(ctx),
        checkLastRequest(ctx),
        ctx.reply(msg.recommend.sub)
      );
    }
  }
}

// User unsubs to request pings
function unsubscribe(ctx) {
  ctx.reply(``); // Workaround to ensure delivery of messages
  if (subscribeStatus) {
    subscribeStatus = false;
    return subscribeUpdate(ctx), ctx.reply(msg.recommend.unsub);
  } else {
    return ctx.reply(msg.recommend.unsubExist);
  }
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
  pendingSession = undefined;
  cancel(ctx);
});

// User unsubs during recommendProcess
recommendProcess.command(`unsub`, ctx => {
  pendingSession = undefined;
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
function waitingUpdate(ctx) {
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
        waiting_list: waitingList
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
  if (waitingList) {
    return ctx.reply(msg.ask.joinExist), ctx.scene.leave();
  } else {
    waitingList = true;
    return waitingUpdate(ctx), ctx.reply(msg.ask.join), ctx.scene.leave();
  }
});

// User declines to join the waiting list
askProcess.command(`no`, ctx => {
  if (!waitingList) {
    return ctx.reply(msg.ask.decline), ctx.scene.leave();
  } else {
    waitingList = false;
    return waitingUpdate(ctx), ctx.reply(msg.ask.decline), ctx.scene.leave();
  }
});

// Only accepts two commands inside the process
askProcess.on(`message`, ctx => {
  return ctx.reply(msg.ask.default);
});

// Bot, server, stage initialized
let sessionMax = 60 * 5; // recommendProcess lasts for 5 minutes max.
const server = express();
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

// FOR INTERNAL TESTING
bot.command(`restart`, ctx => {
  checkLastRequest(ctx);
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

// Easy access variable changes
bot.command(`variables`, ctx => {
  ctx.reply(`subscribe_status: ${subscribeStatus}`);
  ctx.reply(`waiting_list: ${waitingList}`);
  ctx.reply(`next_request_timer: ${nextRequestTimer}`);
  ctx.reply(`pending_request: ${pendingRequest}`);
  ctx.reply(`pending_session: ${pendingSession}`);
});

// Redirect to start of recommendationProcess
bot.action(`create-reply`, ctx => {
  create(ctx);
});

// No running processes in the bot
bot.on(`message`, ctx => {
  if (pendingSession !== ctx.scene.session.current) {
    pendingSession = undefined;
    return ctx.reply(msg.basic.timeout);
  } else {
    return ctx.reply(msg.basic.default);
  }
});

// Bot activated
bot.startPolling();
