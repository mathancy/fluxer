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

import {action, makeAutoObservable, observable} from 'mobx';

export interface WhiteboardRemoteUpdate {
	channel_id: string;
	user_id: string;
	client_nonce?: string;
	version: number;
}

export interface WhiteboardCursorEvent {
	channel_id: string;
	guild_id?: string;
	user_id: string;
	x: number;
	y: number;
	tool?: 'pointer' | 'laser';
	selectedElementIds?: string[];
}

type UpdateListener = (update: WhiteboardRemoteUpdate) => void;
type CursorListener = (event: WhiteboardCursorEvent) => void;

class WhiteboardStore {
	/** Latest version per channel, for conflict detection */
	versions: Record<string, number> = {};

	/** Listeners for remote updates, keyed by channelId */
	private listeners: Record<string, Set<UpdateListener>> = {};

	/** Listeners for cursor updates, keyed by channelId */
	private cursorListeners: Record<string, Set<CursorListener>> = {};

	constructor() {
		makeAutoObservable(this, {versions: observable}, {autoBind: true});
	}

	@action
	handleRemoteUpdate(update: WhiteboardRemoteUpdate): void {
		this.versions[update.channel_id] = update.version;

		const channelListeners = this.listeners[update.channel_id];
		if (channelListeners) {
			for (const listener of channelListeners) {
				listener(update);
			}
		}
	}

	subscribe(channelId: string, listener: UpdateListener): () => void {
		if (!this.listeners[channelId]) {
			this.listeners[channelId] = new Set();
		}
		this.listeners[channelId].add(listener);

		return () => {
			this.listeners[channelId]?.delete(listener);
			if (this.listeners[channelId]?.size === 0) {
				delete this.listeners[channelId];
			}
		};
	}

	@action
	handleCursorUpdate(event: WhiteboardCursorEvent): void {
		const channelListeners = this.cursorListeners[event.channel_id];
		if (channelListeners) {
			for (const listener of channelListeners) {
				listener(event);
			}
		}
	}

	subscribeCursor(channelId: string, listener: CursorListener): () => void {
		if (!this.cursorListeners[channelId]) {
			this.cursorListeners[channelId] = new Set();
		}
		this.cursorListeners[channelId].add(listener);

		return () => {
			this.cursorListeners[channelId]?.delete(listener);
			if (this.cursorListeners[channelId]?.size === 0) {
				delete this.cursorListeners[channelId];
			}
		};
	}

	@action
	reset(): void {
		this.versions = {};
		this.listeners = {};
		this.cursorListeners = {};
	}
}

export default new WhiteboardStore();
