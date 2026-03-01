/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

import * as ChannelActionCreators from '@app/actions/ChannelActionCreators';
import * as ModalActionCreators from '@app/actions/ModalActionCreators';
import {selectChannel} from '@app/actions/NavigationActionCreators';
import {ChannelFlags, ChannelTypes} from '@fluxer/constants/src/ChannelConstants';

export interface FormInputs {
	name: string;
	url: string | null;
	type: string;
	dark_mode: boolean;
}

export interface ChannelTypeOption {
	value: number;
	name: string;
	desc: string;
}

export const channelTypeOptions: Array<ChannelTypeOption> = [
	{
		value: ChannelTypes.GUILD_TEXT,
		name: 'Text Channel',
		desc: 'Send messages, images, GIFs, and emoji',
	},
	{
		value: ChannelTypes.GUILD_VOICE,
		name: 'Voice Channel',
		desc: 'Hang out together with voice, video, and screen share',
	},
	{
		value: ChannelTypes.GUILD_LINK,
		name: 'Link Channel',
		desc: 'Quick access to an external website or resource',
	},
	{
		value: ChannelTypes.GUILD_WHITEBOARD,
		name: 'Whiteboard Channel',
		desc: 'Collaborative drawing and diagramming with Excalidraw',
	},
	{
		value: ChannelTypes.GUILD_CALENDAR,
		name: 'Calendar Channel',
		desc: 'Shared collaborative calendar for your community',
	},
];

export async function createChannel(guildId: string, data: FormInputs, parentId?: string): Promise<void> {
	const channelType = Number(data.type);
	const flags = channelType === ChannelTypes.GUILD_WHITEBOARD && data.dark_mode ? ChannelFlags.DARK_MODE_DEFAULT : 0;
	const channel = await ChannelActionCreators.create(guildId, {
		name: data.name,
		url: data.url,
		type: channelType,
		parent_id: parentId || null,
		bitrate: channelType === ChannelTypes.GUILD_VOICE ? 64000 : null,
		user_limit: channelType === ChannelTypes.GUILD_VOICE ? 0 : null,
		...(flags ? {flags} : {}),
	});

	if (channel.type === ChannelTypes.GUILD_TEXT || channel.type === ChannelTypes.GUILD_VOICE || channel.type === ChannelTypes.GUILD_WHITEBOARD || channel.type === ChannelTypes.GUILD_CALENDAR) {
		setTimeout(() => {
			selectChannel(guildId, channel.id);
		}, 50);
	}

	ModalActionCreators.pop();
}

export function getDefaultValues(): Partial<FormInputs> {
	return {
		type: ChannelTypes.GUILD_TEXT.toString(),
		dark_mode: false,
	};
}
