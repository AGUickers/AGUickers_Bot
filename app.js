//AGUickers Bot
//by alexavil, 2022
//Licensed by MIT License
//The lead developer keeps the right to modify or disable the service at any given time.

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");
const sql = require("better-sqlite3");
var git = require('git-last-commit');
const child = require("child_process");
const pm2 = require("pm2");

const token = process.env.TOKEN || process.argv[2];
var adminid = "";
const bot = new TelegramBot(token, {
  polling: true,
  onlyFirstMatch: true,
});

var defaultlang = "";
var locales = ["en", "ru"];
let settings = new sql("./config/settings.db");

if (fs.existsSync("./firstrun") || fs.existsSync("./update")) {
  settings
    .prepare(
      "create table if not exists settings (option text UNIQUE, value text)"
    )
    .run();
  settings
    .prepare(
      "create table if not exists users (id INTEGER UNIQUE, is_subscribed text, is_contactbanned text, is_banned text, status text, language text)"
    )
    .run();
  settings
    .prepare(
      "create table if not exists tickets (id INTEGER PRIMARY KEY, userid INTEGER UNIQUE)"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('contact_channel', '')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('sub_channel', '')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('calculator', 'true')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('subscribe', 'true')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('contact', 'true')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('quiz', 'true')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('suggest', 'true')"
    )
    .run();
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('current_version', '')"
    )
    .run();
    git.getLastCommit(function(err, commit) {
      if (err) {
        console.log(err);
      } else {
        settings
          .prepare(
            "update settings set value = ? where option = 'current_version'"
          )
          .run(commit.shortHash.toString());
      }
    });

  locales.forEach((locale) => {
    var messages = JSON.parse(
      fs.readFileSync("./messages_" + locale + ".json")
    );
    settings
      .prepare(
        `create table if not exists quizzes_${locale} (id INTEGER PRIMARY KEY, provider text, link text, name text UNIQUE)`
      )
      .run();
    settings
      .prepare(
        `create table if not exists quizzes_interactive_${locale} (id INTEGER PRIMARY KEY, name text UNIQUE, question text, answers text)`
      )
      .run();
    settings
      .prepare(
        `create table if not exists courses_${locale} (id INTEGER UNIQUE, name text UNIQUE, subject_1 text, subject_2 text, subject_3 text, extra text, min_score INTEGER, budget text)`
      )
      .run();
    settings
      .prepare(
        `create table if not exists subjects_${locale} (id INTEGER PRIMARY KEY, name text UNIQUE)`
      )
      .run();
    settings
      .prepare(
        `create table if not exists custom_commands_${locale} (id INTEGER PRIMARY KEY, type text, string text UNIQUE, response text, link text)`
      )
      .run();
    settings
      .prepare(
        `insert or ignore into settings (option, value) values ('welcome_text_${locale}', ?)`
      )
      .run(messages.messages.greeting_default);
    settings
      .prepare(
        `insert or ignore into settings (option, value) values ('faq_text_${locale}', ?)`
      )
      .run(messages.messages.faq_default);
    settings
      .prepare(
        `insert or ignore into settings (option, value) values ('webbutton_text_${locale}', ?)`
      )
      .run(messages.messages.webopen_default);
    settings
      .prepare(
        `insert or ignore into settings (option, value) values ('website_link_${locale}', 'https://aguickers.github.io/AGUickers_WebStock/${locale}/')`
      )
      .run();
  });
  adminid = process.env.ADMINID || process.argv[3];
  defaultlang = process.env.DEF_LANG || process.argv[4];
  if (adminid == "" || defaultlang == "") {
    console.log("Please, fill the arguments.");
    process.exit();
  }
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('default_lang', ?)"
    )
    .run(defaultlang);
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('contact_channel_lang', ?)"
    )
    .run(defaultlang);
  settings
    .prepare(
      "insert or ignore into settings (option, value) values ('owner_id', ?)"
    )
    .run(adminid);
  settings
    .prepare("insert or ignore into users values (?, ?, ?, ?, ?, ?)")
    .run(adminid, "false", "false", "false", "superadmin", defaultlang);
  if (fs.existsSync("./firstrun")) {
    fs.unlinkSync("./firstrun");
  }
  if (fs.existsSync("./update")) {
    fs.unlinkSync("./update");
  }
} else {
  adminid = settings
    .prepare("select value from settings where option = 'owner_id'")
    .get().value;
  defaultlang = settings
    .prepare("select value from settings where option = 'default_lang'")
    .get().value;
}

function getLocale(id, defaultlang) {
  defaultlang = settings
    .prepare("select value from settings where option = 'default_lang'")
    .get().value;
  var contactchannelid = settings
    .prepare("select value from settings where option = 'contact_channel'")
    .get().value;
  if (id == contactchannelid) {
    var language = settings
      .prepare(
        "select value from settings where option = 'contact_channel_lang'"
      )
      .get().value;
    if (language == "") {
      return defaultlang;
    }
    return language;
  }
  var user = settings
    .prepare("SELECT language FROM users WHERE id = ?")
    .get(id);
  if (user) {
    return user.language;
  } else {
    return defaultlang;
  }
}

function userCheck(id) {
  console.log(defaultlang);
  var user = settings.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (user) {
    if (user.is_banned == "true") {
      return "banned";
    }
    return true;
  } else {
    //Add a new user to the users table of the database if the entry doesn't exist
    settings
      .prepare("INSERT OR IGNORE INTO users VALUES(?,?,?,?,?,?)")
      .run(id, "false", "false", "false", "user", defaultlang);
    return false;
  }
}

function adminCheck(id) {
  //Get user status from the database
  var user = settings.prepare("SELECT status FROM users WHERE id = ?").get(id);
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
  var user = settings.prepare("SELECT status FROM users WHERE id = ?").get(id);
  if (user) {
    if (user.status == "superadmin") {
      return true;
    } else {
      return false;
    }
  }
}

function subscriptionCheck(id) {
  //Get user status from the database
  var user = settings
    .prepare("SELECT is_subscribed FROM users WHERE id = ?")
    .get(id);
  if (user) {
    if (user.is_subscribed == "true") {
      return true;
    } else {
      return false;
    }
  }
}

function subscribe(id) {
  var user = settings
    .prepare("SELECT is_subscribed FROM users WHERE id = ?")
    .get(id);
  if (user) {
    var messages = JSON.parse(
      fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
    );
    settings
      .prepare("UPDATE users SET is_subscribed = 'true' WHERE id = ?")
      .run(id);
    return bot.sendMessage(id, messages.messages.subscribe_success);
  } else {
    return false;
  }
}

function unsubscribe(id) {
  var user = settings
    .prepare("SELECT is_subscribed FROM users WHERE id = ?")
    .get(id);
  if (user) {
    var messages = JSON.parse(
      fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
    );
    settings
      .prepare("UPDATE users SET is_subscribed = 'false' WHERE id = ?")
      .run(id);
    return bot.sendMessage(id, messages.messages.unsubscribe_success);
  } else {
    return false;
  }
}

function addquiz(id, locale) {
  var provider = "";
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  bot.sendMessage(id, messages.messages.quiz_provider_prompt, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: messages.messages.quiz_provider_tg,
            callback_data: "telegram",
          },
        ],
        [
          {
            text: messages.messages.quiz_provider_custom,
            callback_data: "external",
          },
        ],
        [
          {
            text: messages.messages.cancel,
            callback_data: "cancel",
          },
        ],
      ],
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(id, messages.messages.cancelled);
      case "telegram":
      case "external":
        provider = callback.data;
        switch (provider) {
          case "telegram":
            var name = "";
            var question = "";
            var answers = "";
            var answers_array = [];
            //Prompt user for quiz name
            bot.sendMessage(id, messages.messages.quiz_name_prompt);
            bot.once("message", (msg) => {
              if (msg.text == "/cancel")
                return bot.sendMessage(id, messages.messages.cancelled);
              name = msg.text;
              //If a quiz already exists with the same name, return an error
              if (
                settings
                  .prepare(`SELECT * FROM quizzes_${locale} WHERE name = ?`)
                  .get(name)
              ) {
                return bot.sendMessage(id, messages.messages.quiz_exists);
              }
              //Prompt for the question
              bot.sendMessage(id, messages.messages.quiz_question_prompt);
              bot.once("message", (msg) => {
                if (msg.text == "/cancel")
                  return bot.sendMessage(id, messages.messages.cancelled);
                question = msg.text;
                //Prompt for the answers
                bot.sendMessage(id, messages.messages.quiz_answers_prompt);
                bot.once("message", (msg) => {
                  if (msg.text == "/cancel")
                    return bot.sendMessage(id, messages.messages.cancelled);
                  answers_array = msg.text.split(", ");
                  if (answers_array.length > 10) {
                    answers = answers_array.slice(0, 10).join(", ");
                  } else {
                    answers = answers_array.join(", ");
                  }
                  //Insert quiz into the database
                  settings
                    .prepare(
                      `INSERT INTO quizzes_${locale} (provider, link, name) VALUES (?, ?, ?)`
                    )
                    .run(provider, "N/A", name);
                  settings
                    .prepare(
                      `INSERT INTO quizzes_interactive_${locale} (name, question, answers) VALUES (?, ?, ?)`
                    )
                    .run(name, question, answers);
                  //Send message to the user
                  bot.sendMessage(id, messages.messages.quiz_created);
                  //Set a small timeout to prevent the bot from sending multiple messages at once
                  setTimeout(() => {
                  bot.sendMessage(id, messages.messages.addquiz_again, {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: messages.messages.yes,
                            callback_data: "yes",
                          },
                          {
                            text: messages.messages.no,
                            callback_data: "no",
                          },
                        ],
                      ],
                    },
                  });
                  }, 500);
                  bot.once("callback_query", (callbackQuery) => {
                    if (callbackQuery.data == "yes") {
                      addquiz(id, locale);
                    } else {
                      return bot.sendMessage(id, messages.messages.cancelled);
                    }
                  });
                });
              });
            });
            break;
          case "external":
            var name = "";
            var link = "";
            //Prompt user for quiz name
            bot.sendMessage(id, messages.messages.quiz_name_prompt);
            bot.once("message", (msg) => {
              if (msg.text == "/cancel")
                return bot.sendMessage(id, messages.messages.cancelled);
              name = msg.text;
              if (
                settings
                  .prepare(`SELECT * FROM quizzes_${locale} WHERE name = ?`)
                  .get(name)
              ) {
                return bot.sendMessage(id, messages.messages.quiz_exists);
              }
              //Prompt for the question
              bot.sendMessage(id, messages.messages.quiz_link_prompt);
              bot.once("message", (msg) => {
                if (msg.text == "/cancel")
                  return bot.sendMessage(id, messages.messages.cancelled);
                if (!msg.text.startsWith("https://"))
                  return bot.sendMessage(id, messages.messages.website_invalid);
                link = msg.text;
                settings
                  .prepare(
                    `INSERT INTO quizzes_${locale} (provider, link, name) VALUES (?, ?, ?)`
                  )
                  .run(provider, link, name);
                //Send message to the user
                bot.sendMessage(id, messages.messages.quiz_created);
                                  //Set a small timeout to prevent the bot from sending multiple messages at once
                setTimeout(() => {
                bot.sendMessage(id, messages.messages.addquiz_again, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.yes,
                          callback_data: "yes",
                        },
                        {
                          text: messages.messages.no,
                          callback_data: "no",
                        },
                      ],
                    ],
                  },
                });
                }, 500);
                bot.once("callback_query", (callbackQuery) => {
                  if (callbackQuery.data == "yes") {
                    addquiz(id, locale);
                  } else {
                    return bot.sendMessage(id, messages.messages.cancelled);
                  }
                });
              });
            });
            break;
        }
        break;
      default:
        break;
    }
  });
}

