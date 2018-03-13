
const Telegraf = require(`telegraf`)
const Telegram = require('telegraf/telegram')
const Markup = require(`telegraf/markup`)
const Extra = require(`telegraf/extra`)

const config = require(`./config.json`)
const bot = new Telegraf(config.token)

bot.use(Telegraf.log())

bot.startPolling()
