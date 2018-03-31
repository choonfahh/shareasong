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

// Temporal storage of JSON variables - strictly synchronous
var queryContext = undefined;
var songName = undefined;
var songArtist = undefined;
var songExplain = undefined;
var songDedicate = undefined;

// User properties
this.pendingSession = undefined;
this.subscribeStatus = true;
this.waitingList = false;

// JSON API request options
const requestOptions = {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  }
};

// Send API request to get last request received
function checkLastRequest(ctx) {
  let body = {
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
  };

  requestOptions.body = JSON.stringify(body);
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let lastRequest = result[0].last_request_received;
      getRequest(ctx, lastRequest);
    })
    .catch(error => {
      console.log(`checkLastRequest Failed: ${error}`);
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let requestContent = result[0].content;
      request(ctx, requestContent, lastRequest);
    })
    .catch(error => {
      console.log(`getRequest Failed: ${error}`);
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      console.log(`deliveredRequest Failed: ${error}`);
    });
}

// Request ping to user
function request(ctx, requestContent, lastRequest) {
  return ctx
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
    .then(deliveredRequest(ctx, lastRequest));
}

// User indicates to start recommendProcess
function create(ctx) {
  queryContext = ctx.callbackQuery.message.text.split("\n\n")[0];
  this.subscribeStatus = true;
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
  this.pendingSession = ctx.scene.session.current;
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      let requestId = result[0][0].id;
      let recipient = result[0][0].user.first_name;
      let userId = result[1][0].id;
      deliverTwo(ctx, requestId, recipient, userId);
    })
    .catch(error => {
      console.log(`deliverOne Failed: ${error}`);
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      deliverThree(ctx, recipient);
    })
    .catch(error => {
      console.log(`deliverTwo Failed: ${error}`);
    });
}

// send delivered message, validation, next request
function deliverThree(ctx, recipient) {
  let responseTime = 1000 * 60 * 7; // User receives validation response after 7 mins
  let newRequest = 1000 * 60 * 60 * 1; // User receives new request after 1 hour
  this.pendingSession = undefined;
  return (
    ctx.reply(msg.recommend.deliver),
    setTimeout(() => {
      return ctx.reply(`${recipient} really loved your recommendation!`);
    }, responseTime),
    setTimeout(() => {
      if (this.subscribeStatus) {
        checkLastRequest(ctx);
      } else {
        return;
      }
    }, newRequest),
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      checkLastRequest(ctx);
    })
    .catch(error => {
      console.log(`createUser Failed: ${error}`);
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      if (result[0] == undefined) {
        createUser(ctx);
      } else {
        return ctx.reply(msg.basic.start);
      }
    })
    .catch(error => {
      console.log(`checkUser Failed: ${error}`);
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
        subscribe_status: this.subscribeStatus
      },
      $default: ["last_active"]
    }
  };
  requestOptions.body = JSON.stringify(body);
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      console.log(`subscribeUpdate Failed: ${error}`);
    });
}

// User subs to request pings; sub on by default
function subscribe(ctx) {
  if (this.subscribeStatus) {
    return ctx.reply(msg.recommend.subExist);
  } else {
    this.subscribeStatus = true;
    return subscribeUpdate(ctx), ctx.reply(msg.recommend.sub);
  }
}

// User unsubs to request pings
function unsubscribe(ctx) {
  if (this.subscribeStatus) {
    this.subscribeStatus = false;
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
  this.pendingSession = undefined;
  cancel(ctx);
});

// User unsubs during recommendProcess
recommendProcess.command(`unsub`, ctx => {
  this.pendingSession = undefined;
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
function waitingUpdate(ctx, waitingList) {
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
  fetch("https://data.avocado32.hasura-app.io/v1/query", requestOptions)
    .then(response => {
      return response.json();
    })
    .then(result => {
      return;
    })
    .catch(error => {
      console.log(`waitingUpdate Failed: ${error}`);
    });
}

// User indicates to join the waiting list
askProcess.command(`join`, ctx => {
  if (this.waitingList) {
    return ctx.reply(msg.ask.joinExist), ctx.scene.leave();
  } else {
    this.waitingList = true;
    let waitingList = this.waitingList;
    return (
      waitingUpdate(ctx, waitingList),
      ctx.reply(msg.ask.join),
      ctx.scene.leave()
    );
  }
});

// User declines to join the waiting list
askProcess.command(`no`, ctx => {
  if (!this.waitingList) {
    return ctx.reply(msg.ask.decline), ctx.scene.leave();
  } else {
    this.waitingList = false;
    let waitingList = this.waitingList;
    return (
      waitingUpdate(ctx, waitingList),
      ctx.reply(msg.ask.decline),
      ctx.scene.leave()
    );
  }
});

// Only accepts two commands inside the process
askProcess.on(`message`, ctx => {
  return ctx.reply(msg.ask.default);
});

// Bot, server, stage initialized
let sessionMax = 60 * 5; // recommendProcess lasts for 5 minutes max.
const server = express();
const stage = new Stage([recommendProcess, askProcess], { ttl: sessionMax });
const bot = new Telegraf(process.env.TELEGRAM_API); // for dev, use dev.Api
var queryNumber = 0;

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

// Redirect to start of recommendationProcess
bot.action(`create-reply`, ctx => {
  create(ctx);
});

// No running processes in the bot
bot.on(`message`, ctx => {
  if (this.pendingSession !== ctx.scene.session.current) {
    this.pendingSession = undefined;
    return ctx.reply(msg.basic.timeout);
  } else {
    return ctx.reply(msg.basic.default);
  }
});

// Bot activated
bot.startPolling();
