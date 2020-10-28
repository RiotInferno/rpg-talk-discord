import { TextChannel } from "discord.js";
import { ArgumentCollectorResult, Command, CommandoClient, CommandoMessage } from "discord.js-commando";
import { initializeBotAudit } from "./utils";

export function initializeEvents(bot: CommandoClient){
    bot.addListener('commandRun',
        (command: Command, promise: Promise<any>, message: CommandoMessage,
            args: Object | string | Array<string>, fromPattern: boolean,
            result?: ArgumentCollectorResult) => {
            var channel = bot.guilds.cache.first()
                .channels.cache
                .filter(channel => channel.name.toLowerCase() == process.env.AUDIT_CHANNEL && channel.isText())
                .first();
            if (channel) {
                // Using a type guard to narrow down the correct type, see https://stackoverflow.com/a/53608094
                if (!((channel): channel is TextChannel => channel.type === 'text')(channel)) return;
                channel.send(`${message.author.tag}: ${message.cleanContent}`);
            }
        });
    
    bot.once('ready', () => {
        initializeBotAudit(bot);
    });
}