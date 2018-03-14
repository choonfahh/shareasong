require('dotenv').config()

const Telegraf = require(`telegraf`);
const Markup = require(`telegraf/markup`);
const Extra = require(`telegraf/extra`);
const Composer = require(`telegraf/composer`);
const session = require(`telegraf/session`);
const Stage = require(`telegraf/stage`);
const WizardScene = require(`telegraf/scenes/wizard`);
const Scene = require("telegraf/scenes/base");
const { mount } = require("telegraf");
const { enter, leave } = Stage;

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
          Markup.callbackButton(`Yes, I have a song in mind!`, `create-reply`)
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
    console.log(subscribeStatus),
    ctx.answerCbQuery(
      `Great, let's answer the following questions to submit it!`
    ),
    ctx.scene.enter(`recommend-process`)
  );
}

// User cancels recommendProcess
function cancel(ctx) {
  return (
    ctx.scene.leave(),
    console.log(`Recommendation cancelled.`),
    ctx.reply(`Your recommendation has been cancelled.`)
  );
}

// User redo recommendProcess
function redo(ctx) {
  return (
    ctx.wizard.selectStep(1),
    console.log(`User selecting song`),
    ctx.reply(
      `What song would you like to recommend?`,
      Extra.inReplyTo(queryNumber)
    )
  );
}

// User select song for recommendProcess
function select(ctx) {
  pendingSession = ctx.scene.session.current;
  return (
    console.log(`User selecting song`),
    console.log(pendingSession),
    ctx.reply(
      `What song would you like to recommend?`,
      Extra.inReplyTo(queryNumber)
    ),
    ctx.wizard.next()
  );
}

// User explain song for recommendProcess
function explain(ctx) {
  songName = ctx.message.text;
  return (
    console.log(`User explaining why`),
    ctx.reply(`Why do you recommend this song?`),
    ctx.wizard.next()
  );
}

// User dedicates song for recommendProcess
function dedicate(ctx) {
  songExplain = ctx.message.text;
  return (
    console.log(`User dedicating song`),
    ctx.reply(`Any message for the user? If you don't have any, type 'no'.`),
    ctx.wizard.next()
  );
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
    console.log(`Delivered`),
    ctx.reply(`Thanks! Your recommendation has just been delivered.`),
    setTimeout(() => {
      return ctx
        .reply(`Anne really loved your recommendation!`) // Need to calibrate response
        .then(() => {
          return console.log(`Received reply from recipient`);
        });
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
    console.log(`User is already subscribed.`);
    return ctx.reply(`You're already subscribed.`);
  } else {
    console.log(`Subscribing now.`);
    subscribeStatus = true;
    console.log(subscribeStatus);
    return ctx.reply(`Subscribed!`);
  }
}

// WIP
// User unsubs to request pings
function unsubscribe(ctx) {
  if (subscribeStatus) {
    console.log(`Unsubscribing now.`);
    subscribeStatus = false;
    console.log(subscribeStatus);
    return ctx.reply(`Unsubscribed`);
  } else {
    console.log(`User is already unsubscribed.`);
    return ctx.reply(`You're already unsubscribed.`);
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
askProcess.enter(ctx =>
  ctx.reply(
    `Currently still in testing. Do you want to join waiting list? If yes, /join. No, /no`
  )
);

// User leaves the asking process
askProcess.leave(() => {
  if (waitingList) {
    console.log(`User is on the waiting list.`);
  } else {
    console.log(`User is not on the waiting list.`);
  }
});

// User indicates to join the waiting list
askProcess.command(`join`, ctx => {
  if (waitingList) {
    return ctx.reply(`You've alr indicated your interest!`), ctx.scene.leave();
  } else {
    waitingList = true;
    return (
      ctx.reply(`You've indicated your interest! We'll notify you`),
      ctx.scene.leave()
    );
  }
});

// User declines to join the waiting list
askProcess.command(`no`, ctx => {
  waitingList = false;
  return ctx.reply(`Ok`), ctx.scene.leave();
});

// Only accepts two commands inside the process
askProcess.on(`message`, ctx => {
  return ctx.reply(`Please reply /join or /no`);
});

let sessionMax = 60 * 5; // recommendProcess lasts for 5 minutes max.
const stage = new Stage([recommendProcess, askProcess], { ttl: sessionMax });
const bot = new Telegraf(process.env.BOT_TOKEN);
var queryNumber = 0;

// bot.use(Telegraf.log())

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
    return ctx.reply(
      `Session Timeout. Click on one of the stories to start recommending!`
    );
  } else {
    return ctx.reply(`User has not entered recommendationProcess`);
  }
});

bot.startPolling();
