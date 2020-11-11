import { CommandoMessage, CommandoClient } from 'discord.js-commando'
import { TextChannel, Message, Guild, GuildMember, Role, User } from 'discord.js';
import * as _ from 'lodash'
import * as moment from 'moment-timezone'
import { mapToChannels, blacklisted, cleanupChannelName, allChannels, mapToRoles, detectGuild, LogUserRoles } from './utils'
import './logging';
import { formatJsonMessage } from './logging';

export class ChannelManager {
  private readonly joinMessageRegex: RegExp = /has joined/;
  private readonly usernameRegex: RegExp = /@[^ `,.*]+/g;

  constructor(readonly bot: CommandoClient) {
  }

  parseChannelString(channelNames: string, guild: Guild): string[] {
    return channelNames.split(' ')
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .map(name => cleanupChannelName(name, guild));
  }

  async join(channelNames: string[], member: GuildMember, guild: Guild) {
    LogUserRoles(this.bot, member, 'pre-join');
    var original = mapToRoles(channelNames, guild)
    var roles = original.filter(requested => !member.roles.cache.some(role => role.name === requested.name));
    var removedRoles = original.filter(requested => member.roles.cache.some(role => role.name === requested.name));

    channelNames.forEach(function(joinChannel){
      if (!original.find(channel => channel.name == joinChannel))
      {
        throw Error(`You are attempting to join a channel that does not exist: ${joinChannel}. Please consult the lists from the \`channels\` command for a full list`);
      }
    })

    if (removedRoles.length == original.length) {
      throw Error(`You are already in #${removedRoles.map(role => role.name).join(",")}`);
    }

    let waitlistRoles = mapToRoles((process.env.WAITLIST || '').split(','), guild)
    let daysJoined = moment().diff(moment(member.joinedAt), 'days', true)
    if (_.intersection(roles.map(role => role.id), waitlistRoles.map(role => role.id)).length > 0 && daysJoined < 7) {
      throw Error(`Unable to join channel(s). You are attempting to join a channel with a waiting period`);
    }

    roles.forEach(function(role){
      if (member.roles.cache.some(memberRole => memberRole.name === role.name))
      {
        throw Error(`You are already in ${role.name}`)
      }
    })

    roles = roles.filter(role => !member.roles.cache.some(memberRole => memberRole.name === role.name));

    if (roles.length == 0) {
      throw Error(`Unable to join channel(s). Channel(s) either do not exist or aren't joinable.`);
    }

    this.bot.LogTrace(`preparing to add roles: ${formatJsonMessage(roles)}`);
    member = await member.roles.add(roles);

    roles.forEach((role) => {
      const channel = guild.channels.cache.find(
        channel => channel.name == role.name && channel.type == 'text'
      ) as TextChannel;

      if (channel) {
        this.postJoinMessage(this.bot, channel, member)
      }
    })
    LogUserRoles(this.bot, member, 'join successful');
  }

  async resolveNames(channelNames: string[], guild: Guild, member: GuildMember): Promise<string[]> {
    let mappedNames = []
    for (let i = 0; i < channelNames.length; i++) {
      if (channelNames[i] == "all" && member.roles.cache.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0) {
        mappedNames = mappedNames.concat(allChannels(guild));
      } else {
        mappedNames.push(channelNames[i]);
      }
    }

    return _.uniq(mappedNames);
  }

  async parseAndJoin(channelNamesString: string, member: GuildMember, guild: Guild) {
    const channelNames = this.parseChannelString(channelNamesString, guild);

    await this.join(await this.resolveNames(channelNames, guild, member), member, guild);
  }

  async postJoinMessage(bot: CommandoClient, channel: TextChannel, member: GuildMember) {
    let lastMessage;

    try {
      lastMessage = await channel.messages.fetch(channel.lastMessageID)
    } catch (error) {
      bot.LogAnyError(error);
    }

    let safeName = `@${member.displayName}`;
    if (this.isUnsafeUsername(safeName))
    {
      safeName = `\`@${member.displayName}\``;
    }

    if (lastMessage && this.messageFromUser(bot.user, lastMessage) && this.isJoinedMessage(lastMessage)) {
      const users = this.parseJoinedUsers(lastMessage);
      let safeUsers = [];
      if (users != null && users != undefined && users.length > 0) {
        users.forEach(part => {
          if (part != null) {
            if (this.isUnsafeUsername(part))
            {
              safeUsers.push(`\`${part}\``);
            }
            else
            {
              safeUsers.push(`${part}`);
            }
          }
        });
      }
      let message;

      if (users != null && users.length > 1) {
        message = `${safeUsers.shift()} has joined, along with ${safeUsers.join(", ")}, and ${safeName}`;
      } else {
        message = `${safeUsers.shift()} has joined, along with ${safeName}`;
      }
      lastMessage.edit(message)
        .catch(bot.LogAnyError);
    } else {
      channel.send(`${safeName} has joined`)
        .catch(bot.LogAnyError);
    }
  }

  isJoinedMessage(message: Message): boolean {
    return this.joinMessageRegex.test(message.content);
  }

  messageFromUser(user: User, message: Message): boolean {
    return message.author === user;
  }

  parseJoinedUsers(message: Message): string[] {
    return message.content.match(this.usernameRegex);
  }

  isUnsafeUsername(username: string): boolean {
    if (username.includes('here') || username.includes('everyone'))
    {
      return true;
    }
    return false;
  }

  createJoinCommand() {
    return async (message: CommandoMessage, channelName: string): Promise<any> => {
      message.delete().catch(() => { });

      try {
        const guild = detectGuild(this.bot, message);
        const member = guild.members.cache.find(member => member.id === message.author.id)
        await this.parseAndJoin(channelName, member, guild);

        if (message.channel.type == "dm") {
          return message.reply(`You have been added to #${channelName}`)
        } else {
          return undefined;
        }
      } catch (error) {
        message.client.LogAnyError(error);
        return message.reply(`"${message.cleanContent}" failed: ${error}.`) as any;
      }
    }
  }

  createLeaveCommand() {
    return async (message: CommandoMessage, args: string): Promise<any> => {
      message.delete().catch(() => { });

      try {
        const guild = detectGuild(this.bot, message)
        let channels: TextChannel[] = [];
        let roles: Role[] = [];

        if (!args || args.length == 0) {
          args = (message.channel as TextChannel).name
        }

        var member = guild.members.cache.find(member => member.id === message.author.id)
        LogUserRoles(this.bot, member, 'pre-leave');

        const resolvedNames = (await this.resolveNames(this.parseChannelString(args, guild), guild, member))
          .filter(name => !_.includes(blacklisted, name.toLowerCase()))

        channels = mapToChannels(resolvedNames, guild)
          .filter(channel => member.roles.cache.some(role => role.name === channel.name))

        roles = mapToRoles(resolvedNames, guild)
          .filter(role => member.roles.cache.some(memberRole => memberRole.name === role.name))

        this.bot.LogTrace(`preparing to remove roles: ${formatJsonMessage(roles)}`);
        member = await member.roles.remove(roles);

        console.log("Leaving successful")
      LogUserRoles(this.bot, member, 'leave successful');
        return undefined;
      } catch (error) {
        message.client.LogAnyError(error);

        return message.reply(`Leave command failed: ${message.cleanContent}`) as any;
      }
    }
  }

  createInviteCommand() {
    return async (message: CommandoMessage, argsString: string): Promise<any> => {
      message.delete().catch(() => { });

      try {
        let args = argsString.split(" ").map(part => part.trim()).filter(part => part.length > 0);
        let id = args[0].replace(/\D/g, '');
        let channelNames = args.slice(1);

        let guild = detectGuild(this.bot, message);

        if (!channelNames || channelNames.length == 0) {
          channelNames.push((message.channel as TextChannel).name)
        }

        let invitedMember = guild.members.cache
          .find(member => member.id == id);

        if (!invitedMember) {
          let plainName = args[0].replace('@', '');
          invitedMember = guild.members.cache
            .find(member => member.displayName.toLowerCase() == plainName.toLowerCase());
        }

        await this.parseAndJoin(channelNames.join(' '), invitedMember, guild);

        return undefined;
      } catch (error) {
        message.client.LogAnyError(error);

        return message.reply(`Invite command failed: ${message.cleanContent}`) as any;
      }
    }
  }
}
