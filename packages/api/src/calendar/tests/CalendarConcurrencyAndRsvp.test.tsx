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

import {createTestAccount} from '@fluxer/api/src/auth/tests/AuthTestUtils';
import {createChannel, createGuild} from '@fluxer/api/src/channel/tests/ChannelTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '@fluxer/api/src/test/ApiTestHarness';
import {HTTP_STATUS} from '@fluxer/api/src/test/TestConstants';
import {createBuilder} from '@fluxer/api/src/test/TestRequestBuilder';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

interface CalendarEvent {
	id: string;
	title: string;
	start: string;
	end?: string;
	allDay?: boolean;
	color?: string;
	description?: string;
	assignedUserIds?: Array<string>;
	assignedRoleIds?: Array<string>;
	rsvpByUserId?: Record<string, 'going' | 'maybe' | 'declined'>;
}

interface CalendarDataResponse {
	events: Array<CalendarEvent>;
	version: number;
}

describe('Calendar concurrency and RSVP regressions', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});

	afterEach(async () => {
		await harness?.shutdown();
	});

	test('save calendar returns 409 when expected_version is stale', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Calendar Conflict Guild');
		const calendarChannel = await createChannel(
			harness,
			owner.token,
			guild.id,
			'calendar',
			ChannelTypes.GUILD_CALENDAR,
		);

		const initial = await createBuilder<CalendarDataResponse>(harness, owner.token)
			.get(`/channels/${calendarChannel.id}/calendar`)
			.expect(HTTP_STATUS.OK)
			.execute();

		expect(initial.version).toBe(0);

		const events: Array<CalendarEvent> = [
			{
				id: 'event-1',
				title: 'Team Sync',
				start: '2026-03-01',
				end: '2026-03-01',
				allDay: true,
				color: '#5865f2',
			},
		];

		await createBuilder<CalendarDataResponse>(harness, owner.token)
			.put(`/channels/${calendarChannel.id}/calendar`)
			.body({events, expected_version: 0})
			.expect(HTTP_STATUS.OK)
			.execute();

		await createBuilder(harness, owner.token)
			.put(`/channels/${calendarChannel.id}/calendar`)
			.body({events, expected_version: 0})
			.expect(HTTP_STATUS.CONFLICT)
			.executeWithResponse();
	});

	test('rsvp update returns 404 when target event does not exist', async () => {
		const owner = await createTestAccount(harness);
		const guild = await createGuild(harness, owner.token, 'Calendar RSVP Guild');
		const calendarChannel = await createChannel(
			harness,
			owner.token,
			guild.id,
			'calendar',
			ChannelTypes.GUILD_CALENDAR,
		);

		await createBuilder(harness, owner.token)
			.put(`/channels/${calendarChannel.id}/calendar/events/nonexistent-event/rsvp`)
			.body({status: 'going'})
			.expect(HTTP_STATUS.NOT_FOUND)
			.executeWithResponse();
	});
});
