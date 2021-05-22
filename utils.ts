import { Client, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { TextChannel, Guild, Role, GuildManager, GuildMember } from 'discord.js';
import * as _ from 'lodash'
import './logging';
import { formatJsonMessage } from './logging';

export const blacklisted = (process.env.BLACKLIST || '')
    .split(',')
    .concat([process.env.AUDIT_CHANNEL])
    .map(channel => channel.trim())
    .map(channel => channel.toLowerCase())
    .filter(channel => channel.length > 0);

export function detectGuild(bot: CommandoClient, message: CommandoMessage): Guild {
  if (message.guild) {
    return message.guild;
  } else {
    return bot.guilds.cache.first();
  }
}

export function mapToRoles(channelNames: string[], guild: Guild): Role[] {
  return channelNames
    .map(name => guild.roles.cache.find(role => role.name === name))
    .filter(role => role)
    .filter(role => !_.includes(blacklisted, role.name.toLowerCase()));
}

export function channelHasRole(channelName: string, guild: Guild): boolean {
  let role = guild.roles.cache.find(role => role.name === channelName);
  if (role != null && !blacklisted.includes(role.name.toLowerCase()))
  {
    return true;
  }
  return false;
}

export function allChannels(guild: Guild): string[] {
  const channels = guild.channels.cache
    .filter(channel => channel.type == 'text')
    .filter(channel => !_.includes(blacklisted, channel.name.toLowerCase()))
    .map(channel => channel.name);

  return guild.roles.cache
    .filter(role => !_.includes(blacklisted, role.name.toLowerCase()))
    .map(role => role.name)
    .filter(role => _.includes(channels, role))
    .sort();
}

export function cleanupChannelName(channelName: string, guild: Guild): string {
  if (channelName.includes('<#')) {
    channelName = channelName.substr(2,)
    channelName = channelName.substr(0, channelName.length - 1)
    return guild.channels.cache.find(channel => channel.id === channelName).name;
  } else if (channelName.startsWith('#')) {
    return channelName.substr(1).toLowerCase();
  } else {
    return channelName.toLowerCase();
  }
}

export function mapToChannels(channelNames: string[], guild: Guild): TextChannel[] {
  return channelNames
    .map(name => guild.channels.cache.find(channel => channel.name === name))
    .filter(channel => channel)
    .filter(channel => !_.includes(blacklisted, channel.name.toLowerCase())) as TextChannel[];
}

export async function initializeBotAudit(bot: CommandoClient)
{
  try {
    if (process.env.AUDIT_CHANNEL) {
      const auditChannel = process.env.AUDIT_CHANNEL;
      var guild = bot.guilds.cache.first();
      var alreadyMade = guild.channels.cache
        .filter(channel => channel.isText())
        .map(channel => channel.name.toLowerCase())
        .includes(auditChannel);

      if (!alreadyMade) {
        var role = await createChannel(bot, auditChannel, guild, process.env.MOD_ROLE);
      }
    }
  } catch (error) {
    bot.LogAnyError(error);
  }
}

export async function createChannel(bot: CommandoClient, name: string, guild: Guild, roleOverride?: string): Promise<Role> {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw Error('Bad new channel name: ' + name);
  }

  if (!roleOverride && await guild.roles.cache.find(role => role.name === name)) {
    throw Error('Channel already exists: ' + name);
  }

  var role: Role = null;

  if (roleOverride) {
    role = guild.roles.cache.find(role => role.name.toLowerCase() == roleOverride.toLowerCase())
  } else {
    role = await guild.roles.create({ data: { name } });
  }
  
  if(!role){
    bot.LogError(`Could not find role ${roleOverride ? roleOverride : name}. Did not create channel ${name}`);
    return;
  }

  let channel = await guild.channels.create(name,
    {
      type: "text",
      permissionOverwrites: [{
        id: (await guild.roles.cache.find(role => role.name === "@everyone")).id,
        type: "role",
        deny: 3072
      } as any, {
        id: role.id,
        type: "role",
        allow: 3072
      } as any]
    });
  return role;
}

export function LogUserRoles(bot: CommandoClient, member: GuildMember, dataTag: string) {
    bot.LogTrace(`[${dataTag}] roles for user ${member.user.tag} ${formatJsonMessage(member.roles.cache.map(role => role.name))}`);
}

export async function IsMemberPending(api: any, guild: Guild, member: GuildMember) {
  return IsMemberIdPending(api, guild.id, member.id);
}

export async function IsMemberIdPending(api: any, guildId: string, memberId: string) {
    var data = await api.guilds(guildId).members(memberId).get();
    return data.pending === true;
}

export function InitialGreeting(bot: CommandoClient, member: GuildMember){
    let defaultRoleNames = (process.env.DEFAULT || '')
        .split(',')
        .filter(name => name)
        .map(name => name.trim())
        .filter(name => name.length > 0)

    try {
        bot.LogInfo(`${member.user.tag} has joined the server at server time ${member.joinedAt.toISOString()}`)
        let defaultRoles = defaultRoleNames
            .map(name => member.guild.roles.cache.find(role => role.name ===  name))
            .filter(role => role)

        member.roles.add(defaultRoles)
         .catch(err => bot.LogAnyError(err));
        
        bot.LogInfo(`${member.user.tag} should have the default roles of ${defaultRoleNames}`);
    } catch (error) {
        bot.LogAnyError(error);
    }

    try {
        member.send(`Thanks for joining **${member.guild.name}**.\n\n` +
            `There are many more channels beyond the ${defaultRoleNames.length + 1} default ones. ` +
            `There are **${allChannels(member.guild).length}** in total!\n\n` +
            `Discover them all by entering the **/channels** command here.\n\n` +
            `Be sure to review the Code of Conduct in our #rules channels`)
            .catch(err => bot.LogAnyError(err));
    } catch (error) {
        bot.LogAnyError(error);
    }
}