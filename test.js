
const Telegraf = require(`telegraf`)
const Telegram = require('telegraf/telegram')
const Markup = require(`telegraf/markup`)
const Extra = require(`telegraf/extra`)

const config = require(`./config.json`)
const bot = new Telegraf(config.token)

//bot.use(Telegraf.log())

bot.on('message', (ctx) => {
  return ctx.reply(`Would you like to recommend \n\n a song?`,
             Markup.inlineKeyboard([
             Markup.callbackButton(`Yes, I have a song in mind!`, `create-reply`)
           ])
           .extra()
         )
})

bot.on('callback_query', (ctx) => {
  // Explicit usage
  ctx.answerCbQuery('hello')
  let x = ctx.callbackQuery.message.message_id
  console.log(x)
  ctx.reply('Hello', Extra.inReplyTo(x))
})

bot.startPolling()

//let storyQuestion = ctx.reply('Hello', Extra.inReplyTo(ctx.message.message_id))
//await next(return storyQuestion)
//console.log()

bot.action(`create-reply`, (ctx) => {
  if (ctx.scene.session.current === undefined) {
    create(ctx)
  } else {
    console.log('nope')
  }
})
