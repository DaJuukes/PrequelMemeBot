const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/servers.sqlite');
const fs = require('fs');
const unirest = require('unirest');
const quotes = require('./data/quotes.json');
const Discord = require('discord.js');
if (process.argv[2] && process.argv[2] === '--travis') var config = require('./data/config-example.json');
else config = require('./data/config.json');

module.exports = bot => {
    /**
     * Server Related Functions
     */

    bot.fetchGuildSize = function() {
        return new Promise(
            resolve => {
                if (bot.shard) {
                    bot.shard.fetchClientValues('guilds.size').then(g => {
                        resolve(g.reduce((prev, val) => prev + val, 0));
                    }).catch(console.error);
                } else {
                    resolve(bot.guilds.size);
                }
            }
        );
    };

    bot.sendServerCount = function() {
        if (bot.config.sendServerCounts) {
            var guilds;
            if (bot.shard) {
                bot.shard.fetchClientValues('guilds.size').then(g => {
                    guilds = g.reduce((prev, val) => prev + val, 0);
                }).catch(console.error);
            } else {
                guilds = bot.guilds.size;
            }

            unirest.post('https://bots.discord.pw/api/bots/' + bot.user.id + '/stats')
                .headers({
                    Authorization: bot.config.dbotspw,
                    'Content-Type': 'application/json',
                })
                .send({
                    server_count: guilds,
                })
                .end(response => {
                    bot.log(response.body);
                });

            unirest.post('https://discordbots.org/api/bots/' + bot.user.id + '/stats')
                .headers({
                    Authorization: bot.config.dbotsorg,
                    'Content-Type': 'application/json',
                })
                .send({
                    server_count: guilds,
                })
                .end(response => {
                    bot.log(response.body);
                });

            bot.log('All server counts posted successfully!');
        }
    };

    bot.syncServers = function() {
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS servers (
					id VARCHAR(25) PRIMARY KEY,
					prefix VARCHAR(10),
					announcementChannel VARCHAR(25)
					)`);
            bot.guilds.forEach(guild => {
                try {
                    // console.log(`Inserting ${guild.name} into the database.`);
                    if (guild.channels.array() && guild.channels.array()[0]) {
                        db.run(`INSERT OR IGNORE INTO servers VALUES (
								"${guild.id}",
								"${config.prefix}",
								"${guild.channels.array()[0].id}")`);
                    } else {
                        db.run(`INSERT OR IGNORE INTO "servers" VALUES (
                            "${guild.id}",
                            "${config.prefix}",
                            "none")`);
                    }
                } catch (err) {
                    console.log(err.stack);
                }
            });
        });
        bot.log('Servers synced.');
        return "completed";
    };

    bot.removeServer = function(guild) {
        db.run(`DELETE FROM servers WHERE id = ${guild.id}`);
        bot.log(guild.name + ' successfully removed from the database!');
    };

    bot.addServer = function(guild) {
        db.run(`INSERT OR IGNORE INTO servers VALUES (
				"${guild.id}",
				"${bot.config.prefix}",
				"${guild.channels.array()[0].id}")`);
        bot.log(guild.name + ' successfully inserted into the database!');
    };

    bot.checkForUpvote = function(msg) {
        return new Promise(resolve => {
            unirest.get(`https://discordbots.org/api/bots/${bot.user.id}/votes`)
                .headers({
                    Authorization: bot.config.dbotsorg,
                })
                .end(result => {
                    console.log(result.body);
                    var voters = result.body;
                    for (var i = 0; i < voters.length; i++) {
                        if (voters[i].id === msg.author.id) { resolve(true); }
                    }
                    if (msg.author.id === bot.config.owner) resolve(true);
                    if (msg.guild.members.get(bot.config.owner) && msg.guild.members.get(bot.config.owner).hasPermission('MANAGE_MESSAGES')) resolve(true);
                    resolve(false);
                    // Set to false on Stable
                });
        });
    };

    bot.promptForUpvote = function(msg, command) {
        msg.channel.send(`To use the **${command}** command, please go upvote me on discordbots.org! ` +
            `You can do so by visiting the link below, signing in, and clicking upvote! ` +
            `If you have already upvoted, give the bot a few minutes to update its list of voters.\n` +
            `https://discordbots.org/bot/${bot.user.id}`);
    };

    /**
     * Giveme Roles Functions
     */
    /**
     * Prefix Related Functions
     */

    bot.getPrefix = function(msg) {
        return new Promise(
            (resolve, reject) => {
                db.all(`SELECT * FROM servers WHERE id = "${msg.guild.id}"`, (err, rows) => {
                    if (err || !rows[0]) reject(err);
                    else resolve(rows[0].prefix);
                });
            }
        );
    };

    bot.setPrefix = function(prefix, guild) {
        db.run('UPDATE servers SET prefix = "' + prefix + '" WHERE id = ' + guild.id);
        return prefix;
    };

    /**
     * Server Settings Related Functions
     */

    bot.setNewValue = function(setting, id, text) {
        db.run(`UPDATE servers SET ${setting} = "${text}" WHERE id = "${id}"`);
        return text;
    };

    bot.setNewBoolValue = function(setting, id, text) {
        db.run(`UPDATE servers SET ${setting} = ${text} WHERE id = "${id}"`);
        return text;
    };

    bot.getCurrentBooleanSetting = function(setting, id) {
        return new Promise(resolve => {
            db.all('SELECT * FROM servers WHERE id = ' + id, (err, rows) => {
                if (err) throw err;
                resolve(rows[0][setting]);
            });
        });
    };

    bot.getCurrentSetting = function(setting, id) {
        return new Promise(resolve => {
            db.all('SELECT * FROM servers WHERE id = ' + id, (err, rows) => {
                if (err) throw err;
                resolve(rows[0][setting]);
            });
        });
    };

    bot.getAllSettings = function(id) {
        return new Promise(resolve => {
            db.all('SELECT * FROM servers WHERE id = ' + id, (err, rows) => {
                if (err) throw err;
                resolve(rows[0]);
            });
        });
    };

    /**
	 * Core message processing functions
	 */

    // Implement categories of commands and check this based on those
    bot.enabled = function(command, guild) {
        if (command || guild) {
            return true;
        } else {
            return false;
        }
    };

    bot.permLevel = function(msg) {
        if (msg.author.id === bot.config.owner) {
            return 6;
        } else if (msg.author.id === msg.guild.owner.id) {
            return 5;
        } else if (msg.member.hasPermission('MANAGE_GUILD')) {
            return 4;
        } else if (msg.member.hasPermission('MANAGE_ROLES_OR_PERMISSIONS')) {
            return 3;
        } else if (msg.member.hasPermission('MANAGE_MESSAGES')) {
            return 2;
        } else if (!bot.blacklist(msg.author.id)) {
            return 1;
        } else {
            return 0;
        }
    };

    bot.processMessage = function(msg) {
        //if (channel && msg.channel.id === channel) bot.log(msg.guild.name + ' | ' + msg.channel.name + ' | ' + msg.member.displayName + ' | ' + msg.cleanContent);

        if (msg.author.bot) return;

        //TODO handle quotes

        this.getPrefix(msg).then(prefix => {
            if (msg.content.startsWith(prefix)) {
                try {
                    msg.args = msg.content.split(/\s+/g);
                    msg.content = msg.content.substring(msg.content.indexOf(' ') + 1, msg.content.length) || null;
                    var command = msg.args.shift().slice(prefix.length).toLowerCase();
                    var cmd = bot.commands.get(command);
                    // || bot.commands.get(bot.aliases.get(command))
                    var perms = bot.permLevel(msg);

                    if (!cmd) {
                        return;
                    } else if (perms === 0) {
                        msg.reply('you are blacklisted from using the bot!');
                    } else if (perms < cmd.permission) {
                        msg.reply('you do not have permission to do this!');
                    } else if (bot.enabled(cmd)) {
                        bot.logCommand(command, msg.content, msg.author.username, msg.channel.name, msg.guild.name);
                        try {
                            cmd.main(bot, msg);
                        } catch (err) {
                            msg.channel.send('Oh no! We encountered an error:\n```' + err.stack + '```');
                        }
                    }
                } catch (err) {
                    msg.channel.send('Oh no! We encountered an error:\n```' + err.stack + '```');
                    bot.error(err.stack);
                }
            } else {
                for (let key in quotes) {
                    if (msg.content.toLowerCase().indexOf(key.toLowerCase()) !== -1) {
                        msg.channel.send(quotes[key]);
                    }
                }
            }
        }).catch(console.error);

    };
    /**
	 * Core bot functions
	 */

    bot.send = function(channel2, text) {
        var color = channel2.guild.me.displayHexColor || '#ffb200';
        channel2.send(new Discord.RichEmbed().setColor(color).setDescription(text)
            .setFooter(bot.user.username, bot.user.avatarURL));
    };

    bot.blacklist = function(id) {
        var blacklistJson = fs.readFileSync('./blacklist.json'),
            blacklist = JSON.parse(blacklistJson);
        for (var i = 0; i < blacklist.length; i++) {
            if (blacklist[i] === id) { return true; }
        }
        return false;
    };

    bot.startGameCycle = function() {
        bot.user.setPresence({
            game: {
                name: bot.config.games[Math.round(Math.random() * (bot.config.games.length - 1))] + ' | @' + bot.user.username + ' What\'s your prefix?',
                type: 0,
            },
        });
        setInterval(() => {
            bot.user.setPresence({
                game: {
                    name: bot.config.games[Math.round(Math.random() * (bot.config.games.length - 1))] + ' | @' + bot.user.username + ' What\'s your prefix?',
                    type: 0,
                },
            });
        }, 300000);
    };

    bot.webhook = function(header, text, color) {
        var request = require('request');
        try {
            var d = {
                attachments: [{
                    color: color,
                    fields: [{
                        title: header,
                        value: text,
                    }],
                    ts: new Date() / 1000,
                }],
            };
            if (config.webhook) {
                request({
                    url: config.webhook + '/slack',
                    method: 'POST',
                    body: d,
                    json: true,
                });
            }
        } catch (err) {
            bot.error(err);
        }
    };

    bot.joinleavehook = function(type, guild) {
        var request = require('request');
        bot.fetchGuildSize().then(guilds => {
            try {
                if (type === 'join') {
                    var color = '#FFB200';
                    var title = ':inbox_tray: New Guild! | Now in ' + guilds + ' guilds.';
                } else if (type === 'leave') {
                    color = '#FF0000';
                    title = ':outbox_tray: Left Guild | Now in ' + guilds + ' guilds.';
                }

                var members = 0,
                    bots = 0;
                guild.members.forEach(member => {
                    if (member.user.bot) {
                        bots++;
                    } else {
                        members++;
                    }
                });

                var d = {
                    attachments: [{
                        color: color,
                        title: title,
                        thumb_url: guild.iconURL,
                        fields: [{
                            title: 'Server Name',
                            value: guild.name,
                            short: true,
                        }, {
                            title: 'Created',
                            value: guild.createdAt.toLocaleString(),
                            short: true,
                        }, {
                            title: 'ID',
                            value: guild.id,
                            short: true,
                        }, {
                            title: 'Owner',
                            value: guild.owner.user.username,
                            short: true,
                        }, {
                            title: 'Member Count',
                            value: members,
                            short: true,
                        }, {
                            title: 'Bot Count',
                            value: bots,
                            short: true,
                        }],
                        footer: bot.user.username,
                        ts: new Date() / 1000,
                    }],
                };

                if (guild.features[0]) {
                    d.attachments[0].fields.push({
                        title: 'Features',
                        value: guild.features.join('\n'),
                    });
                    d.attachments[0].text = 'Partnered Server';

                    if (guild.features.includes('INVITE_SPLASH')) { d.attachments[0].image_url = guild.splashURL + '?size=2048'; }
                }
                if (config.logwebhook) {
                    request({
                        url: config.logwebhook + '/slack',
                        method: 'POST',
                        body: d,
                        json: true,
                    });
                }
            } catch (err) {
                bot.error(err);
            }
        });
    };



    /**
	 * Logging functions
	 */

    bot.logCommand = function(command, args, user, channel2, server) {
        bot.webhook('Command Executed', `**Command:** ${command}\n**User:** ${user}\n**Arguments:** ${args}\n**Server:** ${server}\n**Channel:** #${channel2}`, '#0000FF');
    };

    bot.error = function(err) {
        if (bot.shard) {
            console.log(this.timestamp() + ' [SHARD ' + bot.shard.id + '] [ERROR] | ' + err.stack);
            bot.webhook('ERROR', '[SHARD ' + bot.shard.id + '] [ERROR] | ' + err.stack, '#FF0000');
        } else {
            console.log(this.timestamp() + ' [ERROR] | ' + err.stack);
            bot.webhook('ERROR', '[ERROR] | ' + err.stack, '#FF0000');
        }
    };

    bot.debug = function(txt) {
        if (bot.shard) {
            console.log(this.timestamp() + ' [SHARD ' + bot.shard.id + '] [DEBUG] | ' + txt);
        } else {
            console.log(this.timestamp() + ' [DEBUG] | ' + txt);
        }
    };

    bot.warn = function(txt) {
        if (bot.shard) {
            console.log(this.timestamp() + ' [SHARD ' + bot.shard.id + '] [WARN]  | ' + txt);
            bot.webhook('Warning', ' [SHARD ' + bot.shard.id + '] [WARN]  | ' + txt, '#FFFF00');
        } else {
            console.log(this.timestamp() + ' [WARN]  | ' + txt);
            bot.webhook('Warning', '[WARN]  | ' + txt, '#FFFF00');
        }
    };

    bot.log = function(txt) {
        if (bot.shard) {
            console.log(this.timestamp() + ' [SHARD ' + bot.shard.id + ']  [LOG]  | ' + txt);
            bot.webhook('Log', '[SHARD ' + bot.shard.id + '] ' + txt, '#000000');
        } else {
            console.log(this.timestamp() + '  [LOG]  | ' + txt);
            bot.webhook('Log', txt, '#000000');
        }
    };

    bot.timestamp = function() {
        var currentTime = new Date(),
            hours = currentTime.getHours(),
            minutes = currentTime.getMinutes(),
            seconds = currentTime.getSeconds();
        if (minutes < 10) { minutes = '0' + minutes; }
        if (seconds < 10) { seconds = '0' + seconds; }
        return '[' + hours + ':' + minutes + ':' + seconds + ']';
    };

    /**
	 * Utility functions for information retrieval
	 */

    bot.displayServer = function(msg, serverID) {
        db.run(`SELECT * FROM servers WHERE id = ${serverID}`, (err, row) => {
            if (err) {
                msg.channel.send(err);
            } else {
                msg.channel.send(JSON.stringify(row));
            }
        });
    };
};
