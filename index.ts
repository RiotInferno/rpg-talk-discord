require('dotenv').config()

import { Message, CategoryChannel, TextChannel, GuildMember, MessageAttachment, Intents } from 'discord.js'
import * as _ from 'lodash'
import * as moment from 'moment-timezone'
import Dice from './dice'
import { blacklisted, allChannels, detectGuild, channelHasRole, createChannel, InitialGreeting } from './utils'
import { ChannelManager } from './channel_manager'
import { Buffer } from 'buffer'
import { Command, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { initializeEvents } from './events'
import './extensions'
import './logging'

let bot = new CommandoClient({
    owner: process.env.OWNER,
    commandPrefix: '/',
    fetchAllMembers: true,
    ws: {
       intents: new Intents(['GUILDS',
                             'GUILD_MEMBERS',
                             'GUILD_BANS',
                             'GUILD_MESSAGES', 
                             'DIRECT_MESSAGES'])
    }
});

/* function InhibitPendingUsers(msg: CommandoMessage) : false | Inhibition {
     if(msg.member['pending']){
        return { 
            reason: 'pending',
            response: (msg.reply("please complete joining the server before using the bot.") as Promise<Message>)
        };
    }
    return false;
}
 */
if (process.env.ENABLE_SCREENING === 'true') {
    //bot.dispatcher.addInhibitor(InhibitPendingUsers);
    bot.dispatcher.addInhibitor((msg: CommandoMessage) => {
        if (!(msg.member) || msg.member.pending) {
            return {
                reason: 'pending',
                response: (msg.reply("please complete joining the server before using the bot.") as Promise<Message>)
            };
        }
        return false;
    });
}

bot.login(process.env.TOKEN);

bot.registry
    .registerGroup('channels', 'Channel Commands')
    .registerDefaults();

const channelManager = new ChannelManager(bot)

let joinCommand = new Command(bot, {
    name: 'join',
    group: 'channels',
    memberName: 'join',
    description: 'Join a channel.',
    aliases: ['j']
});

joinCommand.run = channelManager.createJoinCommand();

bot.registry.registerCommand(joinCommand);

let leaveCommand = new Command(bot, {
    name: 'leave',
    group: 'channels',
    memberName: 'leave',
    description: 'Leave a channel.',
    aliases: ['part']
});

leaveCommand.run = channelManager.createLeaveCommand();

bot.registry.registerCommand(leaveCommand);

let inviteCommand = new Command(bot, {
    name: 'invite',
    group: 'channels',
    memberName: 'invite',
    description: 'Invites another user to a channel.'
});

inviteCommand.run = channelManager.createInviteCommand();

bot.registry.registerCommand(inviteCommand);

let createCommand = new Command(bot, {
    name: 'create',
    group: 'channels',
    memberName: 'create',
    description: 'Creates a new channel.'
});

createCommand.run = async (message: CommandoMessage, args: string): Promise<any> => {
    try {
        let name = args.trim().toLowerCase();
        let guild = detectGuild(bot, message);
        var role = await createChannel(bot, name, guild);
        let guildMember = guild.members.cache.find(member => member.id === message.author.id)
        await guildMember.roles.add(role);

        return message.reply(`#${args} has been created`) as any;
    } catch (error) {
        bot.LogAnyError(error);
        return message.member.send(`Command failed: ${message.cleanContent}`) as any;
    }
}

createCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(createCommand);

let queryCommand = new Command(bot, {
    name: 'query',
    group: 'channels',
    memberName: 'query',
    description: 'Query a user.'
});

queryCommand.run = async (message: CommandoMessage, argsString: string): Promise<any> => {
    message.delete().catch(() => { });

    let args = argsString.split(" ").map(part => part.trim()).filter(part => part.length > 0);
    let memberId = args[0].replace(/\D/g, '');

    let guild = detectGuild(bot, message);
    let queryingMember = guild.members.cache.find(member => member.id === message.author.id)
    let foundMember = guild.members.cache.find(member => member.id == memberId);

    if (!foundMember) {
        let plainName = args[0].replace('@', '');
        foundMember = guild.members.cache.find(member => member.displayName.toLowerCase() == plainName.toLowerCase());
    }

    if (foundMember) {
        let date = moment(foundMember.joinedAt).tz('America/New_York')
        let dateString = date.format('MMMM Do YYYY, h:mm:ss a')
        let dateTz = date.zoneName()
        queryingMember.send(`${foundMember.displayName} joined on ${dateString} ${dateTz}.`)
    } else {
        queryingMember.send(`Unable to query ${foundMember.displayName}.`)
    }
}

queryCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(queryCommand);

let topicCommand = new Command(bot, {
    name: 'topic',
    group: 'channels',
    memberName: 'topic',
    description: 'Set channel topic.'
});

topicCommand.run = async (message: CommandoMessage, args: string): Promise<any> => {
    try {
        detectGuild(bot, message).channels.cache.find(channel => channel.id === message.channel.id).setTopic(args);
        message.delete().catch(() => { });

        return message.reply(`set new channel topic`) as any;
    } catch (error) {
        bot.LogAnyError(error);

        return message.member.send(`Command failed: ${message.cleanContent}`) as any;
    }
}

topicCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(topicCommand);

let cocCommand = new Command(bot, {
    name: 'coc',
    group: 'channels',
    memberName: 'coc',
    description: 'Announces the Code of Conduct'
});

cocCommand.run = async (message: CommandoMessage): Promise<any> => {
    message.delete().catch(() => { });
    return message.channel.send(`Be sure to read our Code of Conduct at https://rpg-talk.com/code_of_conduct.pdf.`) as any;
}

cocCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(cocCommand);

let piracyCommand = new Command(bot, {
    name: 'piracy',
    group: 'channels',
    memberName: 'piracy',
    description: 'Announces RPG Talk\'s stance on piracy'
});

piracyCommand.run = async (message: CommandoMessage): Promise<any> => {
    message.delete().catch(() => { });
    return message.channel.send(`This community respects the rights of creators and in that, the promotion of pirated content and sources of pirated material is strictly forbidden. `
        + `Discussion of digital piracy is also frowned upon because of mishandling of this topic by both sides excluding its ethics which is normally forbidden. ` +
        `However if you absolutely must have a conversation about piracy as a general topic, do not reference any specific acts of piracy or websites, organizations, individuals, etc. that promote piracy, ` +
        `and understand that your conversation may be shut down quickly.`) as any;
}

piracyCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(piracyCommand);

let xcardCommand = new Command(bot, {
    name: 'xcard',
    group: 'channels',
    memberName: 'xcard',
    description: 'Requests channel conversation goes away'
});

xcardCommand.run = async (message: CommandoMessage, args: string): Promise<any> => {
    message.delete().catch(() => { });
    return message.channel.send(`Someone had requested that this conversation ${_.get(args, 'length', 0) > 0 ? `about ${args}` : ''} stops for now. Please take a break from this topic. Thank you!`) as any;
}

xcardCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

//bot.registry.registerCommand(xcardCommand);

let statsCommand = new Command(bot, {
    name: 'stats',
    group: 'channels',
    memberName: 'stats',
    description: 'per-channel user/mod stats'
});

statsCommand.run = async (message: CommandoMessage): Promise<any> => {
    try {
        let guild = detectGuild(bot, message);
        let channelList = allChannels(guild);
        let stats = guild.roles.cache
            .filter(r => r.name != process.env.MOD_ROLE.toLowerCase() && _.includes(channelList, r.name))
            .map(r => ({
                channelName: r.name,
                memberCount: r.members.array().length,
                modCount: r.members
                    .filter(m => _.includes(m.roles.cache.map(role => role.name.toLowerCase()),
                        process.env.MOD_ROLE.toLowerCase()))
                    .array()
                    .length
            }));

        let response = 'Channel, Member Count, Moderator Count\n';
        stats.forEach(s => response += `${s.channelName},${s.memberCount},${s.modCount}\n`);

        message.author.send(
            'Here are the current channel stats',
            new MessageAttachment(Buffer.from(response, 'utf-8'), `RPGTalk-stats-${new Date().valueOf()}.csv`))
            .catch(err => bot.LogAnyError(err));
        message.delete().catch(() => { });
        return undefined;
    } catch (error) {
        bot.LogAnyError(error);
        return message.member.send(`Command failed: ${message.cleanContent}`) as any;
    }
}

statsCommand.hasPermission = (message: CommandoMessage): boolean => {
    let guildMember = detectGuild(bot, message).members.cache.find(member => member.id === message.author.id)
    return guildMember.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0
}

bot.registry.registerCommand(statsCommand);

let channelsCommand = new Command(bot, {
    name: 'channels',
    group: 'channels',
    memberName: 'channels',
    description: 'List all channels.',
    aliases: ['channel']
});

channelsCommand.run = async (message: CommandoMessage): Promise<any> => {
    try {
        const defaultWidth = 20;
        const maxTopic = 1000;
        var guild = detectGuild(bot, message);
        const channelCategories = guild.channels.cache
            .filter(channel => channel.type == 'category')
            .filter(channel => !_.includes(blacklisted, channel.name.toLowerCase()))
            .sort((a, b) => {
                if (a.position > b.position) {
                    return 1;
                }
                else if (a.position < b.position) {
                    return -1;
                }
                return 0;
            });

        let response = "**__Channels__**\n";
        var line = '';

        channelCategories.forEach(category => {
            response += `**${category.name}**\n`;

            var children = (<CategoryChannel>category).children
                .filter(channel => channel.type == 'text')
                .filter(channel => !_.includes(blacklisted, channel.name.toLowerCase()))
                .sort((a, b) => {
                    if (a.position > b.position) {
                        return 1;
                    }
                    else if (a.position < b.position) {
                        return -1;
                    }
                    return 0;
                });

            children.forEach(channel => {
                if (channelHasRole(channel.name, guild)) {
                    line = '';
                    var channelTopic = "";
                    if (typeof channel !== 'undefined') {
                        channelTopic = ((<TextChannel>channel).topic || '(no topic)');
                    }

                    var pad_length = defaultWidth - channel.name.length;
                    if (pad_length <= 0) {
                        pad_length = 1;
                    }
                    var padding = ' '.repeat(pad_length);
                    line += `\`` + channel.name + padding + `- \`` + channelTopic.substring(0, maxTopic);
                    line += '\n'

                    if ((line.length + response.length) > 1500) {
                        message.author.send(response)
                            .catch(err => bot.LogAnyError(err))
                        response = ""
                    }
                    response += line;
                }
            })
            line += `\n`;
        });

        response += '\n**To join a channel**, type `/join channel_name`.'
        response += '\n**To leave a channel**, type `/leave channel_name`.'
        message.author.send(response)
            .catch(err => bot.LogAnyError(err))
        message.delete().catch(() => { });

        return undefined;
    } catch (error) {
        bot.LogAnyError(error);
        return message.member.send(`Command failed: ${message.cleanContent}`) as any;
    }
}

bot.registry.registerCommand(channelsCommand);

console.log('Connecting...');
bot.on('ready', () => {
    console.log('Running');
    bot.guilds.cache.forEach(guild => guild.member(bot.user).setNickname('RPG Talk Bot')
        .catch(err => bot.LogAnyError(err)));
    bot.user.setPresence({
        status: "online",
        activity: { name: "/help and /channels" }
    });
});

bot.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (process.env.ENABLE_SCREENING === 'true') {
        // in the future, we'll be able to validate oldmember.pending vs newmember.pending.
        // Member passed membership screening
        if (oldMember.pending && !newMember.pending) {
            InitialGreeting(bot, newMember);
        }
    }
});

bot.on('guildMemberAdd', async (member) => {
    if (process.env.ENABLE_SCREENING !== 'true') {
        InitialGreeting(bot, member);
    }
});

initializeEvents(bot);
