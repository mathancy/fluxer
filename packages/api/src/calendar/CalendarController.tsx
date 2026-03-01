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

import {createChannelID} from '@fluxer/api/src/BrandedTypes';
import {LoginRequired} from '@fluxer/api/src/middleware/AuthMiddleware';
import {RateLimitMiddleware} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {OpenAPI} from '@fluxer/api/src/middleware/ResponseTypeMiddleware';
import {RateLimitConfigs} from '@fluxer/api/src/RateLimitConfig';
import type {HonoApp} from '@fluxer/api/src/types/HonoEnv';
import {Validator} from '@fluxer/api/src/Validator';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {ChannelIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {
	CalendarDataResponse,
	CalendarRsvpUpdateRequest,
	CalendarSaveRequest,
} from '@fluxer/schema/src/domains/calendar/CalendarSchemas';
import {z} from 'zod';

const CalendarChannelEventParam = ChannelIdParam.extend({
	event_id: z.string().min(1).max(128),
});

export function CalendarController(app: HonoApp) {
	app.get(
		'/channels/:channel_id/calendar',
		RateLimitMiddleware(RateLimitConfigs.CALENDAR_GET),
		LoginRequired,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'get_calendar',
			summary: 'Get calendar data',
			description: 'Retrieves the calendar events for a channel. Requires view access to the channel.',
			responseSchema: CalendarDataResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Calendars',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			// Verify the user has access to this channel
			await ctx.get('channelService').getChannel({userId, channelId});

			const data = await ctx.get('calendarService').getCalendarData(channelId);
			if (!data) {
				return ctx.json({events: [], version: 0});
			}
			return ctx.json(data);
		},
	);

	app.put(
		'/channels/:channel_id/calendar',
		RateLimitMiddleware(RateLimitConfigs.CALENDAR_SAVE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('json', CalendarSaveRequest),
		OpenAPI({
			operationId: 'save_calendar',
			summary: 'Save calendar data',
			description: 'Saves the calendar events for a channel. Requires manage calendar permission in the channel.',
			responseSchema: CalendarDataResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Calendars',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			const {channel, checkPermission} = await ctx.get('channelService').getChannelAuthenticated({userId, channelId});
			await checkPermission(Permissions.MANAGE_CALENDAR);

			const body = ctx.req.valid('json');
			const result = await ctx.get('calendarService').saveCalendarData(
				channelId,
				body,
				channel,
				userId.toString(),
			);
			return ctx.json(result);
		},
	);

	app.put(
		'/channels/:channel_id/calendar/events/:event_id/rsvp',
		RateLimitMiddleware(RateLimitConfigs.CALENDAR_SAVE),
		LoginRequired,
		Validator('param', CalendarChannelEventParam),
		Validator('json', CalendarRsvpUpdateRequest),
		OpenAPI({
			operationId: 'update_calendar_rsvp',
			summary: 'Update RSVP',
			description:
				'Updates RSVP status for the authenticated user on a calendar event. Requires view access to the channel.',
			responseSchema: CalendarDataResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Calendars',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const {channel_id, event_id} = ctx.req.valid('param');
			const channelId = createChannelID(channel_id);

			const channel = await ctx.get('channelService').getChannel({userId, channelId});
			const body = ctx.req.valid('json');

			const result = await ctx.get('calendarService').updateEventRsvp(
				channelId,
				event_id,
				body.status,
				channel,
				userId.toString(),
				body.client_nonce,
			);

			return ctx.json(result);
		},
	);
}
