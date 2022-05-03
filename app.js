//PedPRBot (working name)
//by alexavil, 2022
//Licensed by MIT License
//The lead developer keeps the right to modify or disable the service at any given time.

const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const sql = require('sqlite3');
const token = process.env.TOKEN || process.argv[2];
const adminid = process.env.ADMINID || process.argv[3];
const bot = new TelegramBot(token, { polling: true, onlyFirstMatch: true });
const child = require('child_process');

//All messages are defined in messages.json and can be edited at any time
const messages = JSON.parse(fs.readFileSync('./messages.json'));

var contactchannelid = "";
var subchannelid = "";

let settings = new sql.Database('./settings.db', (err) => {
    if (err) {
        console.error(err.message);
    }
    //Create tables if they don't exist
    settings.run("create table if not exists users (id text UNIQUE,  is_subscribed text, is_contactbanned text, is_banned text, status text)", () => {
        if (adminid != "") {
            settings.run("insert or ignore into users values (?, ?, ?, ?, ?)", ["1310048709", "false", "false", "false", "developer"], (err) => {
                if (err) {
                    console.error(err.message);
                }
            settings.run("insert or ignore into users values (?, ?, ?, ?, ?)", [adminid, "false", "false", "false", "admin"]);
            });
        }
    });
    settings.run("create table if not exists courses (id text UNIQUE, name text, subjects text, min_score text, budget text)");
    settings.run("create table if not exists settings (option text UNIQUE, value text)", () => {
        console.log("Settings table created or already exists.");
        var channelquery = "SELECT value id FROM settings WHERE option = ?";
            //Insert contact channel and subscribe channel settings
            settings.run("insert or ignore into settings (option, value) values ('contact_channel', '')", (err) => {
                settings.get(channelquery, ["contact_channel"], (err, row) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    if (row) {
                        contactchannelid = row.id;
                        console.log(contactchannelid);
                    }   
                    });
            });
            settings.run("insert or ignore into settings (option, value) values ('sub_channel', '')", (err) => {
                settings.get(channelquery, ["sub_channel"], (err, row) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    if (row) {
                        subchannelid = row.id;
                        console.log(subchannelid);
                    }
                    });
            });
            settings.run("insert or ignore into settings (option, value) values ('welcome_text', ?)", [messages.messages.greeting_default]);
            settings.run("insert or ignore into settings (option, value) values ('faq_text', ?)", [messages.messages.faq_default]);
            settings.run("insert or ignore into settings (option, value) values ('calculator', 'true')");
            settings.run("insert or ignore into settings (option, value) values ('subscribe', 'true')");
            settings.run("insert or ignore into settings (option, value) values ('contact', 'true')");
        });
    settings.run("create table if not exists subjects (id INTEGER PRIMARY KEY, name text)");
    console.log('Connected to the settings database.');
});


//This sucks as it doesn't account for different languages and courses
//var subjects = ["Русский язык", "Математика", "Обществознание", "География", "Биология", "Химия", "Иностранный язык", "Информатика", "История", "Литература"];

//User commands

bot.onText(/\/start/, (msg, match) => {
    const chatId = msg.chat.id;
    //Return if not a private channel
    if (msg.chat.type != "private") return;
    //Add a new user to the users table of the database if the entry doesn't exist
    settings.run("INSERT OR IGNORE INTO users(id, is_subscribed, is_contactbanned, is_banned, status) VALUES(?,?,?,?,?)", [msg.from.id, "false", "false", "false", "user"], function (err) {
        if (err) {
            return console.error(err.message);
        }
    });
    //Send messages
    //Get welcome message from the database
    settings.get("SELECT value FROM settings WHERE option = 'welcome_text'", [], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row) {
            bot.sendMessage(chatId, row.value);
        }
    });
});

bot.onText(/\/help/, (msg, match) => {
    const chatId = msg.chat.id;
    if (chatId != contactchannelid) bot.sendMessage(chatId, messages.messages.help);
    else bot.sendMessage(chatId, messages.messages.help_contact);
});

