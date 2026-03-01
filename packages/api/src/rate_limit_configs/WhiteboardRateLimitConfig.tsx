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

import type {RouteRateLimitConfig} from '@fluxer/api/src/middleware/RateLimitMiddleware';
import {ms} from 'itty-time';

export const WhiteboardRateLimitConfigs = {
	WHITEBOARD_GET: {
		bucket: 'whiteboard:read::channel_id',
		config: {limit: 60, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	WHITEBOARD_SAVE: {
		bucket: 'whiteboard:save::channel_id',
		config: {limit: 30, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,

	/** Cursor updates are throttled on the client to ~100ms; allow up to 600/min (10/s) per user-channel. */
	WHITEBOARD_CURSOR: {
		bucket: 'whiteboard:cursor::channel_id::user_id',
		config: {limit: 600, windowMs: ms('1 minute')},
	} as RouteRateLimitConfig,
};
