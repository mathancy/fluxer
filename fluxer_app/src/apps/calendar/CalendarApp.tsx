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
import {HttpError} from '@app/lib/HttpError';
import http from '@app/lib/HttpClient';
import {MentionBadge} from '@app/components/uikit/MentionBadge';
import {Tooltip} from '@app/components/uikit/tooltip/Tooltip';
import * as ColorUtils from '@app/utils/ColorUtils';
import * as AvatarUtils from '@app/utils/AvatarUtils';
import AuthenticationStore from '@app/stores/AuthenticationStore';
import ChannelStore from '@app/stores/ChannelStore';
import CalendarStore from '@app/stores/CalendarStore';
import GuildMemberStore from '@app/stores/GuildMemberStore';
import GuildStore from '@app/stores/GuildStore';
import PermissionStore from '@app/stores/PermissionStore';
import UserStore from '@app/stores/UserStore';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin from '@fullcalendar/interaction';
import type {DateSelectArg, EventClickArg, EventChangeArg} from '@fullcalendar/core';
import type {EventInput} from '@fullcalendar/core';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import styles from './CalendarApp.module.css';

interface CalendarEvent {
  id: string;
  title: string;
  /** UTC ISO string for timed events ("2026-03-01T14:00:00.000Z"), "YYYY-MM-DD" for all-day */
  start: string;
  /** UTC ISO string or "YYYY-MM-DD" (inclusive end date for all-day events) */
  end?: string;
  allDay?: boolean;
  color?: string;
  description?: string;
  assignedUserIds?: Array<string>;
  assignedRoleIds?: Array<string>;
  rsvpByUserId?: EventRsvpMap;
}

type EventRsvpStatus = 'going' | 'maybe' | 'declined';
type EventRsvpMap = Record<string, EventRsvpStatus>;

interface CalendarData {
  events: Array<CalendarEvent>;
  version: number;
}

interface CalendarAppProps {
  channelId: string;
}

interface EventDialog {
  open: boolean;
  id: string | null;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  color: string;
  description: string;
  invitedUserIds: Array<string>;
  invitedRoleIds: Array<string>;
  invitedSearch: string;
}

interface EventViewDialog {
  open: boolean;
  eventId: string | null;
}

interface InviteOption {
  id: string;
  kind: 'role' | 'user';
  label: string;
  subtitle?: string;
  search: string;
  color?: string;
}

const DEFAULT_COLOR = '#5865f2';

const EMPTY_DIALOG: EventDialog = {
  open: false,
  id: null,
  title: '',
  startDate: '',
  endDate: '',
  startTime: '09:00',
  endTime: '10:00',
  allDay: false,
  color: DEFAULT_COLOR,
  description: '',
  invitedUserIds: [],
  invitedRoleIds: [],
  invitedSearch: '',
};

const EMPTY_VIEW_DIALOG: EventViewDialog = {
  open: false,
  eventId: null,
};

function dateToLocalDate(d: Date): string {
  return dateToLocalInput(d).slice(0, 10);
}

function dateToLocalTime(d: Date): string {
  return dateToLocalInput(d).slice(11, 16);
}

/**
 * Format a Date object to a local datetime-local input value ("YYYY-MM-DDTHH:mm").
 * Uses the browser's local timezone.
 */
function dateToLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/**
 * Convert a stored event start/end string to a local datetime-local input value.
 * Stored strings are either UTC ISO ("2026-03-01T14:00:00.000Z") or date-only ("2026-03-01").
 */
function storedToLocalInput(stored: string, defaultHour = 9): string {
  if (stored.includes('T') || stored.endsWith('Z')) {
    return dateToLocalInput(new Date(stored));
  }
  // Date-only — append a default local time for the input
  return `${stored}T${String(defaultHour).padStart(2, '0')}:00`;
}

function storedToLocalDate(stored: string, defaultHour = 9): string {
  return storedToLocalInput(stored, defaultHour).slice(0, 10);
}