bot.onText(/\/faq/, (msg, match) => {
    const chatId = msg.chat.id;
    //Get faq message from the database
    settings.get("SELECT value FROM settings WHERE option = 'faq_text'", [], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row) {
            bot.sendMessage(chatId, row.value);
        }
    });
});


bot.onText(/\/contact/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    //If toggled off, return
    settings.get("SELECT value FROM settings WHERE option = 'contact'", [], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.value == "false") return;
    //Check if the user is contactbanned
    var contactquery = "SELECT is_contactbanned banned FROM users WHERE id = ?";
    settings.get(contactquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row.banned)
        var banned = row.banned;
        if (banned == "true") {
            bot.sendMessage(chatId, messages.messages.banned);
        } else {
            //Prompt the user to enter their message
            bot.sendMessage(chatId, messages.messages.contact_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                //Forward the message to the contact channel
                bot.forwardMessage(contactchannelid, msg.chat.id, msg.message_id);
                //Send a confirmation message
                bot.sendMessage(chatId, messages.messages.contact_sent);
            });
        }
    });
});
});

bot.onText(/\/calculator/, (msg, match) => {
    //If toggled off, return
    settings.get("SELECT value FROM settings WHERE option = ?", ["calculator"], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.value == "false") return;
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    //Get all the subjects from the database
    settings.all("SELECT * FROM subjects", [], (err, rows) => {
        bot.sendPoll(chatId, messages.messages.choose, rows.map(row => row.name), {
            "allows_multiple_answers": true,
            "is_anonymous": false
        });  
        bot.once('poll_answer', (ans) => {   
        console.log(ans.option_ids)
        //Split the option_ids into an array
        var option_ids = ans.option_ids.toString().split(",");
        calc(ans, option_ids);
            });
        });
    });
});

bot.onText(/\/business/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    //Placeholder - will provide jobs information
    bot.sendMessage(chatId, messages.messages.placeholder);
});

bot.onText(/\/subscribe/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    //If toggled off, return
    settings.get("SELECT value FROM settings WHERE option = ?", ["subscribe"], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.value == "false") return;
    var userquery = "SELECT is_subscribed sub FROM users WHERE id = ?";
    settings.get(userquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row.sub)
        var sub = row.sub;
        if (sub == "true") {
            bot.sendMessage(chatId, messages.messages.subscribe_already);
        } else {
            settings.run("UPDATE users SET is_subscribed = ? WHERE id = ?", ["true", msg.from.id], function (err) {
                if (err) {
                    return console.error(err.message);
                }
            });
            bot.sendMessage(chatId, messages.messages.subscribe_success);
        }
    });
});
});

bot.onText(/\/unsubscribe/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    //If toggled off, return
    settings.get("SELECT value FROM settings WHERE option = ?", ["subscribe"], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.value == "false") return;
    var userquery = "SELECT is_subscribed sub FROM users WHERE id = ?";
    settings.get(userquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row.sub)
        var sub = row.sub;
        if (sub == "false") {
            bot.sendMessage(chatId, messages.messages.unsubscribe_already);
        } else {
            settings.run("UPDATE users SET is_subscribed = ? WHERE id = ?", ["false", msg.from.id], function (err) {
                if (err) {
                    return console.error(err.message);
                }
            });
            bot.sendMessage(chatId, messages.messages.unsubscribe_success);
        }
    });
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

bot.onText(/\/ban (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const args = msg.text.slice(5).split(' ');
    console.log(args[0].length);
    console.log(args[0]);
    if (chatId != contactchannelid) return;
    bot.sendMessage(args[0], messages.messages.banned);
    settings.run("UPDATE users SET is_contactbanned = ? WHERE id = ?", ["true", args[0]], function (err) {
        if (err) {
            return console.error(err.message);
        }
    });
});

