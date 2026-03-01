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

import {Endpoints} from '@app/Endpoints';
import http from '@app/lib/HttpClient';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import ChannelStore from '@app/stores/ChannelStore';
import GuildMemberStore from '@app/stores/GuildMemberStore';
import NotificationStore from '@app/stores/NotificationStore';
import SelectedChannelStore from '@app/stores/SelectedChannelStore';
import * as NotificationUtils from '@app/utils/NotificationUtils';
import {action, makeAutoObservable, observable} from 'mobx';

export interface CalendarRemoteUpdate {
	channel_id: string;
	user_id: string;
	client_nonce?: string;
	version: number;
}

interface CalendarEventNotificationData {
	id: string;
	assignedUserIds?: Array<string>;
	assignedRoleIds?: Array<string>;
}

interface CalendarDataResponse {
	events: Array<CalendarEventNotificationData>;
	version: number;
}

type UpdateListener = (update: CalendarRemoteUpdate) => void;

class CalendarStore {
	/** Latest version per channel, for conflict detection */
	versions: Record<string, number> = {};
	notifiedEventIdsByChannel: Record<string, Array<string>> = {};
	unreadNotifiedEventIdsByChannel: Record<string, Array<string>> = {};
	private knownAssignedEventsByChannel: Record<string, Array<string>> = {};
	private processingChannels = new Set<string>();

	/** Listeners for remote updates, keyed by channelId */
	private listeners: Record<string, Set<UpdateListener>> = {};

	constructor() {
		makeAutoObservable(this, {versions: observable}, {autoBind: true});
	}

	@action
	handleRemoteUpdate(update: CalendarRemoteUpdate): void {
		this.versions[update.channel_id] = update.version;
		void this.refreshNotificationsForChannel(update.channel_id, update.user_id);

		const channelListeners = this.listeners[update.channel_id];
		if (channelListeners) {
			for (const listener of channelListeners) {
				listener(update);
			}
		}
	}

	private async refreshNotificationsForChannel(channelId: string, actorUserId: string): Promise<void> {
		if (this.processingChannels.has(channelId)) {
			return;
		}

		this.processingChannels.add(channelId);
		try {
			const response = await http.get<CalendarDataResponse>({
				url: Endpoints.CHANNEL_CALENDAR(channelId),
			});
			this.reconcileChannelEvents(channelId, response.body.events ?? [], {
				markUnread: true,
				actorUserId,
			});
		} catch {
			// ignore failures here; calendar view still performs explicit fetches
		} finally {
			this.processingChannels.delete(channelId);
		}
	}

	private isEventAssignedToCurrentUser(channelId: string, event: CalendarEventNotificationData): boolean {
		const currentUserId = AuthenticationStore.currentUserId;
		if (!currentUserId) {
			return false;
		}

		if (event.assignedUserIds?.includes(currentUserId)) {
			return true;
		}

		const channel = ChannelStore.getChannel(channelId);
		const guildId = channel?.guildId;
		if (!guildId || !event.assignedRoleIds || event.assignedRoleIds.length === 0) {
			return false;
		}

		const currentMember = GuildMemberStore.getMember(guildId, currentUserId);
		if (!currentMember) {
			return false;
		}

		for (const roleId of event.assignedRoleIds) {
			if (currentMember.roles.has(roleId)) {
				return true;
			}
		}

		return false;
	}

	reconcileChannelEvents(
		channelId: string,
		events: Array<CalendarEventNotificationData>,
		options?: {markUnread?: boolean; actorUserId?: string},
	): void {
		const previouslyAssignedIds = new Set(this.knownAssignedEventsByChannel[channelId] ?? []);
		const currentAssignedIds = new Set<string>();
		const unreadIds = new Set(this.unreadNotifiedEventIdsByChannel[channelId] ?? []);
		const notifiedIds = new Set(this.notifiedEventIdsByChannel[channelId] ?? []);
		let hasNewUnreadNotifications = false;

		for (const event of events) {
			if (!this.isEventAssignedToCurrentUser(channelId, event)) {
				continue;
			}

			currentAssignedIds.add(event.id);
			notifiedIds.add(event.id);

			const becameAssigned = !previouslyAssignedIds.has(event.id);
			const shouldMarkUnread = Boolean(options?.markUnread && becameAssigned);
			const isSelfAction = options?.actorUserId && options.actorUserId === AuthenticationStore.currentUserId;
			if (shouldMarkUnread && !isSelfAction) {
				if (!unreadIds.has(event.id)) {
					hasNewUnreadNotifications = true;
				}
				unreadIds.add(event.id);
			}
		}

		for (const eventId of Array.from(notifiedIds)) {
			if (!currentAssignedIds.has(eventId)) {
				notifiedIds.delete(eventId);
				unreadIds.delete(eventId);
			}
		}

		this.knownAssignedEventsByChannel[channelId] = Array.from(currentAssignedIds);
		this.notifiedEventIdsByChannel[channelId] = Array.from(notifiedIds);
		this.unreadNotifiedEventIdsByChannel[channelId] = Array.from(unreadIds);

		const shouldPlaySound =
			hasNewUnreadNotifications &&
			(!NotificationStore.isFocused() || SelectedChannelStore.currentChannelId !== channelId);
		if (shouldPlaySound) {
			NotificationUtils.playNotificationSoundIfEnabled();
		}
	}

	markChannelNotificationsRead(channelId: string): void {
		this.unreadNotifiedEventIdsByChannel[channelId] = [];
	}

	markEventNotificationRead(channelId: string, eventId: string): void {
		const unreadIds = new Set(this.unreadNotifiedEventIdsByChannel[channelId] ?? []);
		if (!unreadIds.has(eventId)) {
			return;
		}

		unreadIds.delete(eventId);
		this.unreadNotifiedEventIdsByChannel[channelId] = Array.from(unreadIds);
	}

	getUnreadNotificationCount(channelId: string): number {
		return this.unreadNotifiedEventIdsByChannel[channelId]?.length ?? 0;
	}

	isEventNotified(channelId: string, eventId: string): boolean {
		return (this.notifiedEventIdsByChannel[channelId] ?? []).includes(eventId);
	}

	isEventUnreadNotification(channelId: string, eventId: string): boolean {
		return (this.unreadNotifiedEventIdsByChannel[channelId] ?? []).includes(eventId);
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
}

export default new CalendarStore();
