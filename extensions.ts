import { Client, Structures } from 'discord.js';
import { isConstructorDeclaration } from 'typescript';
import { CommandoClient } from "discord.js-commando";

declare module 'discord.js' {
	interface GuildMember {
		pending: boolean;
	}
}

Structures.extend('GuildMember', GuildMember => {
    class GuildMemberWithPending extends GuildMember {
        pending = false;

        constructor(client: any, data: any, guild: any) {
            super(client, data, guild);
            this.pending = data.pending ?? false;
        }

        _patch(data: any) {
            // @ts-expect-error
            super._patch(data);
            this.pending = data.pending ?? false;
        }
    }
    return GuildMemberWithPending;  
});