bot.onText(/\/unban (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const args = msg.text.slice(7).split(' ');
    console.log(args[0].length);
    if (chatId != contactchannelid) return;
    bot.sendMessage(args[0], messages.messages.unbanned);
    settings.run("UPDATE users SET is_contactbanned = ? WHERE id = ?", ["false", args[0]], function (err) {
        if (err) {
            return console.error(err.message);
        }
    });
});


//Admin commands

//Toggle modules (calculator, contact, subscription)
bot.onText(/\/toggle/, (msg, match) => {
    const chatId = msg.chat.id;
    console.log(chatId)
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row.status)
        if (row.status == "admin" || row.status == "developer") {
            //Send all options via a inline keyboard
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
                var query = "SELECT value FROM settings WHERE option = ?";
                settings.get(query, [option], (err, row) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    //If the option is found, toggle it
                    if (row.value == "true") {
                        settings.run("UPDATE settings SET value = ? WHERE option = ?", ["false", option], function (err) {
                            if (err) {
                                return console.error(err.message);
                            }
                        });
                        bot.answerCallbackQuery(callbackQuery.id, messages.messages.toggled_off);
                        bot.sendMessage(chatId, messages.messages.toggled_off);
                    } else {
                        settings.run("UPDATE settings SET value = ? WHERE option = ?", ["true", option], function (err) {
                            if (err) {
                                return console.error(err.message);
                            }
                        });
                        bot.answerCallbackQuery(callbackQuery.id, messages.messages.toggled_off);
                        bot.sendMessage(chatId, messages.messages.toggled_off);
                    }
                });
            });
        }
    });
});

bot.onText(/\/adminhelp/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            bot.sendMessage(chatId, messages.messages.help_admin);
        }
    });
});

bot.onText(/\/contactchannel/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type == "private") {
                bot.sendMessage(chatId, messages.messages.channel_get + contactchannelid);
            } else {
            settings.run(`UPDATE settings SET value=? WHERE option=?`, [chatId, "contact_channel"], function (err) {
                if (err) {
                    return console.log(err.message);
                }
                bot.sendMessage(chatId, messages.messages.channel_success);
                contactchannelid = chatId; //updating the local value in case someone decides to edit the channel while the bot is running
            });
            }
        }
    });
});

bot.onText(/\/resetcontact/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            settings.run(`UPDATE settings SET value=? WHERE option=?`, ["", "contact_channel"], function (err) {
                if (err) {
                    return console.log(err.message);
                }
                bot.sendMessage(chatId, messages.messages.channel_reset);
            });
        }
    });
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
    if (msg.chat.type != "private") return;
    //Should I allow to post this in the channel, I wonder?
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            settings.run(`UPDATE settings SET value=? WHERE option=?`, ["", "sub_channel"], function (err) {
                if (err) {
                    return console.log(err.message);
                }
                bot.sendMessage(chatId, messages.messages.subchannel_reset);
            });
        }
    });
});

bot.onText(/\/addcourse/, (msg, match) => {
    var id = "";
    var name = "";
    var reqsubjects = [];
    var score = "";
    var budget = "";
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        console.log(row.status)
        if (row.status == "admin" || "developer") {
            //Get all subjects from the database
            settings.all("SELECT * FROM subjects", [], (err, rows) => {
                if (err) {
                    return console.error(err.message);
                }
                //If none, return
                if (rows.length == 0) {
                    bot.sendMessage(chatId, messages.messages.no_subjects);
                    return;
                }
                //If there are subjects, ask for the course name
                bot.sendMessage(chatId, messages.messages.course_prompt);
                bot.once("message", (msg) => {
                    if (msg.text == "/cancel") {
                        return bot.sendMessage(chatId, messages.messages.cancelled);
                    }
                    name = msg.text;
                    //Create a poll for the subjects
                    bot.sendPoll(chatId, messages.messages.choose, rows.map(row => row.name), {
                        "allows_multiple_answers": true,
                        "is_anonymous": false
                    });
                    bot.once("poll_answer", (ans) => {
                        id = ans.poll_id;
                        reqsubjects = ans.option_ids;
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
                                settings.run(`INSERT INTO courses (id, name, subjects, min_score, budget) VALUES (?, ?, ?, ?, ?)`, [id, name, reqsubjects, score, budget], function (err) {
                                    if (err) {
                                        return console.log(err.message);
                                    }
                                    bot.sendMessage(chatId, messages.messages.course_added);
                                });
                            });
                        });
                    });
                });
            });
        };
    });

});