function storedToLocalTime(stored: string, defaultHour = 9): string {
  return storedToLocalInput(stored, defaultHour).slice(11, 16);
}

function localDateAndTimeToUtc(date: string, time: string): string {
  return new Date(`${date}T${time}`).toISOString();
}

function addDaysToDateString(date: string, days: number): string {
  const dateValue = new Date(`${date}T00:00:00`);
  dateValue.setDate(dateValue.getDate() + days);
  return dateToLocalDate(dateValue);
}

function normalizeRsvpMap(rsvpByUserId?: EventRsvpMap): EventRsvpMap | undefined {
  if (!rsvpByUserId) {
    return undefined;
  }

  return Object.keys(rsvpByUserId).length > 0 ? rsvpByUserId : undefined;
}

function formatEventDateSummary(event: CalendarEvent): string {
  const dateFormatter = new Intl.DateTimeFormat(undefined, {month: 'short', day: 'numeric', year: 'numeric'});
  const timeFormatter = new Intl.DateTimeFormat(undefined, {hour: 'numeric', minute: '2-digit'});

  if (event.allDay) {
    const startDate = new Date(event.start);
    if (!event.end || event.end === event.start) {
      return `${dateFormatter.format(startDate)} · All day`;
    }
    const endDate = new Date(event.end);
    return `${dateFormatter.format(startDate)} – ${dateFormatter.format(endDate)} · All day`;
  }

  const startDate = new Date(event.start);
  if (!event.end) {
    return `${dateFormatter.format(startDate)} · ${timeFormatter.format(startDate)}`;
  }

  const endDate = new Date(event.end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    return `${dateFormatter.format(startDate)} · ${timeFormatter.format(startDate)} – ${timeFormatter.format(endDate)}`;
  }

  return `${dateFormatter.format(startDate)} ${timeFormatter.format(startDate)} – ${dateFormatter.format(endDate)} ${timeFormatter.format(endDate)}`;
}

/** Map stored events to FullCalendar EventInput objects. */
function toEventInputs(events: Array<CalendarEvent>, channelId: string): Array<EventInput> {
  return events.map(ev => ({
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.allDay && ev.end ? addDaysToDateString(ev.end, 1) : ev.end,
    allDay: ev.allDay ?? false,
    backgroundColor: ev.color,
    borderColor: ev.color,
    extendedProps: {
      description: ev.description ?? '',
      hasUnreadNotification: CalendarStore.isEventUnreadNotification(channelId, ev.id),
    },
  }));
}

