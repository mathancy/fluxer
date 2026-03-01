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
import {ChannelIdParam} from '@fluxer/schema/src/domains/common/CommonParamSchemas';
import {WhiteboardCursorRequest, WhiteboardDataResponse, WhiteboardSaveRequest} from '@fluxer/schema/src/domains/whiteboard/WhiteboardSchemas';
import {z} from 'zod';

export function WhiteboardController(app: HonoApp) {
	app.get(
		'/channels/:channel_id/whiteboard',
		RateLimitMiddleware(RateLimitConfigs.WHITEBOARD_GET),
		LoginRequired,
		Validator('param', ChannelIdParam),
		OpenAPI({
			operationId: 'get_whiteboard',
			summary: 'Get whiteboard data',
			description: 'Retrieves the Excalidraw whiteboard data for a channel. Requires view access to the channel.',
			responseSchema: WhiteboardDataResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Whiteboards',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			// Verify the user has access to this channel
			await ctx.get('channelService').getChannel({userId, channelId});

			const data = await ctx.get('whiteboardService').getWhiteboardData(channelId);
			if (!data) {
				return ctx.json({elements: [], version: 0});
			}
			return ctx.json(data);
		},
	);

	app.put(
		'/channels/:channel_id/whiteboard',
		RateLimitMiddleware(RateLimitConfigs.WHITEBOARD_SAVE),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('json', WhiteboardSaveRequest),
		OpenAPI({
			operationId: 'save_whiteboard',
			summary: 'Save whiteboard data',
			description:
				'Saves the Excalidraw whiteboard data for a channel. Requires send message permissions in the channel.',
			responseSchema: WhiteboardDataResponse,
			statusCode: 200,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Whiteboards',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			// Verify the user has access to this channel
			const channel = await ctx.get('channelService').getChannel({userId, channelId});

			const body = ctx.req.valid('json');
			const result = await ctx.get('whiteboardService').saveWhiteboardData(
				channelId,
				body,
				channel,
				userId.toString(),
			);
			return ctx.json(result);
		},
	);

	app.post(
		'/channels/:channel_id/whiteboard/cursor',
		RateLimitMiddleware(RateLimitConfigs.WHITEBOARD_CURSOR),
		LoginRequired,
		Validator('param', ChannelIdParam),
		Validator('json', WhiteboardCursorRequest),
		OpenAPI({
			operationId: 'post_whiteboard_cursor',
			summary: 'Broadcast cursor position',
			description:
				'Broadcasts the authenticated user\'s cursor position to other users viewing this channel\'s whiteboard.',
			responseSchema: z.object({}),
			statusCode: 204,
			security: ['bearerToken', 'sessionToken'],
			tags: 'Whiteboards',
		}),
		async (ctx) => {
			const userId = ctx.get('user').id;
			const channelId = createChannelID(ctx.req.valid('param').channel_id);

			const channel = await ctx.get('channelService').getChannel({userId, channelId});
			const body = ctx.req.valid('json');

			await ctx.get('whiteboardService').broadcastCursorUpdate(
				channelId,
				body,
				channel,
				userId.toString(),
			);
			return ctx.body(null, 204);
		},
	);}