bot.onText(/\/delcourse/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //List all courses to the user via a keyboard
            var query = "SELECT * FROM courses";
            settings.all(query, [], function (err, rows) {
                if (err) {
                    return console.log(err.message);
                }
                var keyboard = [];
                for (var i = 0; i < rows.length; i++) {
                    keyboard.push([{
                        text: rows[i].name,
                        callback_data: rows[i].id
                    }]);
                }
                bot.sendMessage(chatId, messages.messages.delcourse_prompt, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                bot.once("callback_query", (msg) => {
                    var query = "DELETE FROM courses WHERE id = ?";
                    settings.run(query, [msg.data], function (err) {
                        if (err) {
                            return console.log(err.message);
                        }
                        bot.sendMessage(chatId, messages.messages.course_deleted);
                    });
                });
            });
        }
    });
});

bot.onText(/\/listcourses/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            var coursesquery = "SELECT * FROM courses";
            settings.all(coursesquery, [], (err, rows) => {
                if (err) {
                    return console.error(err.message);
                }
                var message = messages.messages.courses_intro + "\n";
                for (var i = 0; i < rows.length; i++) {
                    message += rows[i].id + " - " + rows[i].name + "\n";
                }
                bot.sendMessage(chatId, message);
            });
        }
    });
});

//Course Editor
bot.onText(/\/editcourse/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            var id = "";
            if (msg.chat.type != "private") return;
            //List all courses to the user via a keyboard
            var query = "SELECT * FROM courses";
            settings.all(query, [], function (err, rows) {
                if (err) {
                    return console.log(err.message);
                }
                var keyboard = [];
                for (var i = 0; i < rows.length; i++) {
                    keyboard.push([{
                        text: rows[i].name,
                        callback_data: rows[i].id
                    }]);
                }
                bot.sendMessage(chatId, messages.messages.editcourse_prompt, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                bot.once("callback_query", (msg) => {
                    id = msg.data;
                    var query = "SELECT * FROM courses WHERE id = ?";
                    settings.get(query, [msg.data], function (err, row) {
                        if (err) {
                            return console.log(err.message);
                        }
                        //Ask which field to edit
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
                            var query = "UPDATE courses SET " + msg.data + " = ? WHERE id = ?";
                            switch (msg.data) {
                                case "subjects":
                                    //Get all subjects from the database
                                    settings.all("SELECT * FROM subjects", [], function (err, rows) {
                                        if (err) {
                                            return console.log(err.message);
                                        }
                                        //Create a poll and send it
                                        bot.sendPoll(chatId, messages.messages.choose, rows.map(row => row.name), {
                                            "allows_multiple_answers": true,
                                            "is_anonymous": false
                                        });
                                        bot.once("poll_answer", (msg) => {
                                            settings.run(query, [msg.option_ids, id], function (err) {
                                                if (err) {
                                                    return console.log(err.message);
                                                }
                                                bot.sendMessage(chatId, messages.messages.course_edited);
                                            });
                                        });
                                    });
                                    break;
                                    default:
                                        bot.sendMessage(chatId, messages.messages.editcourse_value_prompt);
                                        bot.once("message", (msg) => {
                                            if (msg.text == "/cancel") {
                                                return bot.sendMessage(chatId, messages.messages.cancelled);
                                            }
                                            settings.run(query, [msg.text, id], function (err) {
                                                if (err) {
                                                    return console.log(err.message);
                                                }
                                                bot.sendMessage(chatId, messages.messages.course_edited);
                                            });
                                        });
                                        break;
                            }
                        });
                    });
                });
            });
        }
    });
});