function getquiz(id, name, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var quiz = settings
    .prepare(`SELECT * FROM quizzes_${locale} WHERE id = ?`)
    .get(name);
  if (quiz) {
    switch (quiz.provider) {
      case "telegram":
        var pollmsgid = undefined;
        var ispoll = true;
        var question = settings
          .prepare(`SELECT * FROM quizzes_interactive_${locale} WHERE name = ?`)
          .get(quiz.name);
        console.log(question);
        bot
          .sendPoll(id, question.question, question.answers.split(", "), {
            allows_multiple_answers: false,
            is_anonymous: false,
          })
          .then((msg) => {
            pollmsgid = msg.message_id;
          });
                            //Set a small timeout to prevent the bot from sending multiple messages at once
        setTimeout(() => {
        bot.sendMessage(id, messages.messages.cancel_prompt);
        }, 500);
        bot.once("message", (msg) => {
          if (msg.text == "/cancel") {
            bot.deleteMessage(id, pollmsgid);
            ispoll = false;
            return bot.sendMessage(id, messages.messages.cancelled);
          }
        });
        bot.once("poll_answer", (ans) => {
          ispoll = false;
          bot.sendMessage(id, messages.messages.quiz_thanks);
          var answers = question.answers.split(", ");
          var answer = answers[ans.option_ids];
          var contactchannelid = settings
            .prepare(
              "SELECT value FROM settings WHERE option = 'contact_channel'"
            )
            .get().value;
          if (contactchannelid != "") {
            var ccmessages = JSON.parse(
              fs.readFileSync(
                "./messages_" +
                  getLocale(contactchannelid, defaultlang) +
                  ".json"
              )
            );
            bot.sendMessage(
              contactchannelid,
              ccmessages.messages.newanswer
                .replace("{question}", question.question)
                .replace("{answer}", answer)
            );
          }
        });
        break;
      case "external":
        bot.sendMessage(id, messages.messages.quiz_external_intro, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.webopen_default,
                  web_app: {
                    url: quiz.link,
                  },
                },
              ],
            ],
          },
        });
                          //Set a small timeout to prevent the bot from sending multiple messages at once
        setTimeout(() => {
        bot.sendMessage(id, messages.messages.webapp_alert);
        }, 500);
        break;
    }
  } else {
    return false;
  }
}

function delquiz(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var quizzes = settings.prepare(`SELECT * FROM quizzes_${locale}`).all();
  console.log(quizzes);
  if (quizzes.length == 0)
    return bot.sendMessage(id, messages.messages.no_quizzes);
  var keyboard = [];
  quizzes.forEach((quiz) => {
    console.log(quiz.name);
    keyboard.push([
      {
        text: quiz.name,
        callback_data: quiz.id,
      },
    ]);
  });
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(id, messages.messages.quiz_list, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(id, messages.messages.cancelled);
      default:
        //Check if the quiz exists
        var quiz = settings
          .prepare(`SELECT * FROM quizzes_${locale} WHERE id = ?`)
          .get(callback.data);
        if (quiz == undefined) return;
        //Get the quiz provider
        if (quiz.provider == "telegram") {
          //Delete the quiz from the database
          settings
            .prepare(`DELETE FROM quizzes_interactive_${locale} WHERE name = ?`)
            .run(quiz.name);
        }
        settings
          .prepare(`DELETE FROM quizzes_${locale} WHERE id = ?`)
          .run(callback.data);
        bot.sendMessage(id, messages.messages.quiz_deleted);
        quizzes = settings.prepare(`SELECT * FROM quizzes_${locale}`).all();
        if (quizzes.length > 0) {
                            //Set a small timeout to prevent the bot from sending multiple messages at once
          setTimeout(() => {
          bot.sendMessage(id, messages.messages.delquiz_again, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: messages.messages.yes,
                    callback_data: "yes",
                  },
                  {
                    text: messages.messages.no,
                    callback_data: "no",
                  },
                ],
              ],
            },
          });
          }, 500);
          bot.once("callback_query", (callbackQuery) => {
            if (callbackQuery.data == "yes") {
              delquiz(id, locale);
            } else {
              bot.sendMessage(id, messages.messages.cancelled);
            }
          });
        }
    }
  });
}

function addsubject(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  //Prompt for the subject name
  bot.sendMessage(id, messages.messages.addsubject_prompt);
  bot.once("message", (msg) => {
    if (msg.text == "/cancel") {
      return bot.sendMessage(id, messages.messages.cancelled);
    }
    //If such a subject already exists, prompt again
    if (settings
      .prepare(`SELECT * FROM subjects_${locale} WHERE name = ?`)
      .get(msg.text) != undefined) {
      bot.sendMessage(id, messages.messages.subject_exists);
      return addsubject(id, locale);
    }
    bot.sendMessage(id, messages.messages.subject_added);
    //Ask if the user wants to add another subject
                      //Set a small timeout to prevent the bot from sending multiple messages at once
    setTimeout(() => {
    bot.sendMessage(id, messages.messages.addsubject_again, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: messages.messages.yes,
              callback_data: "yes",
            },
            {
              text: messages.messages.no,
              callback_data: "no",
            },
          ],
        ],
      },
    });
    }, 500);
    bot.once("callback_query", (callbackQuery) => {
      if (callbackQuery.data == "yes") {
        addsubject(id, locale);
      } else {
        return bot.sendMessage(id, messages.messages.cancelled);
      }
    });
  });
  
}

function deletesubject(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
  //If no subjects are found, return
  if (subjects.length == 0) {
    return bot.sendMessage(chatId, messages.messages.no_subjects);
  }
  //Create a keyboard with all subjects
  var keyboard = [];
  for (var i = 0; i < subjects.length; i++) {
    keyboard.push([
      {
        text: subjects[i].name,
        callback_data: subjects[i].id,
      },
    ]);
  }
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(id, messages.messages.delsubject_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (msg) => {
    switch (msg.data) {
      case "cancel":
        bot.sendMessage(id, messages.messages.cancelled);
        break;
      default:
        //check if the subject is valid
        var subject = settings
          .prepare(`SELECT * FROM subjects_${locale} WHERE id = ?`)
          .get(msg.data);
        if (subject == undefined) {
          return;
        }
        //Check if subject is part of any course
        var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
        var found = false;
        for (var i = 0; i < courses.length; i++) {
          var subject_1 = courses[i].subject_1.split(",");
          var subject_2 = courses[i].subject_2.split(",");
          var subject_3 = courses[i].subject_3.split(",");
          if (
            subject_1.includes(subject.id.toString()) ||
            subject_2.includes(subject.id.toString()) ||
            subject_3.includes(subject.id.toString())
          ) {
            found = true;
            break;
          }
        }
        if (found) {
          return bot.sendMessage(id, messages.messages.subject_in_course);
        } else {
          //Delete the subject
          settings
            .prepare(`DELETE FROM subjects_${locale} WHERE id = ?`)
            .run(msg.data);
          bot.sendMessage(id, messages.messages.subject_deleted);
          subjects = settings.prepare(`SELECT * FROM subjects_${locale}`).all();
          if (subjects.length > 0) {
                                //Set a small timeout to prevent the bot from sending multiple messages at once
            setTimeout(() => {
            bot.sendMessage(id, messages.messages.delsubject_again, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: messages.messages.yes,
                      callback_data: "yes",
                    },
                    {
                      text: messages.messages.no,
                      callback_data: "no",
                    },
                  ],
                ],
              },
            });
            }, 500);
            bot.once("callback_query", (callbackQuery) => {
              if (callbackQuery.data == "yes") {
                deletesubject(id, locale);
              } else {
                return bot.sendMessage(id, messages.messages.cancelled);
              }
            });
          }
        }
    }
  });
}

