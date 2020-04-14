import { CommandMessage, CommandoClient } from 'discord.js-commando'
import { TextChannel, Message, Guild, GuildMember, Role, User } from 'discord.js';
import * as _ from 'lodash'
import * as moment from 'moment-timezone'
import { mapToChannels, blacklisted, cleanupChannelName, allChannels, mapToRoles, detectGuild } from './utils'

export class ChannelManager {
  private readonly joinMessageRegex: RegExp = /has joined/;
  private readonly usernameRegex: RegExp = /@[^ ,.*]+/g;

  constructor(readonly bot: CommandoClient) {
  }

  parseChannelString(channelNames: string, guild: Guild): string[] {
    return channelNames.split(' ')
      .map(name => name.trim())
      .filter(name => name.length > 0)
      .map(name => cleanupChannelName(name, guild));
  }

  async join(channelNames: string[], member: GuildMember, guild: Guild) {
    var original = mapToRoles(channelNames, guild)
    var roles = original.filter(requested => !member.roles.exists('name', requested.name));
    var removedRoles = original.filter(requested => member.roles.exists('name', requested.name));

    if (roles.length == 0) {
      throw Error(`You are asking to join a channel does not exist or is not joinable`);
    }

    if (removedRoles.length == original.length) {
      throw Error(`You are already in #${removedRoles.map(role => role.name).join(",")}`);
    }

    let waitlistRoles = mapToRoles((process.env.WAITLIST || '').split(','), guild)
    let daysJoined = moment().diff(moment(member.joinedAt), 'days', true)
    if (_.intersection(roles.map(role => role.id), waitlistRoles.map(role => role.id)).length > 0 && daysJoined < 7) {
      throw Error(`Unable to join channel(s). You are attempting to join a chanenel with a waiting period`);
    }

    roles = roles.filter(role => !member.roles.exists("name", role.name));

    if (roles.length == 0) {
      throw Error(`Unable to join channel(s)`);
    }

    await member.addRoles(roles);

    roles.forEach((role) => {
      const channel = guild.channels.find(
        channel => channel.name == role.name && channel.type == 'text'
      ) as TextChannel;

      if (channel) {
        this.postJoinMessage(this.bot, channel, member)
      }
    })
  }

  async resolveNames(channelNames: string[], guild: Guild, member: GuildMember): Promise<string[]> {
    let mappedNames = []
    for (let i = 0; i < channelNames.length; i++) {
      if (channelNames[i] == "all" && member.roles.filter(role => role.name.toLocaleLowerCase() == process.env.MOD_ROLE.toLowerCase()).size > 0) {
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
      lastMessage = await channel.fetchMessage(channel.lastMessageID)
    } catch (error) { }

    if (lastMessage && this.messageFromUser(bot.user, lastMessage) && this.isJoinedMessage(lastMessage)) {

      const users = this.parseJoinedUsers(lastMessage);
      let message;
      if (users.length > 1) {
        message = `*\`${users.shift()}\` has joined, along with \`${users.join("\`, \`")}\`, and \`@${member.displayName}\`*`;
      } else {
        message = `*\`${users.shift()}\` has joined, along with \`@${member.displayName}*\``;
      }
      lastMessage.edit(message).catch(console.log);
    } else {
      channel.send(`*\`@${member.displayName}\` has joined*`).catch(console.log);
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

  createJoinCommand() {
    return async (message: CommandMessage, channelName: string): Promise<any> => {
      message.delete().catch(() => { });

      try {
        const guild = detectGuild(this.bot, message);
        const member = guild.members.find("id", message.author.id)
        await this.parseAndJoin(channelName, member, guild);

        if (message.channel.type == "dm") {
          return message.reply(`You have been added to #${channelName}`)
        } else {
          return undefined;
        }
      } catch (error) {
        return message.reply(`"${message.cleanContent}" failed: ${error}.`) as any;
      }
    }
  }

  createLeaveCommand() {
    return async (message: CommandMessage, args: string): Promise<any> => {
      message.delete().catch(console.log);

      try {
        const guild = detectGuild(this.bot, message)
        let channels: TextChannel[] = [];
        let roles: Role[] = [];

        if (!args || args.length == 0) {
          args = (message.channel as TextChannel).name
        }

        const member = guild.members.find("id", message.author.id)

        const resolvedNames = (await this.resolveNames(this.parseChannelString(args, guild), guild, member))
          .filter(name => !_.includes(blacklisted, name.toLowerCase()))

        channels = mapToChannels(resolvedNames, guild)
          .filter(channel => member.roles.exists("name", channel.name))

        roles = mapToRoles(resolvedNames, guild)
          .filter(role => member.roles.exists("name", role.name))

        await member.removeRoles(roles);

        console.log("Leaving successful")
        return undefined;
      } catch (error) {
        console.log(error);

        return message.reply(`Leave command failed: ${message.cleanContent}`) as any;
      }
    }
  }

  createInviteCommand() {
    return async (message: CommandMessage, argsString: string): Promise<any> => {
      message.delete().catch(console.log);

      try {
        let args = argsString.split(" ").map(part => part.trim()).filter(part => part.length > 0);
        let id = args[0].replace(/\D/g, '');
        let channelNames = args.slice(1);

        let guild = detectGuild(this.bot, message);

        if (!channelNames || channelNames.length == 0) {
          channelNames.push((message.channel as TextChannel).name)
        }

        let invitedMember = guild.members
          .find(member => member.id == id);

        if (!invitedMember) {
          let plainName = args[0].replace('@', '');
          invitedMember = guild.members
            .find(member => member.displayName.toLowerCase() == plainName.toLowerCase());
        }

        await this.parseAndJoin(channelNames.join(' '), invitedMember, guild);

        return undefined;
      } catch (error) {
        console.log(error);

        return message.reply(`Invite command failed: ${message.cleanContent}`) as any;
      }
    }
  }
}