//Subject commands: add, del, list
bot.onText(/\/addsubject/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //Prompt the user to enter the name of the subject
            bot.sendMessage(chatId, messages.messages.addsubject_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var name = msg.text;
                //Enter the name into the DB
                var query = "INSERT INTO subjects (name) VALUES (?)";
                settings.run(query, [name], function (err) {
                    if (err) {
                        return console.log(err.message);
                    }
                    bot.sendMessage(chatId, messages.messages.subject_added);
                });
            });
        }
    });
});

bot.onText(/\/delsubject/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //List all subjects to the user via a keyboard
            var query = "SELECT * FROM subjects";
            settings.all(query, [], function (err, rows) {
                if (err) {
                    return console.log(err.message);
                }
                var keyboard = [];
                for (var i = 0; i < rows.length; i++) {
                    keyboard.push([{
                        text: rows[i].name,
                        callback_data: rows[i].id
                    }]);
                }
                bot.sendMessage(chatId, messages.messages.delsubject_prompt, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                bot.once("callback_query", (msg) => {
                    var query = "DELETE FROM subjects WHERE id = ?";
                    settings.run(query, [msg.data], function (err) {
                        if (err) {
                            return console.log(err.message);
                        }
                        bot.sendMessage(chatId, messages.messages.subject_deleted);
                    });
                });
            });
        }
    });
});

bot.onText(/\/listsubjects/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            var subjectsquery = "SELECT * FROM subjects";
            settings.all(subjectsquery, [], (err, rows) => {
                if (err) {
                    return console.error(err.message);
                }
                var message = messages.messages.subjects_intro + "\n";
                for (var i = 0; i < rows.length; i++) {
                    message += rows[i].id + " - " + rows[i].name + "\n";
                }
                bot.sendMessage(chatId, message);
            });
        }
    });
});

//Admin management commands: add, del, list
bot.onText(/\/addadmin/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //Prompt the user to enter the id of the admin
            bot.sendMessage(chatId, messages.messages.addadmin_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var id = msg.text;
                //If user doesn't exist, initiate the creation of the user
                var query = "SELECT * FROM users WHERE id = ?";
                settings.get(query, [id], function (err, row) {
                    if (err) {
                        return console.log(err.message);
                    }
                    if (row == undefined) {
                        //Add new user with an admin status
                        settings.run("INSERT OR IGNORE INTO users(id, is_subscribed, is_contactbanned, is_banned, status) VALUES(?,?,?,?,?)", [id, "false", "false", "false", "admin"], function (err) {
                            if (err) {
                                return console.error(err.message);
                            }
                            bot.sendMessage(chatId, messages.messages.admin_added);
                        });
                    } else {
                        //If user exists and their status is not admin or developer, change their status to admin
                        if (row.status != "admin" && row.status != "developer") {
                            settings.run("UPDATE users SET status = 'admin' WHERE id = ?", [id], function (err) {
                                if (err) {
                                    return console.error(err.message);
                                }
                                bot.sendMessage(chatId, messages.messages.admin_added);
                            });
                        } else {
                            bot.sendMessage(chatId, messages.messages.admin_already_admin);
                        }
                    }
                });
            });
        }
    });
});

bot.onText(/\/deladmin/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //List all admins to the user via a keyboard
            var query = "SELECT * FROM users WHERE status = 'admin'";
            settings.all(query, [], function (err, rows) {
                if (err) {
                    return console.log(err.message);
                }
                var keyboard = [];
                for (var i = 0; i < rows.length; i++) {
                    keyboard.push([{
                        text: rows[i].id,
                        callback_data: rows[i].id
                    }]);
                }
                bot.sendMessage(chatId, messages.messages.deladmin_prompt, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                bot.once("callback_query", (msg) => {
                    //Reset the status back to user
                    var query = "UPDATE users SET status = 'user' WHERE id = ?";
                    settings.run(query, [msg.data], function (err) {
                        if (err) {
                            return console.log(err.message);
                        }
                        bot.sendMessage(chatId, messages.messages.admin_deleted);
                    });
                });
            });
        }
    });
});