export function CalendarApp({channelId}: CalendarAppProps) {
  const [events, setEvents] = useState<Array<CalendarEvent>>([]);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<EventDialog>(EMPTY_DIALOG);
  const [viewDialog, setViewDialog] = useState<EventViewDialog>(EMPTY_VIEW_DIALOG);
  const currentChannelRef = useRef(channelId);
  const versionRef = useRef(0);
  const lastMutationNonceRef = useRef<string | null>(null);
  const channel = ChannelStore.getChannel(channelId);
  const guildId = channel?.guildId ?? null;
  const currentUserId = AuthenticationStore.currentUserId;
  const canManageCalendar = channel ? PermissionStore.can(Permissions.MANAGE_CALENDAR, channel) : false;
  const memberCount = guildId ? GuildMemberStore.getMemberCount(guildId) : 0;

  const inviteOptions = useMemo(() => {
    if (!guildId) {
      return [] as Array<InviteOption>;
    }

    const roleOptions: Array<InviteOption> = GuildStore.getGuildRoles(guildId, false).map((role) => {
      const roleName = role.name || 'Role';
      return {
        id: role.id,
        kind: 'role',
        label: roleName,
        search: `${roleName} role`.toLowerCase(),
        color: role.color ? ColorUtils.int2rgb(role.color) : undefined,
      };
    });

    const memberOptions: Array<InviteOption> = GuildMemberStore.getMembers(guildId).map((member) => {
      const username = member.user.username;
      const displayName = member.nick ?? member.user.globalName ?? username;
      return {
        id: member.user.id,
        kind: 'user',
        label: displayName,
        subtitle: `@${username}`,
        search: `${displayName} ${username} user`.toLowerCase(),
      };
    });

    return [...roleOptions, ...memberOptions];
  }, [guildId, memberCount]);

  const filteredInviteOptions = useMemo(() => {
    const query = dialog.invitedSearch.trim().toLowerCase();
    if (!query) {
      return inviteOptions;
    }

    return inviteOptions.filter((option) => option.search.includes(query));
  }, [dialog.invitedSearch, inviteOptions]);

  const viewedEvent = useMemo(
    () => (viewDialog.eventId ? events.find((eventItem) => eventItem.id === viewDialog.eventId) ?? null : null),
    [events, viewDialog.eventId],
  );

  const currentUserRsvp = useMemo(() => {
    if (!currentUserId || !viewedEvent) {
      return null;
    }
    return viewedEvent.rsvpByUserId?.[currentUserId] ?? null;
  }, [currentUserId, viewedEvent]);

  const confirmedAttendeeIds = useMemo(() => {
    if (!viewedEvent?.rsvpByUserId) {
      return [] as Array<string>;
    }

    return Object.entries(viewedEvent.rsvpByUserId)
      .filter(([, status]) => status === 'going')
      .map(([userId]) => userId);
  }, [viewedEvent]);

  const confirmedAttendees = useMemo(
    () =>
      confirmedAttendeeIds
        .map((userId) => {
          const user = UserStore.getUser(userId);
          if (!user) {
            return null;
          }

          const displayName = user.displayName || user.globalName || user.username;
          return {
            id: userId,
            name: displayName,
            avatarUrl: AvatarUtils.getUserAvatarURL(user),
          };
        })
        .filter((attendee): attendee is {id: string; name: string; avatarUrl: string} => attendee != null),
    [confirmedAttendeeIds],
  );

  const confirmedNameList = useMemo(() => confirmedAttendees.map((attendee) => attendee.name), [confirmedAttendees]);

  const isCurrentUserConfirmed = currentUserRsvp === 'going';

  useEffect(() => {
    versionRef.current = version;
  }, [version]);

  const reloadCalendar = useCallback(async () => {
    const res = await http.get<CalendarData>({
      url: Endpoints.CHANNEL_CALENDAR(channelId),
    });

    const nextEvents = res.body.events ?? [];
    const nextVersion = res.body.version ?? 0;
    CalendarStore.reconcileChannelEvents(channelId, nextEvents, {markUnread: false});
    setEvents(nextEvents);
    setVersion(nextVersion);
  }, [channelId]);

  const openEditDialogForEvent = useCallback((eventData: CalendarEvent) => {
    setDialog({
      open: true,
      id: eventData.id,
      title: eventData.title,
      startDate: storedToLocalDate(eventData.start, 9),
      endDate: eventData.end ? storedToLocalDate(eventData.end, 10) : storedToLocalDate(eventData.start, 10),
      startTime: storedToLocalTime(eventData.start, 9),
      endTime: eventData.end ? storedToLocalTime(eventData.end, 10) : storedToLocalTime(eventData.start, 10),
      allDay: eventData.allDay ?? false,
      color: eventData.color ?? DEFAULT_COLOR,
      description: eventData.description ?? '',
      invitedUserIds: eventData.assignedUserIds ?? [],
      invitedRoleIds: eventData.assignedRoleIds ?? [],
      invitedSearch: '',
    });
  }, []);

  useEffect(() => {
    currentChannelRef.current = channelId;
    setLoading(true);
    setEvents([]);
    setVersion(0);
    setDialog(EMPTY_DIALOG);
    setViewDialog(EMPTY_VIEW_DIALOG);
    let cancelled = false;

    async function load() {
      try {
        const res = await http.get<CalendarData>({url: Endpoints.CHANNEL_CALENDAR(channelId)});
        if (cancelled || currentChannelRef.current !== channelId) return;
        const nextEvents = res.body.events ?? [];
        const nextVersion = res.body.version ?? 0;
        CalendarStore.reconcileChannelEvents(channelId, nextEvents, {markUnread: false});
        setEvents(nextEvents);
        setVersion(nextVersion);
      } catch {
        if (!cancelled) {
          setEvents([]);
          setVersion(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  useEffect(() => {
    if (!dialog.open || !guildId) {
      return;
    }

    GuildMemberStore.fetchMembers(guildId, {query: '', limit: 0, presences: false}).catch(() => {
      // ignore member fetch failures; picker will still show cached members
    });

    if (dialog.invitedUserIds.length > 0) {
      GuildMemberStore.ensureMembersLoaded(guildId, dialog.invitedUserIds).catch(() => {
        // ignore member fetch failures
      });
    }
  }, [dialog.open, dialog.invitedUserIds, guildId]);

  useEffect(() => {
    if (!dialog.open || !guildId) {
      return;
    }

    const query = dialog.invitedSearch.trim();
    if (query.length < 2) {
      return;
    }

    GuildMemberStore.fetchMembers(guildId, {query, limit: 100, presences: false}).catch(() => {
      // ignore member search failures
    });
  }, [dialog.open, dialog.invitedSearch, guildId]);

  // Subscribe to live CALENDAR_UPDATE gateway events — refetch on remote update
  useEffect(() => {
    const unsub = CalendarStore.subscribe(channelId, (update) => {
      if (update.client_nonce && update.client_nonce === lastMutationNonceRef.current) {
        return;
      }

      if (currentUserId && String(update.user_id) === String(currentUserId)) {
        return;
      }

      if (typeof update.version === 'number' && update.version <= versionRef.current) {
        return;
      }

      void reloadCalendar().catch(() => {
        // ignore sync failures
      });
    });
    return () => unsub?.();
  }, [channelId, currentUserId, reloadCalendar]);

  /** Open create dialog when user selects a date/time range on the calendar. */
  const handleDateSelect = useCallback((arg: DateSelectArg) => {
    if (!canManageCalendar) {
      return;
    }

    const isTimeGrid = arg.view.type.startsWith('timeGrid');
    if (isTimeGrid) {
      setDialog({
        ...EMPTY_DIALOG,
        open: true,
        startDate: dateToLocalDate(arg.start),
        endDate: dateToLocalDate(arg.end),
        startTime: dateToLocalTime(arg.start),
        endTime: dateToLocalTime(arg.end),
        allDay: false,
      });
    } else {
      const allDayInclusiveEnd = new Date(arg.end);
      allDayInclusiveEnd.setDate(allDayInclusiveEnd.getDate() - 1);
      setDialog({
        ...EMPTY_DIALOG,
        open: true,
        startDate: dateToLocalDate(arg.start),
        endDate: dateToLocalDate(allDayInclusiveEnd),
        startTime: '09:00',
        endTime: '10:00',
        allDay: true,
      });
    }
  }, [canManageCalendar]);

  /** Open edit dialog when user clicks an existing event. */
  const handleEventClick = useCallback((arg: EventClickArg) => {
    const ev = arg.event;
    const stored = events.find(e => e.id === ev.id);
    if (!stored) return;
    CalendarStore.markEventNotificationRead(channelId, ev.id);
    setViewDialog({open: true, eventId: stored.id});
  }, [channelId, events]);

  /** Handle drag-and-drop / resize event changes. */
  const handleEventChange = useCallback(async (arg: EventChangeArg) => {
    if (!canManageCalendar) {
      arg.revert();
      return;
    }

    const ev = arg.event;
    const existing = events.find((eventItem) => eventItem.id === ev.id);
    const nextStart = ev.allDay ? ev.startStr.slice(0, 10) : ev.startStr;
    const nextEnd = ev.allDay
      ? (ev.endStr ? addDaysToDateString(ev.endStr.slice(0, 10), -1) : nextStart)
      : (ev.endStr || undefined);
    const updated: CalendarEvent = {
      id: ev.id,
      title: ev.title,
      start: nextStart,
      end: nextEnd,
      allDay: ev.allDay,
      color: (ev.backgroundColor as string) || DEFAULT_COLOR,
      description: existing?.description ?? (ev.extendedProps as {description?: string}).description ?? '',
      assignedUserIds: existing?.assignedUserIds ?? [],
      assignedRoleIds: existing?.assignedRoleIds ?? [],
      rsvpByUserId: normalizeRsvpMap(existing?.rsvpByUserId),
    };
    const newEvents = events.map(e => (e.id === ev.id ? updated : e));
    const nonce = crypto.randomUUID();
    lastMutationNonceRef.current = nonce;
    setEvents(newEvents);
    try {
      const response = await http.put<CalendarData>({
        url: Endpoints.CHANNEL_CALENDAR(channelId),
        body: {events: newEvents, expected_version: version, client_nonce: nonce},
      });
      const nextEvents = response.body.events ?? [];
      CalendarStore.reconcileChannelEvents(channelId, nextEvents, {markUnread: false});
      setEvents(nextEvents);
      setVersion(response.body.version ?? version + 1);
    } catch (error) {
      arg.revert();
      if (error instanceof HttpError && error.status === 409) {
        void reloadCalendar().catch(() => {
          // ignore conflict reload failures
        });
      }
    }
  }, [canManageCalendar, channelId, events, reloadCalendar, version]);

  const handleAllDayToggle = useCallback(() => {
    setDialog(prev => {
      if (prev.allDay) {
        return {
          ...prev,
          allDay: false,
          startTime: prev.startTime || '09:00',
          endTime: prev.endTime || '10:00',
        };
      }
      return {
        ...prev,
        allDay: true,
      };
    });
  }, []);

  const toggleInvited = useCallback((kind: 'role' | 'user', id: string) => {
    setDialog((prev) => {
      if (kind === 'role') {
        const exists = prev.invitedRoleIds.includes(id);
        return {
          ...prev,
          invitedRoleIds: exists ? prev.invitedRoleIds.filter((roleId) => roleId !== id) : [...prev.invitedRoleIds, id],
        };
      }

      const exists = prev.invitedUserIds.includes(id);
      return {
        ...prev,
        invitedUserIds: exists ? prev.invitedUserIds.filter((userId) => userId !== id) : [...prev.invitedUserIds, id],
      };
    });
  }, []);

  const handleDialogSave = useCallback(async () => {
    if (!canManageCalendar) {
      return;
    }

    const {
      id,
      title,
      startDate,
      endDate,
      startTime,
      endTime,
      allDay,
      color,
      description,
      invitedUserIds,
      invitedRoleIds,
    } = dialog;
    if (!title.trim()) return;
    if (!startDate || !endDate) return;

    let startStored: string;
    let endStored: string | undefined;
    if (allDay) {
      const normalizedEndDate = endDate < startDate ? startDate : endDate;
      startStored = startDate;
      endStored = normalizedEndDate;
    } else {
      if (!startTime || !endTime) return;
      const normalizedEndDate = endDate < startDate ? startDate : endDate;
      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${normalizedEndDate}T${endTime}`);
      const safeEndDateTime = endDateTime < startDateTime ? startDateTime : endDateTime;
      startStored = localDateAndTimeToUtc(startDate, startTime);
      endStored = safeEndDateTime.toISOString();
    }

    const existingEvent = id ? events.find((eventItem) => eventItem.id === id) : null;
    const normalizedDescription = description.trim();
    const eventData: CalendarEvent = {
      id: id ?? crypto.randomUUID(),
      title: title.trim(),
      start: startStored,
      end: endStored,
      allDay,
      color,
      description: normalizedDescription.length > 0 ? normalizedDescription : undefined,
      assignedUserIds: invitedUserIds,
      assignedRoleIds: invitedRoleIds,
      rsvpByUserId: normalizeRsvpMap(existingEvent?.rsvpByUserId),
    };

    const newEvents = id
      ? events.map(e => (e.id === id ? eventData : e))
      : [...events, eventData];

    setDialog(EMPTY_DIALOG);
    setEvents(newEvents);

    const nonce = crypto.randomUUID();
    lastMutationNonceRef.current = nonce;

    try {
      const response = await http.put<CalendarData>({
        url: Endpoints.CHANNEL_CALENDAR(channelId),
        body: {events: newEvents, expected_version: version, client_nonce: nonce},
      });
      const nextEvents = response.body.events ?? [];
      CalendarStore.reconcileChannelEvents(channelId, nextEvents, {markUnread: false});
      setEvents(nextEvents);
      setVersion(response.body.version ?? version + 1);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        void reloadCalendar().catch(() => {
          setEvents(events);
        });
        return;
      }
      setEvents(events);
    }
  }, [canManageCalendar, dialog, channelId, events, reloadCalendar, version]);

  const handleToggleAttendance = useCallback(
    async () => {
      if (!viewDialog.eventId || !currentUserId) {
        return;
      }

      const shouldRetract = isCurrentUserConfirmed;
      const originalEvents = events;
      const updatedEvents = events.map((eventItem) => {
        if (eventItem.id !== viewDialog.eventId) {
          return eventItem;
        }

        const nextRsvpByUserId = {
          ...(eventItem.rsvpByUserId ?? {}),
        };

        if (shouldRetract) {
          delete nextRsvpByUserId[currentUserId];
        } else {
          nextRsvpByUserId[currentUserId] = 'going';
        }

        return {
          ...eventItem,
          rsvpByUserId: nextRsvpByUserId as EventRsvpMap,
        };
      });

      setEvents(updatedEvents);

      const nonce = crypto.randomUUID();
      lastMutationNonceRef.current = nonce;

      try {
        const response = await http.put<CalendarData>({
          url: Endpoints.CHANNEL_CALENDAR_EVENT_RSVP(channelId, viewDialog.eventId),
          body: {status: shouldRetract ? null : 'going', client_nonce: nonce},
        });
        CalendarStore.reconcileChannelEvents(channelId, response.body.events ?? [], {markUnread: false});
        setEvents(response.body.events ?? []);
        setVersion(response.body.version ?? version);
      } catch {
        setEvents(originalEvents);
      }
    },
    [channelId, currentUserId, events, isCurrentUserConfirmed, version, viewDialog.eventId],
  );

  const handleOpenEditFromView = useCallback(() => {
    if (!canManageCalendar || !viewedEvent) {
      return;
    }

    setViewDialog(EMPTY_VIEW_DIALOG);
    openEditDialogForEvent(viewedEvent);
  }, [canManageCalendar, openEditDialogForEvent, viewedEvent]);

  const handleDialogDelete = useCallback(async () => {
    if (!canManageCalendar) {
      return;
    }

    if (!dialog.id) return;
    const newEvents = events.filter(e => e.id !== dialog.id);
    setDialog(EMPTY_DIALOG);
    setEvents(newEvents);

    const nonce = crypto.randomUUID();
    lastMutationNonceRef.current = nonce;

    try {
      const response = await http.put<CalendarData>({
        url: Endpoints.CHANNEL_CALENDAR(channelId),
        body: {events: newEvents, expected_version: version, client_nonce: nonce},
      });
      const nextEvents = response.body.events ?? [];
      CalendarStore.reconcileChannelEvents(channelId, nextEvents, {markUnread: false});
      setEvents(nextEvents);
      setVersion(response.body.version ?? version + 1);
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        void reloadCalendar().catch(() => {
          setEvents(events);
        });
        return;
      }
      setEvents(events);
    }
  }, [canManageCalendar, dialog, channelId, events, reloadCalendar, version]);

  return (
    <div className={styles.container}>
      <div className={styles.calendarWrapper}>
        {loading ? (
          <div className={styles.loading}>Loading calendar…</div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            timeZone="local"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth',
            }}
            stickyHeaderDates={false}
            selectable={canManageCalendar}
            editable={canManageCalendar}
            selectMirror
            dayMaxEvents
            events={toEventInputs(events, channelId)}
            eventContent={(arg) => {
              const hasUnreadNotification = Boolean(
                (arg.event.extendedProps as {hasUnreadNotification?: boolean}).hasUnreadNotification,
              );
              return (
                <div className={styles.eventContentRow}>
                  {hasUnreadNotification && <MentionBadge mentionCount={1} size="small" />}
                  <span className={styles.eventContentText}>
                    {arg.timeText ? `${arg.timeText} ` : ''}
                    {arg.event.title}
                  </span>
                </div>
              );
            }}
            select={handleDateSelect}
            eventClick={handleEventClick}
            eventChange={handleEventChange}
            height="100%"
            slotLabelFormat={{hour: 'numeric', minute: '2-digit', meridiem: 'short'}}
            eventTimeFormat={{hour: 'numeric', minute: '2-digit', meridiem: 'short'}}
          />
        )}
      </div>

      {viewDialog.open && viewedEvent && (
        <div className={styles.dialogOverlay}>
          <div className={styles.viewCard}>
            <div className={styles.viewHeader}>
              <div className={styles.viewColorDot} style={{backgroundColor: viewedEvent.color ?? DEFAULT_COLOR}} />
              <div className={styles.viewHeaderText}>
                <h3 className={styles.viewTitle}>{viewedEvent.title}</h3>
                <p className={styles.viewTime}>{formatEventDateSummary(viewedEvent)}</p>
              </div>
              {canManageCalendar && (
                <button type="button" className={styles.viewEditButton} onClick={handleOpenEditFromView}>
                  Edit
                </button>
              )}
            </div>

            {viewedEvent.description && <p className={styles.viewDescription}>{viewedEvent.description}</p>}

            <div className={styles.viewSection}>
              <div className={styles.rsvpRow}>
                <p className={styles.viewSectionLabel}>Confirmed Attendees</p>
                <button
                  type="button"
                  className={`${styles.rsvpButton} ${isCurrentUserConfirmed ? styles.rsvpButtonDanger : styles.rsvpButtonActive}`}
                  onClick={handleToggleAttendance}
                >
                  {isCurrentUserConfirmed ? 'Retract' : 'Confirm'}
                </button>
              </div>

              {confirmedAttendees.length > 0 ? (
                <Tooltip
                  text={() => (
                    <div className={styles.confirmedTooltipContent}>
                      <p className={styles.confirmedTooltipTitle}>Confirmed</p>
                      {confirmedNameList.map((name) => (
                        <p key={name} className={styles.confirmedTooltipItem}>
                          {name}
                        </p>
                      ))}
                    </div>
                  )}
                >
                  <div className={styles.confirmedAvatarList}>
                    {confirmedAttendees.map((attendee) => (
                      <img
                        key={attendee.id}
                        src={attendee.avatarUrl}
                        alt={attendee.name}
                        title={attendee.name}
                        className={styles.confirmedAvatar}
                      />
                    ))}
                  </div>
                </Tooltip>
              ) : (
                <p className={styles.noConfirmedText}>No confirmed attendees yet.</p>
              )}
            </div>

            <div className={styles.viewFooter}>
              <button type="button" className={styles.cancelButton} onClick={() => setViewDialog(EMPTY_VIEW_DIALOG)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog.open && (
        <div className={styles.dialogOverlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>{dialog.id ? 'Edit Event' : 'New Event'}</h3>

            <div className={`${styles.formRow} ${styles.titleColorRow}`}>
              <div className={styles.formGroup}>
                <label htmlFor="cal-title" className={styles.label}>Title</label>
                <input
                  id="cal-title"
                  className={styles.input}
                  type="text"
                  value={dialog.title}
                  onChange={e => setDialog(prev => ({...prev, title: e.target.value}))}
                  placeholder="Event title"
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="cal-color" className={styles.label}>Color</label>
                <input
                  id="cal-color"
                  className={styles.colorInput}
                  type="color"
                  value={dialog.color}
                  onChange={e => setDialog(prev => ({...prev, color: e.target.value}))}
                />
              </div>
            </div>

            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="cal-start-date" className={styles.label}>Start Date</label>
                <input
                  id="cal-start-date"
                  className={styles.input}
                  type="date"
                  value={dialog.startDate}
                  onChange={e => {
                    const value = e.target.value;
                    setDialog(prev => ({
                      ...prev,
                      startDate: value,
                      endDate: prev.endDate && prev.endDate < value ? value : prev.endDate,
                    }));
                  }}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="cal-end-date" className={styles.label}>End Date</label>
                <input
                  id="cal-end-date"
                  className={styles.input}
                  type="date"
                  min={dialog.startDate}
                  value={dialog.endDate}
                  onChange={e => setDialog(prev => ({...prev, endDate: e.target.value}))}
                />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={dialog.allDay}
                  onChange={handleAllDayToggle}
                />
                All-day event
              </label>
            </div>

            {!dialog.allDay && (
              <div className={styles.formRow}>
                <div className={styles.formGroup}>
                  <label htmlFor="cal-start-time" className={styles.label}>Start Time</label>
                  <input
                    id="cal-start-time"
                    className={styles.input}
                    type="time"
                    value={dialog.startTime}
                    onChange={e => setDialog(prev => ({...prev, startTime: e.target.value}))}
                  />
                </div>
                <div className={styles.formGroup}>
                  <label htmlFor="cal-end-time" className={styles.label}>End Time</label>
                  <input
                    id="cal-end-time"
                    className={styles.input}
                    type="time"
                    value={dialog.endTime}
                    onChange={e => setDialog(prev => ({...prev, endTime: e.target.value}))}
                  />
                </div>
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="cal-invited-search" className={styles.label}>Invited Users</label>
              <input
                id="cal-invited-search"
                className={styles.input}
                type="text"
                value={dialog.invitedSearch}
                onChange={e => setDialog(prev => ({...prev, invitedSearch: e.target.value}))}
                placeholder="Search roles and users"
              />

              <div className={styles.invitedList}>
                {filteredInviteOptions.map((option) => {
                  const checked = option.kind === 'role'
                    ? dialog.invitedRoleIds.includes(option.id)
                    : dialog.invitedUserIds.includes(option.id);
                  return (
                    <label key={`${option.kind}-${option.id}`} className={styles.invitedItem}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleInvited(option.kind, option.id)}
                      />
                      <span className={styles.invitedMeta}>
                        <span className={styles.invitedLabel} style={option.color ? {color: option.color} : undefined}>{option.label}</span>
                        {option.subtitle && <span className={styles.invitedSubtitle}>{option.subtitle}</span>}
                      </span>
                    </label>
                  );
                })}
                {filteredInviteOptions.length === 0 && (
                  <div className={styles.invitedEmpty}>No matching roles or users.</div>
                )}
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="cal-desc" className={styles.label}>Description</label>
              <textarea
                id="cal-desc"
                className={styles.textarea}
                value={dialog.description}
                onChange={e => setDialog(prev => ({...prev, description: e.target.value}))}
                rows={3}
                placeholder="Optional description"
              />
            </div>

            <div className={styles.dialogActions}>
              {dialog.id && (
                <button type="button" className={styles.deleteButton} onClick={handleDialogDelete}>
                  Delete
                </button>
              )}
              <button type="button" className={styles.cancelButton} onClick={() => setDialog(EMPTY_DIALOG)}>
                Cancel
              </button>
              <button type="button" className={styles.saveButton} onClick={handleDialogSave}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
