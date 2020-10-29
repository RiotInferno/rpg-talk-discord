import { TextChannel } from "discord.js";
import { ArgumentCollectorResult, Command, CommandoClient, CommandoMessage } from "discord.js-commando";
import { initializeBotAudit } from "./utils";
import './logging';
import { formatJsonMessage, getLogMessage } from "./logging";

export function initializeEvents(bot: CommandoClient){
    bot.addListener('commandRun',
        (command: Command, promise: Promise<any>, message: CommandoMessage,
            args: Object | string | Array<string>, fromPattern: boolean,
            result?: ArgumentCollectorResult) => 
                bot.LogInfo(`Command Recieved: ${getLogMessage(message)}`));
    
    bot.addListener('commandError',
        (command: Command, err: Error, message: CommandoMessage,
            args: Object | string | Array<string>, fromPattern: boolean,
            result?: ArgumentCollectorResult) => {
                bot.LogError('Command Error: ' + getLogMessage(message) +
                 '\n Error: ' + formatJsonMessage(err)); 
            });

    bot.addListener('commandBlock',
        (message: CommandoMessage, reason: string, data: object) => {
            bot.LogError('Command Blocked: ' + getLogMessage(message) +
                '\n Error: ' + formatJsonMessage(data));
        });

    bot.addListener('commandCancel',
        (command: Command, reason: string,
            message: CommandoMessage, result: ArgumentCollectorResult) => {
            bot.LogError(`Command Cancelled: ${getLogMessage(message)}'\n Error: ${reason}`);
        });
    
    bot.addListener('unknownCommand', (message: CommandoMessage) => {
        bot.LogInfo(`Unknown Command: ${getLogMessage(message)}`);
    })

    bot.once('ready', () => {
        initializeBotAudit(bot);
    });
}