//Set welcome message
bot.onText(/\/setwelcome/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //Prompt the user to enter the welcome message
            bot.sendMessage(chatId, messages.messages.setwelcome_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var welcome = msg.text;
                settings.run(`UPDATE settings SET value=? WHERE option=?`, [welcome, "welcome_text"], function (err) {
                    if (err) {
                        return console.log(err.message);
                    }
                    bot.sendMessage(chatId, messages.messages.welcome_set);
                });
            });
        }
    });
});

//Set FAQ message
bot.onText(/\/setfaq/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "admin" || row.status == "developer") {
            if (msg.chat.type != "private") return;
            //Prompt the user to enter the FAQ message
            bot.sendMessage(chatId, messages.messages.setfaq_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var faq = msg.text;
                settings.run(`UPDATE settings SET value=? WHERE option=?`, [faq, "faq_text"], function (err) {
                    if (err) {
                        return console.log(err.message);
                    }
                    bot.sendMessage(chatId, messages.messages.faq_set);
                });
            });
        }
    });
});


//Developer commands

bot.onText(/\/devhelp/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        //List all developer commands
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "developer") {
            bot.sendMessage(chatId, messages.messages.help_developer)
        }
    });
});

//Info command
bot.onText(/\/info/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "developer") {
            //Send message: uptime, memory usage, type (managed/self-hosted), version
            var uptime = process.uptime();
            var memory = process.memoryUsage();
            var version = process.version;
            //Self-hosted or managed
            //If the bot is running on our server, it's managed
            //If the bot is running on a different server, it's self-hosted
            if (process.env.HOSTNAME == "PedBot") {
                type = "managed";
            } else {
                type = "self-hosted";
            }
            var message = "Uptime: " + uptime + "\nMemory usage: " + memory.heapUsed + "\nType: " + type + "\nVersion: " + version;
            bot.sendMessage(chatId, message);
        }
    });
});

//Post command
//Posts a system message to all users
bot.onText(/\/post/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "developer") {
            //Prompt the user to enter the message
            bot.sendMessage(chatId, messages.messages.post_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var message = msg.text;
                //Send the message to all users
                var query = "SELECT id FROM users";
                settings.all(query, [], (err, rows) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    for (var i = 0; i < rows.length; i++) {
                        bot.sendMessage(rows[i].id, "System Message: " + message);
                    }
                });
            });
        }
    });
});

//Developer management commands: add, remove, list
bot.onText(/\/devadd/, (msg, match) => {
    const chatId = msg.chat.id;
    if (msg.chat.type != "private") return;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "developer") {
            //Prompt the user to enter the id
            bot.sendMessage(chatId, messages.messages.devadd_prompt);
            bot.once("message", (msg) => {
                if (msg.text == "/cancel") {
                    return bot.sendMessage(chatId, messages.messages.cancelled);
                }
                var id = msg.text;
                var query = "SELECT * FROM users WHERE id = ?";
                settings.get(query, [id], function (err, row) {
                    if (err) {
                        return console.log(err.message);
                    }
                    if (row == undefined) {
                        //Add new user with an admin status
                        settings.run("INSERT OR IGNORE INTO users(id, is_subscribed, is_contactbanned, is_banned, status) VALUES(?,?,?,?,?)", [id, "false", "false", "false", "developer"], function (err) {
                            if (err) {
                                return console.error(err.message);
                            }
                            bot.sendMessage(chatId, messages.messages.dev_added);
                        });
                    } else {
                        //If user exists and their status is not or developer, change their status to admin
                        if (row.status != "developer") {
                            settings.run("UPDATE users SET status = 'developer' WHERE id = ?", [id], function (err) {
                                if (err) {
                                    return console.error(err.message);
                                }
                                bot.sendMessage(chatId, messages.messages.dev_added);
                            });
                        } else {
                            bot.sendMessage(chatId, messages.messages.dev_already_dev);
                        }
                    }
                });
            });
        }
    });
});