function addcourse(userid, locale) {
  var id = "";
  var name = "";
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(userid, defaultlang) + ".json")
  );
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
    //If such a course already exists, prompt again
    if (settings
      .prepare(`SELECT * FROM courses_${locale} WHERE name = ?`)
      .get(msg.text) != undefined) {
      bot.sendMessage(userid, messages.messages.course_exists);
      return addcourse(userid, locale);
    }
    id = msg.message_id;
    name = msg.text;
    //Insert into the database
    settings
      .prepare(
        `INSERT INTO courses_${locale} (id, name, subject_1, subject_2, subject_3, extra, min_score, budget) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, "N/A", "N/A", "N/A", "N/A", "N/A", "N/A");
    bot.sendMessage(userid, messages.messages.course_added, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: messages.messages.addcourse,
              callback_data: "new",
            },
          ],
          [
            {
              text: messages.messages.editcourse,
              callback_data: "edit",
            },
          ],
          [
            {
              text: messages.messages.cancel,
              callback_data: "cancel",
            },
          ],
        ],
      },
    });
    bot.once("callback_query", (callbackQuery) => {
      if (callbackQuery.data == "new") {
        addcourse(userid, locale);
      } else if (callbackQuery.data == "edit") {
        editcourse(userid, locale);
      } else if (callbackQuery.data == "cancel") {
        return bot.sendMessage(userid, messages.messages.cancelled);
      }
    });
  });
}

function delcourse(userid, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(userid, defaultlang) + ".json")
  );
  var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
  //If no courses are found, return
  if (courses.length == 0) {
    return bot.sendMessage(userid, messages.messages.no_courses);
  }
  //Create a keyboard with all courses
  var keyboard = [];
  for (var i = 0; i < courses.length; i++) {
    keyboard.push([
      {
        text: courses[i].name,
        callback_data: courses[i].id,
      },
    ]);
  }
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(userid, messages.messages.delcourse_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (msg) => {
    switch (msg.data) {
      case "cancel":
        bot.sendMessage(userid, messages.messages.cancelled);
        break;
      default:
        //Check if the course is valid
        var course = settings
          .prepare(`SELECT * FROM courses_${locale} WHERE id = ?`)
          .get(msg.data);
        if (course == undefined) {
          return;
        }
        //Delete the course from the database
        settings
          .prepare(`DELETE FROM courses_${locale} WHERE id = ?`)
          .run(msg.data);
        bot.sendMessage(userid, messages.messages.course_deleted);
        courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
        if (courses.length > 0) {
                                //Set a small timeout to prevent the bot from sending multiple messages at once
          setTimeout(() => {
          bot.sendMessage(userid, messages.messages.delcourse_again, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: messages.messages.yes,
                    callback_data: "yes",
                  },
                  {
                    text: messages.messages.no,
                    callback_data: "no",
                  },
                ],
              ],
            },
          });
          }, 500);
          bot.once("callback_query", (callbackQuery) => {
            if (callbackQuery.data == "yes") {
              delcourse(userid, locale);
            } else {
              return bot.sendMessage(id, messages.messages.cancelled);
            }
          });
        }
    }
  });
}

function editcourse(userid, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(userid, defaultlang) + ".json")
  );
  var id = "";
  var courses = settings.prepare(`SELECT * FROM courses_${locale}`).all();
  //If no courses are found, return
  if (courses.length == 0) {
    return bot.sendMessage(userid, messages.messages.no_courses);
  }
  //Create a keyboard with all courses
  var keyboard = [];
  for (var i = 0; i < courses.length; i++) {
    keyboard.push([
      {
        text: courses[i].name,
        callback_data: courses[i].id,
      },
    ]);
  }
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(userid, messages.messages.editcourse_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (msg) => {
    switch (msg.data) {
      case "cancel":
        bot.sendMessage(userid, messages.messages.cancelled);
        break;
      default:
        //Check if the course is valid
        var course = settings
          .prepare(`SELECT * FROM courses_${locale} WHERE id = ?`)
          .get(msg.data);
        if (course == undefined) {
          return;
        }
        id = msg.data;
        //Ask, which field to edit
        bot.sendMessage(userid, messages.messages.editcourse_field_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.field_name,
                  callback_data: "name",
                },
              ],
              [
                {
                  text: messages.messages.field_subjects,
                  callback_data: "subjects",
                },
              ],
              [
                {
                  text: messages.messages.field_score,
                  callback_data: "min_score",
                },
              ],
              [
                {
                  text: messages.messages.field_budget,
                  callback_data: "budget",
                },
              ],
              [
                {
                  text: messages.messages.field_extra,
                  callback_data: "extra",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (msg) => {
          switch (msg.data) {
            case "cancel":
              return bot.sendMessage(userid, messages.messages.cancelled);
            case "subjects":
              //Get all subjects from the database
              var subjects = settings
                .prepare(`SELECT * FROM subjects_${locale}`)
                .all();
              //Ask if the user wants to edit first, second or third subject
              bot.sendMessage(
                userid,
                messages.messages.editcourse_subject_prompt,
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.subject_1,
                          callback_data: "subject_1",
                        },
                      ],
                      [
                        {
                          text: messages.messages.subject_2,
                          callback_data: "subject_2",
                        },
                      ],
                      [
                        {
                          text: messages.messages.subject_3,
                          callback_data: "subject_3",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                }
              );
              bot.once("callback_query", (callback) => {
                switch (callback.data) {
                  case "cancel":
                    return bot.sendMessage(userid, messages.messages.cancelled);
                  case "subject_1":
                  case "subject_2":
                  case "subject_3":
                    if (subjects.length <= 10) {
                      var pollmsgid = undefined;
                      var ispoll = true;
                      bot
                        .sendPoll(
                          userid,
                          messages.messages.choose,
                          subjects.map((subject) => subject.name),
                          {
                            allows_multiple_answers: true,
                            is_anonymous: false,
                          }
                        )
                        .then((msg) => {
                          pollmsgid = msg.message_id;
                        });
                        //Add a small timeout to make sure the poll is sent
                        setTimeout(() => {
                          bot.sendMessage(userid, messages.messages.cancel_prompt);
                        }, 500);
                      bot.once("message", (msg) => {
                        if (msg.text == "/cancel") {
                          bot.deleteMessage(userid, pollmsgid);
                          ispoll = false;
                          return bot.sendMessage(
                            userid,
                            messages.messages.cancelled
                          );
                        }
                      });
                      bot.once("poll_answer", (msg) => {
                        if (ispoll == false) return;
                        settings
                          .prepare(
                            `UPDATE courses_${locale} SET ${callback.data} = ? WHERE id = ?`
                          )
                          .run(msg.option_ids.toString(), id);
                        bot.sendMessage(
                          userid,
                          messages.messages.course_edited, {
                            reply_markup: {
                              inline_keyboard: [
                                [
                                  {
                                    text: messages.messages.editcourse,
                                    callback_data: "edit",
                                  },
                                ],
                                [
                                  {
                                    text: messages.messages.cancel,
                                    callback_data: "cancel",
                                  },
                                ],
                              ],
                            },
                          }
                        );
                      });
                      bot.once("callback_query", (msg) => {
                        switch (msg.data) {
                          case "cancel":
                            return bot.sendMessage(userid, messages.messages.cancelled);
                          case "edit":
                            return editcourse(userid, locale);
                        }      
                      });
                    } else {
                      var message = "";
                      for (var i = 0; i < subjects.length; i++) {
                        message +=
                          subjects[i].id + " - " + subjects[i].name + "\n";
                      }
                      bot.sendMessage(userid, messages.messages.input_subjects);
                      bot.sendMessage(userid, message);
                      bot.once("message", (msg) => {
                        if (msg.text == "/cancel")
                          return bot.sendMessage(
                            userid,
                            messages.messages.cancelled
                          );
                        var value = [];
                        var ids = msg.text.split(", ");
                        ids.forEach((option) => {
                          option = parseInt(option) - 1;
                          value.push(option);
                        });
                        settings
                          .prepare(
                            `UPDATE courses_${locale} SET ${callback.data} = ? WHERE id = ?`
                          )
                          .run(value.toString(), id);
                        bot.sendMessage(
                          userid,
                          messages.messages.course_edited, {
                            reply_markup: {
                              inline_keyboard: [
                                [
                                  {
                                    text: messages.messages.editcourse,
                                    callback_data: "edit",
                                  },
                                ],
                                [
                                  {
                                    text: messages.messages.cancel,
                                    callback_data: "cancel",
                                  },
                                ],
                              ],
                            },
                          }
                        );
                      });
                      bot.once("callback_query", (msg) => {
                        switch (msg.data) {
                          case "cancel":
                            return bot.sendMessage(userid, messages.messages.cancelled);
                          case "edit":
                            return editcourse(userid, locale);
                        }      
                      });
                    }
                }
              });
              break;
            case "name":
            case "min_score":
            case "budget":
              case "extra":
              var query = `UPDATE courses_${locale} SET ${msg.data} = ? WHERE id = ?`;
              bot.sendMessage(
                userid,
                messages.messages.editcourse_value_prompt
              );
              bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                  return bot.sendMessage(userid, messages.messages.cancelled);
                }
                //If we're editing the name, we need to check if the name is already taken
                if (callback.data == "name") {
                  var name = msg.text;
                  var course = settings
                    .prepare(`SELECT * FROM courses_${locale} WHERE name = ?`)
                    .get(name);
                  if (course.length > 0) {
                    return bot.sendMessage(
                      userid,
                      messages.messages.course_exists);
                  }
                }
                //Edit the field
                settings.prepare(query).run(msg.text, id);
                bot.sendMessage(
                  userid,
                  messages.messages.course_edited,
                  {
                    reply_markup: {
                      inline_keyboard: [
                        [
                          {
                            text: messages.messages.editcourse,
                            callback_data: "edit",
                          },
                        ],
                        [
                          {
                            text: messages.messages.cancel,
                            callback_data: "cancel",
                          },
                        ],
                      ],
                    },
                  }
                );
                bot.once("callback_query", (msg) => {
                  switch (msg.data) {
                    case "cancel":
                      return bot.sendMessage(userid, messages.messages.cancelled);
                    case "edit":
                      return editcourse(userid, locale);
                  }      
                });
              });
              break;
            default:
              break;
          }
        });
        break;
    }
  });
}

function addcc(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var string = "";
  var response = "";
  var link = "";
  bot.sendMessage(id, messages.messages.cc_type_prompt, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: messages.messages.cc_type_text,
            callback_data: "text",
          },
        ],
        [
          {
            text: messages.messages.cc_type_link,
            callback_data: "link",
          },
        ],
        [
          {
            text: messages.messages.cancel,
            callback_data: "cancel",
          },
        ],
      ],
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(id, messages.messages.cancelled);
      case "text":
        //Ask for the name of the command
        bot.sendMessage(id, messages.messages.cc_name_prompt);
        bot.once("message", (callback) => {
          if (callback.text == "cancel")
            return bot.sendMessage(id, messages.messages.cancelled);
          string = callback.text;
          //If the command already exists, return
          if (
            settings
              .prepare(
                `SELECT * FROM custom_commands_${locale} WHERE string = ?`
              )
              .get(string)
          ) {
            return bot.sendMessage(
              id,
              messages.messages.cc_exists
            );
          }
          bot.sendMessage(id, messages.messages.cc_text_prompt);
          bot.once("message", (callback) => {
            if (callback.text == "cancel")
              return bot.sendMessage(id, messages.messages.cancelled);
            response = callback.text;
            //Add the command to the database
            settings
              .prepare(
                `INSERT INTO custom_commands_${locale} (type, string, response, link) VALUES (?, ?, ?, ?)`
              )
              .run("text", string, response, "N/A");
            bot.sendMessage(id, messages.messages.cc_added);
            setTimeout(() => {
            bot.sendMessage(id, messages.messages.addcc_again, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: messages.messages.yes,
                      callback_data: "yes",
                    },
                    {
                      text: messages.messages.no,
                      callback_data: "no",
                    },
                  ],
                ],
              },
            });
          }, 500);
            bot.once("callback_query", (callbackQuery) => {
              if (callbackQuery.data == "yes") {
                addcc(id, locale);
              } else {
                return bot.sendMessage(id, messages.messages.cancelled);
              }
            });
          });
        });
        break;
      case "link":
        //Ask for the name of the command
        bot.sendMessage(id, messages.messages.cc_name_prompt);
        bot.once("message", (callback) => {
          if (callback.text == "cancel")
            return bot.sendMessage(id, messages.messages.cancelled);
          string = callback.text;
                    //If the command already exists, return
                    if (
                      settings
                        .prepare(
                          `SELECT * FROM custom_commands_${locale} WHERE string = ?`
                        )
                        .get(string)
                    ) {
                      return bot.sendMessage(
                        id,
                        messages.messages.cc_exists
                      );
                    }
          bot.sendMessage(id, messages.messages.cc_text_prompt);
          bot.once("message", (callback) => {
            if (callback.text == "cancel")
              return bot.sendMessage(id, messages.messages.cancelled);
            response = callback.text;
            bot.sendMessage(id, messages.messages.cc_link_prompt);
            bot.once("message", (callback) => {
              if (callback.text == "cancel")
                return bot.sendMessage(id, messages.messages.cancelled);
              if (!callback.text.startsWith("https://")) {
                //Telegram only accepts HTTPS sites as web apps
                return bot.sendMessage(id, messages.messages.website_invalid);
              }
              link = callback.text;
              //Add the command to the database
              settings
                .prepare(
                  `INSERT INTO custom_commands_${locale} (type, string, response, link) VALUES (?, ?, ?, ?)`
                )
                .run("link", string, response, link);
              bot.sendMessage(id, messages.messages.cc_added);
              setTimeout(() => {
              bot.sendMessage(id, messages.messages.addcc_again, {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: messages.messages.yes,
                        callback_data: "yes",
                      },
                      {
                        text: messages.messages.no,
                        callback_data: "no",
                      },
                    ],
                  ],
                },
              });
            }, 500);
              bot.once("callback_query", (callbackQuery) => {
                if (callbackQuery.data == "yes") {
                  addcc(id, locale);
                } else {
                  return bot.sendMessage(id, messages.messages.cancelled);
                }
              });
            });
          });
        });
        break;
      default:
        break;
    }
  });
}

function delcc(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var keyboard = [];
  var custom_commands = settings
    .prepare(`SELECT * FROM custom_commands_${locale}`)
    .all();
  if (custom_commands.length == 0) {
    return bot.sendMessage(id, messages.messages.no_customcommands);
  }
  custom_commands.forEach((custom_command) => {
    keyboard.push([
      {
        text: custom_command.string,
        callback_data: custom_command.string,
      },
    ]);
  });
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(id, messages.messages.cc_select_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(id, messages.messages.cancelled);
      default:
        var cmd = settings
          .prepare(`SELECT * FROM custom_commands_${locale} WHERE string = ?`)
          .get(callback.data);
        if (cmd.string == undefined) return;
        settings
          .prepare(`DELETE FROM custom_commands_${locale} WHERE string = ?`)
          .run(callback.data);
        bot.sendMessage(id, messages.messages.cc_deleted);
        custom_commands = settings
          .prepare(`SELECT * FROM custom_commands_${locale}`)
          .all();
        if (custom_commands.length == 0) {
          return;
        }
        setTimeout(() => {
          bot.sendMessage(id, messages.messages.delcc_again, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: messages.messages.yes,
                    callback_data: "yes",
                  },
                  {
                    text: messages.messages.no,
                    callback_data: "no",
                  },
                ],
              ],
            },
          });
        }, 500);
        bot.once("callback_query", (callbackQuery) => {
          if (callbackQuery.data == "yes") {
            delcc(id, locale);
          } else {
            return bot.sendMessage(id, messages.messages.cancelled);
          }
        });
    }
  });
}

function editcc(id, locale) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var keyboard = [];
  var custom_commands = settings
    .prepare(`SELECT * FROM custom_commands_${locale}`)
    .all();
  if (custom_commands.length == 0) {
    return bot.sendMessage(id, messages.messages.no_customcommands);
  }
  custom_commands.forEach((custom_command) => {
    keyboard.push([
      {
        text: custom_command.string,
        callback_data: custom_command.string,
      },
    ]);
  });
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(id, messages.messages.cc_select_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(id, messages.messages.cancelled);
      default:
        var cmd = settings
          .prepare(`SELECT * FROM custom_commands_${locale} WHERE string = ?`)
          .get(callback.data);
        if (cmd.string == undefined) return;
        switch (cmd.type) {
          case "text":
            bot.sendMessage(id, messages.messages.cc_edit_prompt, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: messages.messages.cc_edit_string,
                      callback_data: "string",
                    },
                  ],
                  [
                    {
                      text: messages.messages.cc_type_text,
                      callback_data: "text",
                    },
                  ],
                  [
                    {
                      text: messages.messages.cancel,
                      callback_data: "cancel",
                    },
                  ],
                ],
              },
            });
            bot.once("callback_query", (callback) => {
              switch (callback.data) {
                case "cancel":
                  return bot.sendMessage(id, messages.messages.cancelled);
                case "string":
                  bot.sendMessage(id, messages.messages.cc_edit_string_prompt);
                  bot.once("message", (callback) => {
                    if (callback.text == "cancel")
                      return bot.sendMessage(id, messages.messages.cancelled);
                      //If current string is the same as the new string, don't do anything
                    if (callback.text == cmd.string)
                      return bot.sendMessage(id, messages.messages.cc_exists);
                      //If a command with the new string already exists, don't do anything
                    var cmd2 = settings
                      .prepare(
                        `SELECT * FROM custom_commands_${locale} WHERE string = ?`
                      )
                      .get(callback.text);
                    if (cmd2.string != undefined)
                      return bot.sendMessage(id, messages.messages.cc_exists);
                    settings
                      .prepare(
                        `UPDATE custom_commands_${locale} SET string = ? WHERE string = ?`
                      )
                      .run(callback.text, cmd.string);
                    return bot.sendMessage(id, messages.messages.cc_edited);
                  });
                  break;
                case "text":
                  bot.sendMessage(id, messages.messages.cc_edit_text_prompt);
                  bot.once("message", (callback) => {
                    if (callback.text == "cancel")
                      return bot.sendMessage(id, messages.messages.cancelled);
                    settings
                      .prepare(
                        `UPDATE custom_commands_${locale} SET response = ? WHERE string = ?`
                      )
                      .run(callback.text, cmd.string);
                    return bot.sendMessage(id, messages.messages.cc_edited);
                  });
                  break;
                default:
                  break;
              }
            });
            break;
          case "link":
            bot.sendMessage(id, messages.messages.cc_edit_prompt, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: messages.messages.cc_edit_string,
                      callback_data: "string",
                    },
                  ],
                  [
                    {
                      text: messages.messages.cc_type_text,
                      callback_data: "text",
                    },
                  ],
                  [
                    {
                      text: messages.messages.cc_type_link,
                      callback_data: "link",
                    },
                  ],
                  [
                    {
                      text: messages.messages.cancel,
                      callback_data: "cancel",
                    },
                  ],
                ],
              },
            });
            bot.once("callback_query", (callback) => {
              switch (callback.data) {
                case "cancel":
                  return bot.sendMessage(id, messages.messages.cancelled);
                case "string":
                  bot.sendMessage(id, messages.messages.cc_edit_string_prompt);
                  bot.once("message", (callback) => {
                    if (callback.text == "cancel")
                      return bot.sendMessage(id, messages.messages.cancelled);
                    settings
                      .prepare(
                        `UPDATE custom_commands_${locale} SET string = ? WHERE string = ?`
                      )
                      .run(callback.text, cmd.string);
                    return bot.sendMessage(id, messages.messages.cc_edited);
                  });
                  break;
                case "text":
                  bot.sendMessage(id, messages.messages.cc_edit_text_prompt);
                  bot.once("message", (callback) => {
                    if (callback.text == "cancel")
                      return bot.sendMessage(id, messages.messages.cancelled);
                    settings
                      .prepare(
                        `UPDATE custom_commands_${locale} SET response = ? WHERE string = ?`
                      )
                      .run(callback.text, cmd.string);
                    return bot.sendMessage(id, messages.messages.cc_edited);
                  });
                  break;
                case "link":
                  bot.sendMessage(id, messages.messages.cc_edit_link_prompt);
                  bot.once("message", (callback) => {
                    if (callback.text == "cancel")
                      return bot.sendMessage(id, messages.messages.cancelled);
                    if (!callback.text.startsWith("https://")) {
                      //Telegram only accepts HTTPS sites as web apps
                      return bot.sendMessage(
                        id,
                        messages.messages.website_invalid
                      );
                    }
                    settings
                      .prepare(
                        `UPDATE custom_commands_${locale} SET link = ? WHERE string = ?`
                      )
                      .run(callback.text, cmd.string);
                    return bot.sendMessage(id, messages.messages.cc_edited);
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
}

function calc(id, options) {
  var messages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(id, defaultlang) + ".json")
  );
  var count = 0;
  //Get all courses
  var courses = settings
    .prepare(`SELECT * FROM courses_${getLocale(id, defaultlang)}`)
    .all();
  if (courses.length == 0)
    return bot.sendMessage(id, messages.messages.no_courses);
  //Send a waiting message
  bot.sendMessage(id, messages.messages.calculating);
  //For each course
  setTimeout(() => {
  courses.forEach((course) => {
    var subject_1 = course.subject_1.split(",");
    var subject_2 = course.subject_2.split(",");
    var subject_3 = course.subject_3.split(",");
    let match_1 = options.some((option) => subject_1.includes(option));
    let match_2 = options.some((option) => subject_2.includes(option));
    let match_3 = options.some((option) => subject_3.includes(option));
    //If any of the subjects doesn't exist, delcare it matched
    if (subject_1.toString() == "N/A") match_1 = true;
    if (subject_2.toString() == "N/A") match_2 = true;
    if (subject_3.toString() == "N/A") match_3 = true;
    if (match_1 && match_2 && match_3) {
      count = count + 1;
      var ready =
        messages.messages.coursefield1 +
        course.name +
        "\n" +
        messages.messages.coursefield2 +
        course.min_score +
        "\n" +
        messages.messages.coursefield3 +
        course.budget;
        //Include extra subjects, if any
        if (course.extra != "N/A") {
          ready = ready + "\n" + messages.messages.extra_subjects_alert.replace("{subjects}", course.extra);
        }
      return bot.sendMessage(id, ready);
    }
  });
}, 500);
}

//This sucks as it doesn't account for different languages and courses
//var subjects = ["Русский язык", "Математика", "Обществознание", "География", "Биология", "Химия", "Иностранный язык", "Информатика", "История", "Литература"];

//User commands

bot.onText(/\/start/, (msg, match) => {
  const chatId = msg.chat.id;
  console.log(msg.from.id);
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  //Return if not a private channel
  if (msg.chat.type != "private") return;
  //Send messages
  //Get welcome message from the database
  var welcome = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'welcome_text_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  var buttontext = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'webbutton_text_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  var website = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'website_link_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  bot.sendMessage(chatId, welcome.value);
  if (website.value != "") {
    bot.setChatMenuButton({
      chat_id: msg.chat.id,
      menu_button: JSON.stringify({
        type: "web_app",
        text: buttontext.value,
        web_app: {
          url: website.value,
        },
      }),
    });
  }
});

bot.onText(/\/help/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get();
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (chatId != contactchannelid.value) {
    if (msg.chat.type == "private")
      bot.sendMessage(chatId, messages.messages.help);
    //Get all the custom commands from the database
    var customcommands = settings
      .prepare(
        "SELECT * FROM custom_commands_" + getLocale(msg.from.id, defaultlang)
      )
      .all();
    if (customcommands.length > 0) {
      var message = messages.messages.customcommands;
      customcommands.forEach((customcommand) => {
        message += "!" + customcommand.string + "\n";
      });
      bot.sendMessage(chatId, message);
    }
  } else {
    var ccmessages = JSON.parse(
      fs.readFileSync("./messages_" + getLocale(chatId, defaultlang) + ".json")
    );
    bot.sendMessage(chatId, ccmessages.messages.help_contact);
  }
});

bot.onText(/\/faq/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  //Get faq message from the database
  var faq = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'faq_text_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  bot.sendMessage(chatId, faq.value);
});

bot.onText(/\/newticket/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  if (!contactchannelid || contactchannelid == undefined)
    return bot.sendMessage(chatId, messages.messages.no_contact_channel);
  var ccmessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(contactchannelid, defaultlang) + ".json"
    )
  );
  //If the module is disabled, return
  if (
    settings
      .prepare("SELECT value FROM settings WHERE option = 'contact'")
      .get().value == "false"
  )
    return;
  //If the user is banned, send a message and return
  if (
    settings
      .prepare("SELECT is_contactbanned FROM users WHERE id = ?")
      .get(msg.from.id).is_contactbanned == "true"
  )
    return bot.sendMessage(chatId, messages.messages.banned);
  //If a user already has an open ticket, send a message and return
  if (
    settings.prepare("SELECT * FROM tickets WHERE userid = ?").get(msg.from.id)
  )
    return bot.sendMessage(chatId, messages.messages.ticket_open);
  //Prompt the user to enter their message
  bot.sendMessage(chatId, messages.messages.contact_prompt);
  bot.once("message", (msg) => {
    if (msg.text == "/cancel") {
      return bot.sendMessage(chatId, messages.messages.cancelled);
    }
    //Add a new ticket to the database
    settings
      .prepare("INSERT OR IGNORE INTO tickets(userid) VALUES(?)")
      .run(msg.from.id);
    //Forward the message to the contact channel
    bot.sendMessage(contactchannelid, ccmessages.messages.newticket);
    setTimeout(() => {
      bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
    }, 500);
    //Send a confirmation message
    return bot.sendMessage(chatId, messages.messages.contact_sent);
  });
});

bot.onText(/\/calculator/, (msg, match) => {
  if (msg.chat.type != "private") return;
  var ispoll = false;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  //If toggled off, return
  if (
    settings
      .prepare("SELECT value FROM settings WHERE option = 'calculator'")
      .get().value == "false"
  )
    return;
  //Get all the subjects from the database
  var subjects = settings
    .prepare(`SELECT * FROM subjects_${getLocale(msg.from.id, defaultlang)}`)
    .all();
  if (subjects.length == 0)
    return bot.sendMessage(msg.chat.id, messages.messages.no_subjects);
  //Send a poll with the subjects as options
  if (subjects.length <= 10) {
    var pollmsgid = undefined;
    bot
      .sendPoll(
        msg.chat.id,
        messages.messages.choose,
        subjects.map((subject) => subject.name),
        {
          allows_multiple_answers: true,
          is_anonymous: false,
        }
      )
      .then((msg) => {
        pollmsgid = msg.message_id;
      });
      setTimeout(() => {
        bot.sendMessage(msg.chat.id, messages.messages.cancel_prompt);
      }, 500);
    ispoll = true;
    bot.once("message", (msg) => {
      if (msg.text == "/cancel") {
        bot.deleteMessage(msg.chat.id, pollmsgid);
        ispoll = false;
        return bot.sendMessage(msg.chat.id, messages.messages.cancelled);
      }
    });
    bot.once("poll_answer", (ans) => {
      if (ispoll == false) return;
      console.log(ans.option_ids);
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
    setTimeout(() => {
      bot.sendMessage(msg.from.id, messages.messages.input_subjects);
    }, 500);
    bot.once("message", (msg) => {
      var option_ids = [];
      var options = msg.text.split(", ");
      options.forEach((option) => {
        option = parseInt(option) - 1;
        option_ids.push(option.toString());
      });
      calc(msg.from.id, option_ids);
    });
  }
});

bot.onText(/\/quiz/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  //If the module is disabled, return
  if (
    settings.prepare("SELECT value FROM settings WHERE option = 'quiz'").get()
      .value == "false"
  )
    return;
  //List all quizzes via a keyboard
  var quizzes = settings
    .prepare(`SELECT * FROM quizzes_${getLocale(msg.from.id, defaultlang)}`)
    .all();
  if (quizzes.length == 0)
    return bot.sendMessage(chatId, messages.messages.no_quizzes);
  var keyboard = [];
  quizzes.forEach((quiz) => {
    keyboard.push([
      {
        text: quiz.name,
        callback_data: quiz.id,
      },
    ]);
  });
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(chatId, messages.messages.quiz_list, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (callbackQuery) => {
    if (callbackQuery.data == "cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    //Check if quiz is valid
    var quiz = settings
      .prepare(
        `SELECT * FROM quizzes_${getLocale(
          msg.from.id,
          defaultlang
        )} WHERE id = ?`
      )
      .get(callbackQuery.data);
    if (!quiz) return;
    return getquiz(
      msg.from.id,
      callbackQuery.data,
      getLocale(msg.from.id, defaultlang)
    );
  });
});

bot.onText(/\/subscription/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  //If toggled off, return
  if (
    settings
      .prepare("SELECT value FROM settings WHERE option = 'subscribe'")
      .get().value == "false"
  )
    return;
  //Get subscription status
  var substatus = subscriptionCheck(msg.from.id);
  var keyboard = [];
  if (substatus == true) {
    keyboard.push([
      {
        text: messages.messages.unsubscribe,
        callback_data: "unsubscribe",
      },
    ]);
  } else {
    keyboard.push([
      {
        text: messages.messages.subscribe,
        callback_data: "subscribe",
      },
    ]);
  }
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(
    chatId,
    messages.messages.subscription_status.replace(
      "{status}",
      substatus == true
        ? messages.messages.subscribed
        : messages.messages.not_subscribed
    ),
    {
      reply_markup: {
        inline_keyboard: keyboard,
      },
    }
  );
  bot.once("callback_query", (callbackQuery) => {
    if (callbackQuery.data == "cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    if (callbackQuery.data == "subscribe") {
      subscribe(msg.from.id);
    } else if (callbackQuery.data == "unsubscribe") {
      unsubscribe(msg.from.id);
    }
  });
});

bot.onText(/\/suggest/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  //If toggled off, return
  if (
    settings
      .prepare("SELECT value FROM settings WHERE option = 'suggest'")
      .get().value == "false"
  )
    return;
  //If no contact channel is set, return
  if (contactchannelid == "") return;
  //if user is banned, return
  if (
    settings
      .prepare("SELECT is_contactbanned FROM users WHERE id = ?")
      .get(msg.from.id).is_contactbanned == "true"
  )
    return bot.sendMessage(chatId, messages.messages.banned);
  var ccmessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(contactchannelid, defaultlang) + ".json"
    )
  );
  //Prompt the user to input a message
  bot.sendMessage(chatId, messages.messages.suggest_message);
  bot.once("message", (msg) => {
    if (msg.text == "/cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    //If there's media, wait for it to fully upload
    bot.sendMessage(contactchannelid, ccmessages.messages.newsuggestion);
    setTimeout(() => {
      bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
    }, 500);
    bot.sendMessage(chatId, messages.messages.suggest_success);
  });
});

bot.onText(/\/language/, (msg, match) => {
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: messages.messages.locale_en,
            callback_data: "en",
          },
        ],
        [
          {
            text: messages.messages.locale_ru,
            callback_data: "ru",
          },
        ],
        [
          {
            text: messages.messages.cancel,
            callback_data: "cancel",
          },
        ],
      ],
    },
  });
  bot.once("callback_query", (callbackQuery) => {
    switch (callbackQuery.data) {
      case "cancel":
        return bot.sendMessage(
          callbackQuery.message.chat.id,
          messages.messages.cancelled
        );
      case "en":
      case "ru":
        if (msg.chat.type == "private") {
          settings
            .prepare("UPDATE users SET language = ? WHERE id = ?")
            .run(callbackQuery.data, msg.from.id);
          bot.sendMessage(msg.from.id, messages.messages.language_changed);
          var buttontext = settings
            .prepare(
              "SELECT value FROM settings WHERE option = 'webbutton_text_" +
                getLocale(msg.from.id, defaultlang) +
                "'"
            )
            .get();
          var website = settings
            .prepare(
              "SELECT value FROM settings WHERE option = 'website_link_" +
                getLocale(msg.from.id, defaultlang) +
                "'"
            )
            .get();
          if (website.value != "") {
            bot.setChatMenuButton({
              chat_id: msg.chat.id,
              menu_button: JSON.stringify({
                type: "web_app",
                text: buttontext.value,
                web_app: {
                  url: website.value,
                },
              }),
            });
          }
        }
        if (msg.chat.id == contactchannelid) {
          settings
            .prepare(
              "UPDATE settings SET value = ? WHERE option = 'contact_channel_lang'"
            )
            .run(callbackQuery.data);
          bot.sendMessage(contactchannelid, messages.messages.language_changed);
        }
        break;
      default:
        break;
    }
  });
});

//Contact channel commands

//ID command: gets the ID of the user who sent the message
bot.onText(/\/id/, (msg, match) => {
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  switch (msg.chat.type) {
    case "private":
      return bot.sendMessage(msg.from.id, `ID: ${msg.from.id}`);
    case "group":
    case "supergroup":
    case "channel":
      if (!msg.reply_to_message)
        return bot.sendMessage(msg.chat.id, `ID: ${msg.from.id}`);
      if (msg.reply_to_message && !msg.reply_to_message.forward_from)
        return bot.sendMessage(
          msg.chat.id,
          `ID: ${msg.reply_to_message.from.id}`
        );
      if (msg.reply_to_message && msg.reply_to_message.forward_from)
        return bot.sendMessage(
          msg.chat.id,
          `ID: ${msg.reply_to_message.forward_from.id}`
        );
  }
 });

bot.onText(/\/ban/, (msg, match) => {
  var usermessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, usermessages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" +
        getLocale(msg.reply_to_message.forward_from.id, defaultlang) +
        ".json"
    )
  );
  if (chatId != contactchannelid) return;
  var ccmessages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(chatId, defaultlang) + ".json")
  );
  if (msg.reply_to_message == undefined) return;
  settings
    .prepare("DELETE FROM tickets WHERE userid = ?")
    .run(msg.reply_to_message.forward_from.id);
  settings
    .prepare("UPDATE users SET is_contactbanned = 'true' WHERE id = ?")
    .run(msg.reply_to_message.forward_from.id);
  bot.sendMessage(chatId, ccmessages.messages.ban_success);
  return bot.sendMessage(
    msg.reply_to_message.forward_from.id,
    messages.messages.banned
  );
});

bot.onText(/\/unban/, (msg, match) => {
  var usermessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, usermessages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" +
        getLocale(msg.reply_to_message.forward_from.id, defaultlang) +
        ".json"
    )
  );
  if (chatId != contactchannelid) return;
  var ccmessages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(chatId, defaultlang) + ".json")
  );
  if (msg.reply_to_message == undefined) return;
  settings
    .prepare("DELETE FROM tickets WHERE userid = ?")
    .run(msg.reply_to_message.forward_from.id);
  settings
    .prepare("UPDATE users SET is_contactbanned = 'false' WHERE id = ?")
    .run(msg.reply_to_message.forward_from.id);
  bot.sendMessage(chatId, ccmessages.messages.unban_success);
  return bot.sendMessage(
    msg.reply_to_message.forward_from.id,
    messages.messages.unbanned
  );
});

//Close ticket
bot.onText(/\/close/, (msg, match) => {
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  const chatId = msg.chat.id;
  if (chatId != contactchannelid) return;
  var ccmessages = JSON.parse(
    fs.readFileSync("./messages_" + getLocale(chatId, defaultlang) + ".json")
  );
  if (msg.reply_to_message == undefined) return;
  //Remove the ticket
  settings
    .prepare("DELETE FROM tickets WHERE userid = ?")
    .run(msg.reply_to_message.forward_from.id);
  //Send a message
  bot.sendMessage(
    msg.reply_to_message.forward_from.id,
    messages.messages.ticket_closed
  );
  return bot.sendMessage(chatId, ccmessages.messages.ticket_closed);
});

//Admin commands

bot.onText(/\/adminhelp/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  bot.sendMessage(chatId, messages.messages.help_admin);
  if (superadminCheck(msg.from.id))
    bot.sendMessage(chatId, messages.messages.help_superadmin);
});

bot.onText(/\/contactchannel/, (msg, match) => {
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  var contactchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = 'contact_channel'")
    .get().value;
  const chatId = msg.chat.id;
  if (msg.chat.type == "private") {
    return bot.sendMessage(
      chatId,
      messages.messages.channel_get + contactchannelid
    );
  } else {
    settings
      .prepare("UPDATE settings SET value = ? WHERE option = 'contact_channel'")
      .run(chatId);
    return bot.sendMessage(chatId, messages.messages.channel_success);
  }
});

bot.onText(/\/resetcontact/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  settings
    .prepare("UPDATE settings SET value = ? WHERE option = 'contact_channel'")
    .run("");
  return bot.sendMessage(chatId, messages.messages.channel_reset);
});

//Reset subscribe channel
bot.onText(/\/resetsub/, (msg, match) => {
  const chatId = msg.chat.id;
  if (msg.chat.type != "private") return;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  settings
    .prepare("UPDATE settings SET value = ? WHERE option = 'sub_channel'")
    .run("");
  return bot.sendMessage(chatId, messages.messages.subchannel_reset);
});

bot.onText(/\/settings/, (msg, match) => {
  if (msg.chat.type != "private") return;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  const chatId = msg.chat.id;
  //Unifies all of the commands into one
  var keyboard = [
    [
      {
        text: messages.messages.courses,
        callback_data: "courses",
      },
    ],
    [
      {
        text: messages.messages.subjects,
        callback_data: "subjects",
      },
    ],
    [
      {
        text: messages.messages.quizzes,
        callback_data: "quizzes",
      },
    ],
    [
      {
        text: messages.messages.custom,
        callback_data: "custom",
      },
    ],
    [
      {
        text: messages.messages.setwelcome,
        callback_data: "setwelcome",
      },
    ],
    [
      {
        text: messages.messages.setfaq,
        callback_data: "setfaq",
      },
    ],
    [
      {
        text: messages.messages.setbutton,
        callback_data: "setbutton",
      },
    ],
    [
      {
        text: messages.messages.setwebsite,
        callback_data: "setwebsite",
      },
    ],
    [
      {
        text: messages.messages.setlocale,
        callback_data: "setlocale",
      },
    ],
    [
      {
        text: messages.messages.toggle,
        callback_data: "toggle",
      },
    ],
    [
      {
        text: messages.messages.cancel,
        callback_data: "cancel",
      },
    ],
  ];
  bot.sendMessage(chatId, messages.messages.settings_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (callback) => {
    switch (callback.data) {
      case "cancel":
        return bot.sendMessage(chatId, messages.messages.cancelled);
      case "custom":
        var locale = "";
        bot.sendMessage(msg.chat.id, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (msg) => {
          switch (msg.data) {
            case "cancel":
              bot.sendMessage(chatId, messages.messages.cancelled);
              break;
            case "en":
            case "ru":
              locale = msg.data;
              var customcommands = settings
                .prepare(
                  "SELECT * FROM custom_commands_" +
                    locale
                )
                .all();
              if (customcommands.length == 0) {
                bot.sendMessage(chatId, messages.messages.no_customcommands, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addcc,
                          callback_data: "addcc",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              if (customcommands.length > 0) {
                var message = messages.messages.customcommands;
                customcommands.forEach((customcommand) => {
                  message += "!" + customcommand.string + "\n";
                });
                bot.sendMessage(chatId, message, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addcc,
                          callback_data: "addcc",
                        },
                      ],
                      [
                        {
                          text: messages.messages.delcc,
                          callback_data: "delcc",
                        },
                      ],
                      [
                        {
                          text: messages.messages.editcc,
                          callback_data: "editcc",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              bot.once("callback_query", (msg) => {
                switch (msg.data) {
                  case "cancel":
                    bot.sendMessage(chatId, messages.messages.cancelled);
                    break;
                  case "addcc":
                    addcc(msg.from.id, locale);
                    break;
                  case "delcc":
                    delcc(msg.from.id, locale);
                    break;
                  case "editcc":
                    editcc(msg.from.id, locale);
                    break;
                  default:
                    break;
                }
              });
              break;
          }
        });
        break;
      case "courses":
        var locale = "";
        bot.sendMessage(msg.chat.id, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (msg) => {
          switch (msg.data) {
            case "cancel":
              bot.sendMessage(chatId, messages.messages.cancelled);
              break;
            case "en":
            case "ru":
              locale = msg.data;
              //Get all courses from the database
              var courses = settings
                .prepare(`SELECT * FROM courses_${locale}`)
                .all();
              //If no courses are found, return
              if (courses.length == 0) {
                bot.sendMessage(chatId, messages.messages.no_courses, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addcourse,
                          callback_data: "addcourse",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              if (courses.length > 0) {
                //Send a message with all courses
                var message = "";
                for (var i = 0; i < courses.length; i++) {
                  var subjects = [];
                  courses[i].subject_1.split(",").forEach((subject) => {
                    if (subject.toString() == "N/A") {
                      subjects.push(subject);
                      return;
                    }
                    subject = parseInt(subject) + 1;
                    subjects.push(
                      settings
                        .prepare(
                          `SELECT * FROM subjects_${locale} WHERE id = ?`
                        )
                        .get(subject).name
                    );
                  });
                  courses[i].subject_2.split(",").forEach((subject) => {
                    if (subject.toString() == "N/A") {
                      subjects.push(subject);
                      return;
                    }
                    subject = parseInt(subject) + 1;
                    subjects.push(
                      settings
                        .prepare(
                          `SELECT * FROM subjects_${locale} WHERE id = ?`
                        )
                        .get(subject).name
                    );
                  });
                  courses[i].subject_3.split(",").forEach((subject) => {
                    if (subject.toString() == "N/A") {
                      subjects.push(subject);
                      return;
                    }
                    subject = parseInt(subject) + 1;
                    subjects.push(
                      settings
                        .prepare(
                          `SELECT * FROM subjects_${locale} WHERE id = ?`
                        )
                        .get(subject).name
                    );
                  });
                  bot.sendMessage(chatId, `${messages.messages.field_name}: ${
                    courses[i].name
                  }\n${messages.messages.field_subjects}: ${subjects.join(
                    ", "
                  )}\n${messages.messages.field_score}: ${
                    courses[i].min_score
                  }\n${messages.messages.field_budget}: ${
                    courses[i].budget
                  }\n${messages.messages.field_extra}: ${
                    courses[i].extra
                  }\n\n`);
                }
                message = messages.messages.action_prompt;
                setTimeout(() => {
                bot.sendMessage(chatId, message, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addcourse,
                          callback_data: "addcourse",
                        },
                      ],
                      [
                        {
                          text: messages.messages.editcourse,
                          callback_data: "editcourse",
                        },
                      ],
                      [
                        {
                          text: messages.messages.delcourse,
                          callback_data: "delcourse",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
                }, 1000);
              }
              bot.once("callback_query", (msg) => {
                switch (msg.data) {
                  case "cancel":
                    bot.sendMessage(chatId, messages.messages.cancelled);
                    break;
                  case "addcourse":
                    addcourse(msg.from.id, locale);
                    break;
                  case "editcourse":
                    editcourse(msg.from.id, locale);
                    break;
                  case "delcourse":
                    delcourse(msg.from.id, locale);
                    break;
                  default:
                    break;
                }
              });
          }
        });
        break;
      case "subjects":
        var locale = "";
        bot.sendMessage(msg.chat.id, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (msg) => {
          switch (msg.data) {
            case "cancel":
              bot.sendMessage(chatId, messages.messages.cancelled);
              break;
            case "en":
            case "ru":
              locale = msg.data;
              //Get all subjects from the database
              var subjects = settings
                .prepare(`SELECT * FROM subjects_${locale}`)
                .all();
              //If no subjects are found, return
              if (subjects.length == 0) {
                bot.sendMessage(chatId, messages.messages.no_subjects, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addsubject,
                          callback_data: "addsubject",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              if (subjects.length > 0) {
                //Send a message with all subjects
                var message = "";
                for (var i = 0; i < subjects.length; i++) {
                  message += subjects[i].name + "\n";
                }
                bot.sendMessage(chatId, message, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addsubject,
                          callback_data: "addsubject",
                        },
                      ],
                      [
                        {
                          text: messages.messages.delsubject,
                          callback_data: "deletesubject",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              bot.once("callback_query", (msg) => {
                switch (msg.data) {
                  case "cancel":
                    bot.sendMessage(chatId, messages.messages.cancelled);
                    break;
                  case "addsubject":
                    addsubject(msg.from.id, locale);
                    break;
                  case "deletesubject":
                    deletesubject(msg.from.id, locale);
                    break;
                  default:
                    break;
                }
              });
          }
        });
        break;
      case "quizzes":
        var locale = "";
        bot.sendMessage(msg.chat.id, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (msg) => {
          switch (msg.data) {
            case "cancel":
              bot.sendMessage(chatId, messages.messages.cancelled);
              break;
            case "en":
            case "ru":
              locale = msg.data;
              //Get all quizzes from the database
              var quizzes = settings
                .prepare(`SELECT * FROM quizzes_${locale}`)
                .all();
              //If no quizzes are found, return
              if (quizzes.length == 0) {
                bot.sendMessage(chatId, messages.messages.no_quizzes, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addquiz,
                          callback_data: "addquiz",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              if (quizzes.length > 0) {
                //Send a message with all quizzes
                var message = "";
                for (var i = 0; i < quizzes.length; i++) {
                  message += quizzes[i].name + "\n";
                }
                bot.sendMessage(chatId, message, {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        {
                          text: messages.messages.addquiz,
                          callback_data: "addquiz",
                        },
                      ],
                      [
                        {
                          text: messages.messages.delquiz,
                          callback_data: "delquiz",
                        },
                      ],
                      [
                        {
                          text: messages.messages.cancel,
                          callback_data: "cancel",
                        },
                      ],
                    ],
                  },
                });
              }
              bot.once("callback_query", (msg) => {
                switch (msg.data) {
                  case "cancel":
                    bot.sendMessage(chatId, messages.messages.cancelled);
                    break;
                  case "addquiz":
                    addquiz(msg.from.id, locale);
                    break;
                  case "delquiz":
                    delquiz(msg.from.id, locale);
                    break;
                  default:
                    break;
                }
              });
          }
        });
        break;
      case "setlocale":
        bot.sendMessage(msg.chat.id, messages.messages.locale_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (callbackQuery) => {
          switch (callbackQuery.data) {
            case "cancel":
              return bot.sendMessage(
                callbackQuery.message.chat.id,
                messages.messages.cancelled
              );
            case "en":
            case "ru":
              settings
                .prepare(
                  "UPDATE settings SET value = ? WHERE option = 'default_lang'"
                )
                .run(callbackQuery.data);
              bot.sendMessage(msg.from.id, messages.messages.language_changed);
              break;
            default:
              break;
          }
        });
        break;
      case "toggle":
        bot.sendMessage(chatId, messages.messages.toggle_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.calc_name,
                  callback_data: "toggle_calculator",
                },
              ],
              [
                {
                  text: messages.messages.contact_name,
                  callback_data: "toggle_contact",
                },
              ],
              [
                {
                  text: messages.messages.subscribe_name,
                  callback_data: "toggle_subscribe",
                },
              ],
              [
                {
                  text: messages.messages.quiz_name,
                  callback_data: "toggle_quiz",
                },
              ],
              [
                {
                  text: messages.messages.suggest_name,
                  callback_data: "toggle_suggest",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (callbackQuery) => {
          switch (callbackQuery.data) {
            case "cancel":
              return bot.sendMessage(chatId, messages.messages.cancelled);
            case "toggle_calculator":
            case "toggle_contact":
            case "toggle_subscribe":
            case "toggle_quiz":
            case "toggle_suggest":
              var option = callbackQuery.data.slice(
                7,
                callbackQuery.data.length
              );
              console.log(option);
              //Search for the option in the database
              var value = settings
                .prepare("SELECT value FROM settings WHERE option = ?")
                .get(option);
              console.log(value.value);
              if (value.value == "true") {
                settings
                  .prepare(
                    "UPDATE settings SET value = 'false' WHERE option = ?"
                  )
                  .run(option);
                bot.answerCallbackQuery(
                  callbackQuery.id,
                  messages.messages.toggled_off
                );
                bot.sendMessage(chatId, messages.messages.toggled_off);
              } else {
                settings
                  .prepare(
                    "UPDATE settings SET value = 'true' WHERE option = ?"
                  )
                  .run(option);
                bot.answerCallbackQuery(
                  callbackQuery.id,
                  messages.messages.toggled_on
                );
                bot.sendMessage(chatId, messages.messages.toggled_on);
              }
              break;
            default:
              break;
          }
        });
        break;
      case "setwelcome":
        bot.sendMessage(chatId, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (callback) => {
          switch (callback.data) {
            case "cancel":
              return bot.sendMessage(chatId, messages.messages.cancelled);
            case "en":
            case "ru":
              //Prompt for the message
              bot.sendMessage(
                chatId,
                messages.messages.setwelcome_message_prompt
              );
              bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                  return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                //Set the welcome message
                settings
                  .prepare("UPDATE settings SET value = ? WHERE option = ?")
                  .run(msg.text, "welcome_text_" + callback.data);
                return bot.sendMessage(
                  chatId,
                  messages.messages.welcome_message_set
                );
              });
              break;
            default:
              break;
          }
        });
        break;
      case "setfaq":
        bot.sendMessage(chatId, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
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
                settings
                  .prepare("UPDATE settings SET value = ? WHERE option = ?")
                  .run(msg.text, "faq_text_" + callback.data);
                return bot.sendMessage(
                  chatId,
                  messages.messages.faq_message_set
                );
              });
              break;
            default:
              break;
          }
        });
        break;
      case "setbutton":
        bot.sendMessage(chatId, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
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
                settings
                  .prepare("UPDATE settings SET value = ? WHERE option = ?")
                  .run(msg.text, "webbutton_text_" + callback.data);
                var buttontext = settings
                  .prepare(
                    "SELECT value FROM settings WHERE option = 'webbutton_text_" +
                      getLocale(msg.from.id, defaultlang) +
                      "'"
                  )
                  .get();
                var website = settings
                  .prepare(
                    "SELECT value FROM settings WHERE option = 'website_link_" +
                      getLocale(msg.from.id, defaultlang) +
                      "'"
                  )
                  .get();
                if (website.value != "") {
                  bot.setChatMenuButton({
                    chat_id: msg.chat.id,
                    menu_button: JSON.stringify({
                      type: "web_app",
                      text: buttontext.value,
                      web_app: {
                        url: website.value,
                      },
                    }),
                  });
                }
                return bot.sendMessage(
                  chatId,
                  messages.messages.button_text_set
                );
              });
              break;
            default:
              break;
          }
        });
        break;
      case "setwebsite":
        bot.sendMessage(chatId, messages.messages.locale_edit_prompt, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.locale_en,
                  callback_data: "en",
                },
              ],
              [
                {
                  text: messages.messages.locale_ru,
                  callback_data: "ru",
                },
              ],
              [
                {
                  text: messages.messages.cancel,
                  callback_data: "cancel",
                },
              ],
            ],
          },
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
                  return bot.sendMessage(
                    chatId,
                    messages.messages.website_invalid
                  );
                }
                //Set the welcome message
                settings
                  .prepare("UPDATE settings SET value = ? WHERE option = ?")
                  .run(msg.text, "website_link_" + callback.data);
                var buttontext = settings
                  .prepare(
                    "SELECT value FROM settings WHERE option = 'webbutton_text_" +
                      getLocale(msg.from.id, defaultlang) +
                      "'"
                  )
                  .get();
                var website = settings
                  .prepare(
                    "SELECT value FROM settings WHERE option = 'website_link_" +
                      getLocale(msg.from.id, defaultlang) +
                      "'"
                  )
                  .get();
                if (website.value != "") {
                  bot.setChatMenuButton({
                    chat_id: msg.chat.id,
                    menu_button: JSON.stringify({
                      type: "web_app",
                      text: buttontext.value,
                      web_app: {
                        url: website.value,
                      },
                    }),
                  });
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

bot.onText(/\/approve/, (msg) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  var subchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = ?")
    .get("sub_channel").value;
  if (!msg.reply_to_message) return;
  if (subchannelid.value == "")
    return bot.sendMessage(chatId, ccmessages.messages.no_subscribechannel);
  var messages_user = JSON.parse(
    fs.readFileSync(
      "./messages_" +
        getLocale(msg.reply_to_message.forward_from.id, defaultlang) +
        ".json"
    )
  );
  var ccmessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.chat.id, defaultlang) + ".json"
    )
  );
  bot.forwardMessage(
    subchannelid,
    msg.chat.id,
    msg.reply_to_message.message_id
  );
  bot.sendMessage(
    msg.reply_to_message.forward_from.id,
    messages_user.messages.approved
  );
  bot.sendMessage(chatId, ccmessages.messages.approve_success);
});

bot.onText(/\/deny/, (msg) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (adminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (!msg.reply_to_message) return;
  var messages_user = JSON.parse(
    fs.readFileSync(
      "./messages_" +
        getLocale(msg.reply_to_message.forward_from.id, defaultlang) +
        ".json"
    )
  );
  var ccmessages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.chat.id, defaultlang) + ".json"
    )
  );
  bot.deleteMessage(msg.chat.id, msg.reply_to_message.message_id);
  bot.sendMessage(
    msg.reply_to_message.forward_from.id,
    messages_user.messages.deny
  );
  bot.sendMessage(chatId, ccmessages.messages.deny_success);
});

//Admin management commands: add, del, transfer ownership
bot.onText(/\/addadmin/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (superadminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  var users = settings
    .prepare("SELECT id FROM users WHERE status = 'user'")
    .all();
  var userlist = [];
  for (var i = 0; i < users.length; i++) {
    userlist.push([{ text: users[i].id, callback_data: users[i].id }]);
  }
  userlist.push([
    {
      text: "Cancel",
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(chatId, messages.messages.addadmin_prompt, {
    reply_markup: {
      inline_keyboard: userlist,
    },
  });
  bot.once("callback_query", (msg) => {
    if (msg.data == "cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    settings
      .prepare("UPDATE users SET status = ? WHERE id = ?")
      .run("admin", msg.data);
    return bot.sendMessage(chatId, messages.messages.admin_added);
  });
});

bot.onText(/\/deladmin/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (superadminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  //Get all admins from the database
  var admins = settings
    .prepare("SELECT * FROM users WHERE status = ?")
    .all("admin");
  //If no admins are found, return
  if (admins.length == 0) {
    return bot.sendMessage(chatId, messages.messages.no_admins);
  }
  //Create a keyboard with all admins
  var keyboard = [];
  for (var i = 0; i < admins.length; i++) {
    keyboard.push([
      {
        text: admins[i].id,
        callback_data: admins[i].id,
      },
    ]);
  }
  keyboard.push([
    {
      text: messages.messages.cancel,
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(chatId, messages.messages.deladmin_prompt, {
    reply_markup: {
      inline_keyboard: keyboard,
    },
  });
  bot.once("callback_query", (msg) => {
    switch (msg.data) {
      case "cancel":
        return bot.sendMessage(chatId, messages.messages.cancelled);
      default:
        settings
          .prepare("UPDATE users SET status = ? WHERE id = ?")
          .run("user", msg.data);
        return bot.sendMessage(chatId, messages.messages.admin_deleted);
    }
  });
});

bot.onText(/\/transferownership/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (superadminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  var users = settings
    .prepare("SELECT id FROM users WHERE status = 'user' or status = 'admin'")
    .all();
  var userlist = [];
  for (var i = 0; i < users.length; i++) {
    userlist.push([{ text: users[i].id, callback_data: users[i].id }]);
  }
  userlist.push([
    {
      text: "Cancel",
      callback_data: "cancel",
    },
  ]);
  bot.sendMessage(chatId, messages.messages.transferownership_prompt, {
    reply_markup: {
      inline_keyboard: userlist,
    },
  });
  bot.once("callback_query", (msg) => {
    if (msg.data == "cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    bot.sendMessage(chatId, messages.messages.transferownership_confirm, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: messages.messages.yes,
              callback_data: "yes",
            },
            {
              text: messages.messages.no,
              callback_data: "no",
            },
          ],
        ],
      },
    });
    bot.once("callback_query", (callback) => {
      switch (callback.data) {
        case "yes":
          userCheck(msg.data);
          settings
            .prepare("UPDATE users SET status = ? WHERE id = ?")
            .run("superadmin", msg.data);
          settings
            .prepare("UPDATE users SET status = ? WHERE id = ?")
            .run("user", msg.from.id);
          settings
            .prepare("UPDATE settings SET value = ? WHERE option = 'owner_id'")
            .run(msg.data);
          return bot.sendMessage(
            chatId,
            messages.messages.ownership_transferred
          );
        case "no":
          return bot.sendMessage(chatId, messages.messages.cancelled);
      }
    });
  });
});

bot.onText(/\/backup/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (superadminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  //This command allows to get or post the full settings.db
  bot.sendMessage(chatId, messages.messages.migrate_intro, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: messages.messages.migrate_get,
            callback_data: "get",
          },
        ],
        [
          {
            text: messages.messages.migrate_post,
            callback_data: "post",
          },
        ],
        [
          {
            text: messages.messages.cancel,
            callback_data: "cancel",
          },
        ],
      ],
    },
  });
  bot.once("callback_query", (msg) => {
    if (msg.data == "cancel")
      return bot.sendMessage(chatId, messages.messages.cancelled);
    if (msg.data == "get") {
      //Post settings.db as a file
      var settingsdb = fs.readFileSync("./config/settings.db");
      bot.sendDocument(chatId, settingsdb);
      bot.sendMessage(chatId, messages.messages.migrate_done_get);
    }
    if (msg.data == "post") {
      bot.sendMessage(chatId, messages.messages.migrate_post_intro);
      //Get the file from the user
      bot.once("document", (msg) => {
        //Save the file to settings.db
        if (
          msg.document.file_name.endsWith(".db") ||
          msg.document.file_name.endsWith(".sqlite")
        ) {
          bot.downloadFile(msg.document.file_id, "./config").then((res) => {
            fs.unlinkSync("./config/settings.db");
            fs.renameSync(res, "./config/settings.db");
            settings = new sql("./config/settings.db");
            bot.sendMessage(chatId, messages.messages.migrate_done_post);
          });
        } else {
          bot.sendMessage(chatId, messages.messages.migrate_wrong_file);
        }
      });
    }
  });
});

bot.onText(/\/update/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (superadminCheck(msg.from.id) == false) return;
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  //Check if there are any new commits
  git.getLastCommit(function(err, commit) {
    if (err) {
      bot.sendMessage(chatId, messages.messages.update_error);
    } else {
      if (commit.shortHash.toString() != settings.prepare("SELECT value FROM settings WHERE option = 'current_version'").get().value) {
        //Ask for the user to confirm the update
        bot.sendMessage(chatId, messages.messages.update_confirm, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: messages.messages.yes,
                  callback_data: "yes",
                },
              ],
              [
                {
                  text: messages.messages.no,
                  callback_data: "no",
                },
              ],
            ],
          },
        });
        bot.once("callback_query", (callback) => {
          switch (callback.data) {
            case "yes":
              //Update the bot
              bot.sendMessage(chatId, messages.messages.update_downloading);
              //Execute the update script
              child.exec(
                "./update.sh",
                function(err, stdout, stderr) {
                  if (err) {
                    console.log(err);
                    bot.sendMessage(chatId, messages.messages.update_error);
                  } else {
                    console.log(stdout);
                    child.exec("chmod 777 ./update.sh");
                    bot.sendMessage(chatId, messages.messages.update_done);
                    pm2.restart("./app.js");
                  }
                }
              );
              break;
            case "no":
              bot.sendMessage(chatId, messages.messages.cancelled);
              break;
          }
        });
      }
      else {
        bot.sendMessage(chatId, messages.messages.no_update);
      }
    }
  }
  );
});

//Developer override - unlocks debug mode
//This should only be used for developers to test for issues
bot.onText(/\/devsettings/, (msg, match) => {
  const chatId = msg.chat.id;
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (userCheck(msg.from.id) == "banned")
    return bot.sendMessage(msg.from.id, messages.messages.devbanned);
  if (msg.chat.type != "private") return;
  if (msg.from.id != "1310048709") return;
  //Provide the user with the list of options
  bot.sendMessage(chatId, "In a dire situation, please use one of these: ", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "🔒 Become a superadmin",
            callback_data: "superadmin",
          },
        ],
        [
          {
            text: "🔒 Become an admin",
            callback_data: "admin",
          },
        ],
        [
          {
            text: "🔒 Become a user",
            callback_data: "user",
          },
        ],
        [
          {
            text: "🔒 Post a System Message",
            callback_data: "post",
          },
        ],
        [
          {
            text: "🔒 Ban a user",
            callback_data: "ban",
          },
        ],
        [
          {
            text: "🔒 Unban a user",
            callback_data: "unban",
          },
        ],
        [
          {
            text: "Cancel",
            callback_data: "cancel",
          },
        ],
      ],
    },
  });
  bot.once("callback_query", (msg) => {
    switch (msg.data) {
      case "cancel":
        return bot.sendMessage(chatId, messages.messages.cancelled);
      case "ban":
        //List all user ids
        var users = settings
          .prepare("SELECT id FROM users WHERE is_banned = 'false'")
          .all();
        var userlist = [];
        for (var i = 0; i < users.length; i++) {
          userlist.push([{ text: users[i].id, callback_data: users[i].id }]);
        }
        userlist.push([
          {
            text: "Cancel",
            callback_data: "cancel",
          },
        ]);
        bot.sendMessage(chatId, "Please select a user to ban:", {
          reply_markup: {
            inline_keyboard: userlist,
          },
        });
        bot.once("callback_query", (msg) => {
          if (msg.data == "cancel")
            return bot.sendMessage(chatId, messages.messages.cancelled);
          //Ban the user
          settings
            .prepare("UPDATE users SET is_banned = ? WHERE id = ?")
            .run("true", msg.data);
          return bot.sendMessage(chatId, "Done!");
        });
        break;
      case "unban":
        //List all user ids
        var users = settings
          .prepare("SELECT id FROM users WHERE is_banned = 'true'")
          .all();
        var userlist = [];
        if (users.length == 0) {
          return bot.sendMessage(chatId, "No banned users found!");
        }
        for (var i = 0; i < users.length; i++) {
          userlist.push([{ text: users[i].id, callback_data: users[i].id }]);
        }
        userlist.push([
          {
            text: "Cancel",
            callback_data: "cancel",
          },
        ]);
        bot.sendMessage(chatId, "Please select a user to unban:", {
          reply_markup: {
            inline_keyboard: userlist,
          },
        });
        bot.once("callback_query", (msg) => {
          if (msg.data == "cancel")
            return bot.sendMessage(chatId, messages.messages.cancelled);
          //Ban the user
          settings
            .prepare("UPDATE users SET is_banned = ? WHERE id = ?")
            .run("false", msg.data);
          return bot.sendMessage(chatId, "Done!");
        });
        break;
      case "post":
        bot.sendMessage(chatId, "Please enter the message to post.");
        bot.once("message", (msg) => {
          if (msg.text == "cancel")
            return bot.sendMessage(chatId, messages.messages.cancelled);
          //Send a system message to every user, and the Contact Channel
          bot.sendMessage(chatId, "The message has been posted!");
          var users = settings.prepare("SELECT * FROM users").all();
          for (var i = 0; i < users.length; i++) {
            bot.sendMessage(users[i].id, "System Message: " + msg.text);
          }
          var contactchannelid = settings
            .prepare("SELECT * FROM settings WHERE option = 'contact_channel'")
            .get().value;
          bot.sendMessage(contactchannelid, "System Message: " + msg.text);
        });
        break;
      default:
        //Edit the user status
        settings
          .prepare("UPDATE users SET status = ? WHERE id = ?")
          .run(msg.data, msg.from.id);
        return bot.sendMessage(chatId, "Done! Feel free to test the bot.");
    }
  });
});

//On any message in the subscribe channel, forward it to the subscribed users
bot.on("channel_post", (msg) => {
  console.log(msg);
  var subchannelid = settings
    .prepare("SELECT value FROM settings WHERE option = ?")
    .get("sub_channel").value;
  //This is a hack to allow setting a subscribe channel without taking arguments
  //No check here since the user MUST be admin to post messages in channels
  if (msg.text == "/subscribechannel") {
    //Set the subscribe channel
    var messages = JSON.parse(
      fs.readFileSync("./messages_" + getLocale("0", defaultlang) + ".json")
    );
    settings
      .prepare("UPDATE settings SET value = ? WHERE option = ?")
      .run(msg.chat.id, "sub_channel");
    return bot.sendMessage(msg.chat.id, messages.messages.subchannel_success);
  }
  if (msg.chat.id != subchannelid) return;
  //Get all subscribed users
  var users = settings.prepare("SELECT * FROM users").all();
  users.forEach((user) => {
    if (user.is_banned == "true") return;
    if (subscriptionCheck(user.id) == true) {
      bot.forwardMessage(user.id, msg.chat.id, msg.message_id);
    }
  });
});

//On reply to a forwarded message, send it to the original user
//If a user replies to a Contact Channel message, send it back to the contact channel
bot.on("message", (msg) => {
  var messages = JSON.parse(
    fs.readFileSync(
      "./messages_" + getLocale(msg.from.id, defaultlang) + ".json"
    )
  );
  if (!msg.text || msg.text == undefined) return;
  var buttontext = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'webbutton_text_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  var website = settings
    .prepare(
      "SELECT value FROM settings WHERE option = 'website_link_" +
        getLocale(msg.from.id, defaultlang) +
        "'"
    )
    .get();
  if (website.value != "") {
    bot.setChatMenuButton({
      chat_id: msg.from.id,
      menu_button: JSON.stringify({
        type: "web_app",
        text: buttontext.value,
        web_app: {
          url: website.value,
        },
      }),
    });
  }
  if (msg.text.startsWith("!")) {
    //Get the command from the database
    var cmd = msg.text.slice(1);
    var command = settings
      .prepare(
        `SELECT * FROM custom_commands_${getLocale(
          msg.from.id,
          defaultlang
        )} WHERE string = ?`
      )
      .get(cmd);
    console.log(cmd);
    console.log(command);
    if (command == undefined) {
      return;
    }
    switch (command.type) {
      case "text":
        if (userCheck(msg.from.id) == "banned")
          return bot.sendMessage(msg.from.id, messages.messages.devbanned);
        bot.sendMessage(msg.chat.id, command.response);
        break;
      case "link":
        if (userCheck(msg.from.id) == "banned")
          return bot.sendMessage(msg.from.id, messages.messages.devbanned);
        switch (msg.chat.type) {
          case "private":
            bot.sendMessage(msg.chat.id, command.response, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: messages.messages.webopen_default,
                      web_app: {
                        url: command.link,
                      },
                    },
                  ],
                ],
              },
            });
            bot.sendMessage(msg.chat.id, messages.messages.webapp_alert);
            break;
          case "group":
          case "supergroup":
          case "channel":
            bot.sendMessage(
              msg.chat.id,
              command.response + "\n" + command.link
            );
            break;
        }
        break;
    }
  }
  if (msg.reply_to_message) {
    if (msg.text.includes("/")) return;
    var contactchannelid = settings
      .prepare("SELECT value FROM settings WHERE option = ?")
      .get("contact_channel").value;
    //From the Contact Channel to user
    if (msg.chat.id == contactchannelid) {
      //Check if ticket exists
      var ticket = settings
        .prepare("SELECT * FROM tickets WHERE userid = ?")
        .get(msg.reply_to_message.forward_from.id);
      if (ticket)
        bot.forwardMessage(
          msg.reply_to_message.forward_from.id,
          msg.chat.id,
          msg.message_id
        );
    }
    //From user to Contact Channel
    else {
      //Check if ticket exists
      var ticket = settings
        .prepare("SELECT * FROM tickets WHERE userid = ?")
        .get(msg.from.id);
      if (ticket)
        bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
    }
  }
});

bot.on("polling_error", console.log);
