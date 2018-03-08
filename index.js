const Telegraf = require(`telegraf`)
const Markup = require(`telegraf/markup`)
const Composer = require(`telegraf/composer`)
const session = require(`telegraf/session`)
const Stage = require(`telegraf/stage`)
const WizardScene = require(`telegraf/scenes/wizard`)
const { enter, leave } = Stage

function request(ctx) {
  return ctx.reply(`Hey ${ctx.message.chat.first_name} here's an incoming song request!`)
  .then(() => {
    return ctx.reply(`Story of question.`)
    .then(() => {
      return ctx.reply(`Would you like to recommend a song?`,
                 Markup.inlineKeyboard([
                 Markup.callbackButton(`Yes, I have a song in mind!`, `create-reply`)
               ])
               .extra()
             )
           })
         })
       }

function create(ctx) {
  return ctx.answerCbQuery(`Great, let's answer the following questions to submit it!`),
         ctx.scene.enter(`recommend-process`)
}

function select(ctx) {
  return console.log(`User selecting song`),
         ctx.reply(`What song would you like to recommend?`),
         ctx.wizard.next()
}

function explain(ctx) {
  return console.log(`User explaining why`),
         ctx.reply(`Why do you recommend this song?`),
         ctx.wizard.next()
}

function dedicate(ctx) {
  return console.log(`User dedicating song`),
         ctx.reply(`Any message for the user? If you don't have any, type 'no'.`),
         ctx.wizard.next()
}

function deliver(ctx) {
  return console.log(`Ready for delivery`),
         ctx.reply(`Thanks! Your recommendation has just been delivered.`),
         ctx.scene.leave()
}

const recommendProcess = new WizardScene(`recommend-process`,
  (ctx) => {
    select(ctx)       // Step 1: Select Song
  },
  (ctx) => {
    explain(ctx)      // Step 2: Explain Why
  },
  (ctx) => {
    dedicate(ctx)     // Step 3: Dedicate Message
  },
  (ctx) => {
    deliver(ctx)      // Step 4: Deliver Recommendation
  }
)

let sessionMax = 60*5 // recommendProcess lasts for 5 minutes max.
const stage = new Stage([recommendProcess], { ttl: sessionMax })
const config = require(`./config.json`)
const bot = new Telegraf(config.token)

bot.use(session())
bot.use(stage.middleware())

bot.start((ctx) => {
  request(ctx)
})

bot.on(`message`, (ctx) =>
  ctx.reply(`User has not entered recommendProcess`)
)

// Redirect to start of recommendationProcess
bot.action(`create-reply`, (ctx) => {
  create(ctx)
})

bot.startPolling()