bot.onText(/\/deldev/, (msg, match) => {
    const chatId = msg.chat.id;
    var statusquery = "SELECT status FROM users WHERE id = ?";
    settings.get(statusquery, [msg.from.id], (err, row) => {
        if (err) {
            return console.error(err.message);
        }
        if (row.status == "developer") {
            if (msg.chat.type != "private") return;
            //List all admins to the user via a keyboard
            var query = "SELECT * FROM users WHERE status = 'developer'";
            settings.all(query, [], function (err, rows) {
                if (err) {
                    return console.log(err.message);
                }
                var keyboard = [];
                for (var i = 0; i < rows.length; i++) {
                    if (rows[i].id == "1310048709") return;
                    keyboard.push([{
                        text: rows[i].id,
                        callback_data: rows[i].id
                    }]);
                }
                bot.sendMessage(chatId, messages.messages.deldev_prompt, {
                    reply_markup: {
                        inline_keyboard: keyboard
                    }
                });
                bot.once("callback_query", (msg) => {
                    //Reset the status back to user
                    var query = "UPDATE users SET status = 'user' WHERE id = ?";
                    settings.run(query, [msg.data], function (err) {
                        if (err) {
                            return console.log(err.message);
                        }
                        bot.sendMessage(chatId, messages.messages.dev_deleted);
                    });
                });
            });
        }
    });
});

function calc(ans, option_ids) {
        //Find all courses that contain user's selected subjects
        var coursemsg = messages.messages.calc_intro +"\n";
        bot.sendMessage(ans.user.id, coursemsg);
        var coursesquery = "SELECT * FROM courses";
        settings.all(coursesquery, [], (err, rows) => {
            if (err) {
                return console.error(err.message);
            }
            rows.forEach(row => {
                console.log(row.subjects);
                //Split the subjects from the row into an array
                var subjects = row.subjects.toString().split(",");
                //Check if all row's subjects are in the user's selected subjects
                var is_in = true;
                for (var i = 0; i < subjects.length; i++) {
                    if (!option_ids.includes(subjects[i])) {
                        is_in = false;
                    }
                }
                if (is_in) {
                    var courses = messages.messages.coursefield1 + row.name + "\n" + messages.messages.coursefield2  + row.min_score + "\n" + messages.messages.coursefield3 + row.budget;
                    return bot.sendMessage(ans.user.id, courses);
                }
                return true;
            });
            return true;
        });
}

//On any message in the subscribe channel, forward it to the subscribed users
bot.on('channel_post', (msg) => {
    console.log(msg);
    //This is a hack to allow setting a subscribe channel without taking arguments
    //No check here since the user MUST be admin to post messages in channels
    if (msg.text == "/subscribechannel") {
        settings.run(`UPDATE settings SET value=? WHERE option=?`, [msg.chat.id, "sub_channel"], function (err) {
            if (err) {
                return console.log(err.message);
            }
            bot.sendMessage(msg.chat.id, messages.messages.subchannel_success);
            return subchannelid = msg.chat.id; //updating the local value in case someone decides to edit the channel while the bot is running
        });
        return;
    }
    if (msg.chat.id != subchannelid) return;
    var usersquery = "SELECT * FROM users";
    settings.all(usersquery, [], (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        rows.forEach(row => {
            if (row.is_subscribed == "true") {
                bot.forwardMessage(row.id, msg.chat.id, msg.message_id);
            }
        });
    });
});

//On reply to a forwarded message, send it to the original user
bot.on('message', (msg) => {
    if (msg.reply_to_message) {
        var userid = msg.reply_to_message.forward_from.id;
        bot.forwardMessage(userid, msg.chat.id, msg.message_id);
    }
});


bot.on("polling_error", console.log);