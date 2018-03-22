const Telegraf = require(`telegraf`);
const express = require("express");
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

var queryNumber = undefined;
var queryContext = undefined;
var songName = undefined;
var songArtist = undefined;
var songExplain = undefined;
var songDedicate = undefined;
var songSubmit = {};

var pendingSession = undefined;
var subscribeStatus = true;
var waitingList = false;

// Request ping to user
function request(ctx) {
  return ctx
    .reply(
      `Hey ${ctx.message.chat.first_name} there's an incoming song request!`
    )
    .then(() => {
      return ctx.replyWithHTML(
        `Story of question.\n\n<b>Would you like to recommend a song?</b>`,
        Markup.inlineKeyboard([
          Markup.callbackButton(msg.recommend.intent, `create-reply`)
        ]).extra()
      );
    });
}

// User indicates to start recommendProcess
function create(ctx) {
  queryNumber = ctx.callbackQuery.message.message_id;
  queryContext = ctx.callbackQuery.message.text;
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

// recommendProcess completed, recommendation delivered
function deliver(ctx) {
  let responseTime = 1000 * 60 * 7; // User receives validation response after 7 mins
  let newRequest = 1000 * 60 * 60 * 1; // User receives new request after 1 hour
  pendingSession = undefined;
  songDedicate = ctx.message.text;
  songSubmit = {
    "request-number": queryNumber,
    "request-context": queryContext,
    "song-name": songName,
    "song-artist": songArtist,
    "song-reason": songExplain,
    "song-message": songDedicate
  };
  return (
    console.log(songSubmit),
    ctx.reply(msg.recommend.deliver),
    setTimeout(() => {
      return ctx.reply(`Anne really loved your recommendation!`);
    }, responseTime),
    setTimeout(() => {
      request(ctx);
    }, newRequest),
    ctx.scene.leave()
  );
}

// User subs to request pings; sub on by default
function subscribe(ctx) {
  if (subscribeStatus) {
    return ctx.reply(msg.recommend.subExist);
  } else {
    subscribeStatus = true;
    return ctx.reply(msg.recommend.sub);
  }
}

// WIP
// User unsubs to request pings
function unsubscribe(ctx) {
  if (subscribeStatus) {
    subscribeStatus = false;
    return ctx.reply(msg.recommend.unsub);
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
    deliver(ctx); // Step 4: Deliver Recommendation
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

const askProcess = new Scene(`ask-process`);

// User prompted to join waiting list to ask for music
askProcess.enter(ctx => ctx.reply(msg.ask.intent));

// User indicates to join the waiting list
askProcess.command(`join`, ctx => {
  if (waitingList) {
    return ctx.reply(msg.ask.joinExist), ctx.scene.leave();
  } else {
    waitingList = true;
    return ctx.reply(msg.ask.join), ctx.scene.leave();
  }
});

// User declines to join the waiting list
askProcess.command(`no`, ctx => {
  waitingList = false;
  return ctx.reply(msg.ask.decline), ctx.scene.leave();
});

// Only accepts two commands inside the process
askProcess.on(`message`, ctx => {
  return ctx.reply(msg.ask.default);
});

let sessionMax = 60 * 5; // recommendProcess lasts for 5 minutes max.
const stage = new Stage([recommendProcess, askProcess], { ttl: sessionMax });
const server = express();
const bot = new Telegraf(process.env.TELEGRAM_API); // replace during pdt process.env.TELEGRAM_API
var queryNumber = 0;

server.use(bot.webhookCallback('/'+process.env.TELEGRAM_WEBHOOK_PATH))
bot.telegram.setWebhook(process.env.TELEGRAM_WEBHOOK_URL+process.env.TELEGRAM_WEBHOOK_PATH)

server.get('/', (req, res) => {
  res.send('Hello World!')
})

server.listen(8080, () => {
  console.log('Example app listening on port 8080!')
})

bot.use(session());
bot.use(stage.middleware());

// Upon bot start
bot.start(ctx => {
  request(ctx);
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
  if (pendingSession !== ctx.scene.session.current) {
    pendingSession = undefined;
    return ctx.reply(msg.basic.timeout);
  } else {
    return ctx.reply(msg.basic.default);
  }
});

bot.startPolling();
