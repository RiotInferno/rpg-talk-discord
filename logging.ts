import { TextChannel } from "discord.js";
import { CommandoMessage } from "discord.js-commando";
import { CommandoClient } from "discord.js-commando";
import moment = require("moment");

enum LogLevel {
    INFO = "Info",
    DEBUG = "Debug",
    ERROR = "Error"
};

declare module 'discord.js-commando' {
    interface CommandoClient {
        LogInfo(message: string);
        LogDebug(message: string);
        LogError(message: string);
        LogAnyError(data: any);
        LogMessage(message: string, level: LogLevel);
    } 
}

CommandoClient.prototype.LogInfo = function(message: string) { 
    (this as CommandoClient).LogMessage(message, LogLevel.INFO);
}
CommandoClient.prototype.LogDebug = function(message: string) {
    (this as CommandoClient).LogMessage(message, LogLevel.DEBUG);
}
CommandoClient.prototype.LogError = function(message: string) {
    (this as CommandoClient).LogMessage(message, LogLevel.ERROR);
}
CommandoClient.prototype.LogAnyError = function(data: any) {
    (this as CommandoClient).LogMessage(formatJsonMessage(data), LogLevel.ERROR);
}

CommandoClient.prototype.LogMessage = function(message: string, level: LogLevel)
{
  /* Event logging falls into different categories:
    - Informative - User has left the channel, Mod has set the topic, Role has been changed.
    - Tracking - User entered this command.
    - Errors - Bot Errors, Unknown Commands.
  */
    const bot = (this as CommandoClient);

    var channel = bot.guilds.cache.first()
        .channels.cache
        .filter(channel => channel.name.toLowerCase() == process.env.AUDIT_CHANNEL && channel.isText())
        .first();
    if (channel) {
        // Using a type guard to narrow down the correct type, see https://stackoverflow.com/a/53608094
        if (!((channel): channel is TextChannel => channel.type === 'text')(channel)) return;
        channel.send(`[${moment().toISOString()}][${level}]: ${message}`);
        if(level == LogLevel.ERROR){
            channel.send(`**stack trace:** \n>>> ${new Error().stack}`);
        }
    }
}

export const getLogMessage = (message: CommandoMessage): string =>
    (`${message.author.tag}: ${message.cleanContent}`);

export const formatJsonMessage = (data: object): string => 
    "```json\n" + JSON.stringify(data, replaceErrors, 3) + "```"; 

function replaceErrors(key, value) {
    if (value instanceof Error) {
        var error = {};

        Object.getOwnPropertyNames(value).forEach(function (key) {
            error[key] = value[key];
        });

        return error;
    }

    return value;
}