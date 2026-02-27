// SPDX-License-Identifier: AGPL-3.0-or-later

import type {RouteRateLimitConfig} from '@app/api/middleware/RateLimitMiddleware';
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
