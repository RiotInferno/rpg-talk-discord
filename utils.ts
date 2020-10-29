import { Client, CommandoClient, CommandoMessage } from 'discord.js-commando'
import { TextChannel, Guild, Role } from 'discord.js';
import * as _ from 'lodash'
import './logging';

export const blacklisted = (process.env.BLACKLIST || '')
    .split(',')
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
        var role = await createChannel(bot, auditChannel, guild);
        // add the new role to each mod.
        guild.roles.cache
          .filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase())
          .flatMap(role => role.members)
          .forEach(member => {
            member.roles.add(role);
          });
      }
    }
  } catch (error) {
    bot.LogAnyError(error);
  }
}

export async function createChannel(bot: CommandoClient, name: string, guild: Guild): Promise<Role> {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw Error('Bad new channel name: ' + name);
  }

  if (await guild.roles.cache.find(role => role.name === name)) {
    throw Error('Channel already exists: ' + name);
  }

  let role = await guild.roles.create({ data: { name } });
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