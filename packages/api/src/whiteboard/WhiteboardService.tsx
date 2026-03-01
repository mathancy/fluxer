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
import type {WhiteboardCursorRequest, WhiteboardDataResponse, WhiteboardSaveRequest} from '@fluxer/schema/src/domains/whiteboard/WhiteboardSchemas';

const MAX_WHITEBOARD_BYTES = 16 * 1024 * 1024; // 16 MB

function whiteboardKey(channelId: ChannelID): string {
	return `whiteboards/${channelId}.json`;
}

export class WhiteboardService {
	constructor(
		private readonly storageService: IStorageService,
		private readonly gatewayService: IGatewayService,
	) {}

	async getWhiteboardData(channelId: ChannelID): Promise<WhiteboardDataResponse | null> {
		try {
			const data = await this.storageService.readObject(Config.s3.buckets.cdn, whiteboardKey(channelId));
			try {
				const parsed = JSON.parse(new TextDecoder().decode(data)) as WhiteboardDataResponse;
				return parsed;
			} catch {
				// Corrupted JSON in S3 (e.g. from a concurrent-write race) — treat as empty
				Logger.error({channelId: channelId.toString()}, 'Corrupted whiteboard JSON in S3; resetting to empty');
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
			Logger.error({error, channelId: channelId.toString()}, 'Failed to read whiteboard data from S3');
			throw error;
		}
	}

	async saveWhiteboardData(
		channelId: ChannelID,
		data: WhiteboardSaveRequest,
		channel: Channel,
		senderUserId: string,
	): Promise<WhiteboardDataResponse> {
		const existing = await this.getWhiteboardData(channelId);
		const version = (existing?.version ?? 0) + 1;

		const payload: WhiteboardDataResponse = {
			elements: data.elements,
			appState: data.appState,
			files: data.files,
			version,
		};

		const jsonBytes = new TextEncoder().encode(JSON.stringify(payload));

		if (jsonBytes.length > MAX_WHITEBOARD_BYTES) {
			throw new Error('Whiteboard data exceeds maximum size of 16 MB');
		}

		await this.storageService.uploadObject({
			bucket: Config.s3.buckets.cdn,
			key: whiteboardKey(channelId),
			body: jsonBytes,
			contentType: 'application/json; charset=utf-8',
		});

		// Broadcast a lightweight notification to all users viewing this channel.
		// We intentionally omit elements/appState/files here — the full whiteboard
		// data can be many megabytes of freedraw strokes and will exceed NATS's
		// default 1 MB max payload. Clients re-fetch from the server API on receipt.
		try {
			const eventData = {
				channel_id: channelId.toString(),
				user_id: senderUserId,
				client_nonce: data.client_nonce,
				version,
			};

			if (channel.guildId) {
				await this.gatewayService.dispatchGuild({
					guildId: channel.guildId,
					event: 'WHITEBOARD_UPDATE',
					data: eventData,
				});
			}
		} catch (error) {
			Logger.error({error}, 'Failed to dispatch whiteboard update event');
		}

		return payload;
	}

	async broadcastCursorUpdate(
		channelId: ChannelID,
		cursor: WhiteboardCursorRequest,
		channel: Channel,
		senderUserId: string,
	): Promise<void> {
		if (!channel.guildId) return;
		try {
			await this.gatewayService.dispatchGuild({
				guildId: channel.guildId,
				event: 'WHITEBOARD_CURSOR',
				data: {
					channel_id: channelId.toString(),
					user_id: senderUserId,
					x: cursor.x,
					y: cursor.y,
					tool: cursor.tool ?? 'pointer',
					...(cursor.selectedElementIds ? {selectedElementIds: cursor.selectedElementIds} : {}),
				},
			});
		} catch (error) {
			Logger.error({error}, 'Failed to dispatch whiteboard cursor event');
		}
	}
}
