const express = require('express')
const app = express()
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

app.get('/', (req, res) => res.send('Share A Song Telegram Bot'))

app.listen(8080, () => console.log('App listening on port 8080!'))
