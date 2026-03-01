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

import type {ChannelID} from '@fluxer/api/src/BrandedTypes';
import {Config} from '@fluxer/api/src/Config';
import type {IGatewayService} from '@fluxer/api/src/infrastructure/IGatewayService';
import type {IStorageService} from '@fluxer/api/src/infrastructure/IStorageService';
import {Logger} from '@fluxer/api/src/Logger';
import type {Channel} from '@fluxer/api/src/models/Channel';
import {CalendarEventNotFoundError} from '@fluxer/errors/src/domains/calendar/CalendarEventNotFoundError';
import {CalendarVersionConflictError} from '@fluxer/errors/src/domains/calendar/CalendarVersionConflictError';
import type {
	CalendarDataResponse,
	CalendarRsvpStatus,
	CalendarSaveRequest,
} from '@fluxer/schema/src/domains/calendar/CalendarSchemas';

const MAX_CALENDAR_BYTES = 4 * 1024 * 1024; // 4 MB

function calendarKey(channelId: ChannelID): string {
	return `calendars/${channelId}.json`;
}

export class CalendarService {
	constructor(
		private readonly storageService: IStorageService,
		private readonly gatewayService: IGatewayService,
	) {}

	async getCalendarData(channelId: ChannelID): Promise<CalendarDataResponse | null> {
		try {
			const data = await this.storageService.readObject(Config.s3.buckets.cdn, calendarKey(channelId));
			try {
				const parsed = JSON.parse(new TextDecoder().decode(data)) as CalendarDataResponse;
				return parsed;
			} catch {
				Logger.error({channelId: channelId.toString()}, 'Corrupted calendar JSON in S3; resetting to empty');
				return null;
			}
		} catch (error: unknown) {
			const isNotFound =
				(error instanceof Error && error.name === 'S3Error' && 'code' in error && error.code === 'NoSuchKey') ||
				(error instanceof Error &&
					(error.message.includes('NoSuchKey') ||
						error.message.includes('does not exist') ||
						error.message.includes('not found') ||
						error.message.includes('404')));
			if (isNotFound) {
				return null;
			}
			Logger.error({error, channelId: channelId.toString()}, 'Failed to read calendar data from S3');
			throw error;
		}
	}

	async saveCalendarData(
		channelId: ChannelID,
		data: CalendarSaveRequest,
		channel: Channel,
		senderUserId: string,
	): Promise<CalendarDataResponse> {
		const existing = await this.getCalendarData(channelId);
		const currentVersion = existing?.version ?? 0;

		if (data.expected_version !== currentVersion) {
			throw new CalendarVersionConflictError(data.expected_version, currentVersion);
		}

		const version = currentVersion + 1;

		const payload: CalendarDataResponse = {
			events: data.events,
			version,
		};

		return this.persistCalendarData(channelId, payload, channel, senderUserId, data.client_nonce);
	}

	async updateEventRsvp(
		channelId: ChannelID,
		eventId: string,
		status: CalendarRsvpStatus | null,
		channel: Channel,
		senderUserId: string,
		clientNonce?: string,
	): Promise<CalendarDataResponse> {
		const existing =
			(await this.getCalendarData(channelId)) ??
			({
				events: [],
				version: 0,
			} satisfies CalendarDataResponse);

		let updated = false;
		const nextEvents = existing.events.map((event) => {
			if (event.id !== eventId) {
				return event;
			}

			updated = true;
			const nextRsvpByUserId = {
				...(event.rsvpByUserId ?? {}),
			};

			if (status === null) {
				delete nextRsvpByUserId[senderUserId];
			} else {
				nextRsvpByUserId[senderUserId] = status;
			}

			return {
				...event,
				rsvpByUserId: nextRsvpByUserId,
			};
		});

		if (!updated) {
			throw new CalendarEventNotFoundError(eventId);
		}

		const payload: CalendarDataResponse = {
			events: nextEvents,
			version: existing.version + 1,
		};

		return this.persistCalendarData(channelId, payload, channel, senderUserId, clientNonce);
	}

	private async persistCalendarData(
		channelId: ChannelID,
		payload: CalendarDataResponse,
		channel: Channel,
		senderUserId: string,
		clientNonce?: string,
	): Promise<CalendarDataResponse> {

		const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

		if (jsonBytes.length > MAX_CALENDAR_BYTES) {
			throw new Error('Calendar data exceeds maximum size of 4 MB');
		}

		await this.storageService.uploadObject({
			bucket: Config.s3.buckets.cdn,
			key: calendarKey(channelId),
			body: jsonBytes,
			contentType: 'application/json; charset=utf-8',
		});

		// Broadcast a lightweight notification to all users viewing this channel.
		try {
			const eventData = {
				channel_id: channelId.toString(),
				user_id: senderUserId,
				client_nonce: clientNonce,
				version: payload.version,
			};

			if (channel.guildId) {
				await this.gatewayService.dispatchGuild({
					guildId: channel.guildId,
					event: 'CALENDAR_UPDATE',
					data: eventData,
				});
			}
		} catch (error) {
			Logger.error({error}, 'Failed to dispatch calendar update event');
		}

		return payload;
	}
}
