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

import {z} from 'zod';

export const CalendarRsvpStatusSchema = z.enum(['going', 'maybe', 'declined']);
export type CalendarRsvpStatus = z.infer<typeof CalendarRsvpStatusSchema>;

const CalendarDateSchema = z.iso.date();
const CalendarDateTimeSchema = z.iso.datetime();
const HexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const CalendarEventSchema = z.object({
	id: z.string().describe('Unique event ID (UUID)'),
	title: z.string().min(1).max(255).describe('Event title'),
	start: z.string().describe('ISO 8601 start date/time, or ISO date for all-day events'),
	end: z.string().optional().describe('ISO 8601 end date/time, or ISO date for all-day events'),
	allDay: z.boolean().optional().default(false).describe('Whether the event is an all-day event'),
	color: HexColorSchema.optional().describe('Hex color for the event'),
	description: z
		.preprocess(
			(value) => {
				if (value == null) {
					return undefined;
				}

				if (typeof value === 'string' && value.trim().length === 0) {
					return undefined;
				}

				return value;
			},
			z.string().max(2000).optional(),
		)
		.describe('Optional description or notes'),
	assignedUserIds: z.array(z.string()).optional().default([]).describe('Assigned member user IDs for this event'),
	assignedRoleIds: z.array(z.string()).optional().default([]).describe('Assigned guild role IDs for this event'),
	rsvpByUserId: z
		.preprocess(
			(value) => {
				if (value == null) {
					return undefined;
				}

				if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as Record<string, unknown>).length === 0) {
					return undefined;
				}

				return value;
			},
			z.record(z.string(), CalendarRsvpStatusSchema).optional(),
		)
		.default({})
		.describe('Per-user RSVP status map for this event'),
}).superRefine((event, ctx) => {
	const startPath = ['start'];
	const endPath = ['end'];

	if (event.allDay) {
		if (!CalendarDateSchema.safeParse(event.start).success) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: startPath,
				message: 'All-day event start must be an ISO date (YYYY-MM-DD)',
			});
		}

		if (event.end && !CalendarDateSchema.safeParse(event.end).success) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: endPath,
				message: 'All-day event end must be an ISO date (YYYY-MM-DD)',
			});
		}

		if (event.end && event.end < event.start) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: endPath,
				message: 'All-day event end must be on or after start',
			});
		}

		return;
	}

	if (!CalendarDateTimeSchema.safeParse(event.start).success) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: startPath,
			message: 'Timed event start must be an ISO datetime',
		});
	}

	if (event.end && !CalendarDateTimeSchema.safeParse(event.end).success) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			path: endPath,
			message: 'Timed event end must be an ISO datetime',
		});
	}

	if (event.end) {
		const startTime = new Date(event.start).getTime();
		const endTime = new Date(event.end).getTime();
		if (!Number.isNaN(startTime) && !Number.isNaN(endTime) && endTime < startTime) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: endPath,
				message: 'Timed event end must be on or after start',
			});
		}
	}
});

export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export const CalendarSaveRequest = z.object({
	events: z.array(CalendarEventSchema).describe('Full array of calendar events'),
	expected_version: z.number().int().min(0).describe('Expected current calendar version for optimistic concurrency checks'),
	client_nonce: z.string().optional().describe('Client-generated nonce echoed back in gateway event to filter own bounces'),
});

export type CalendarSaveRequest = z.infer<typeof CalendarSaveRequest>;

export const CalendarRsvpUpdateRequest = z.object({
	status: z
		.union([CalendarRsvpStatusSchema, z.null()])
		.describe('RSVP status for the authenticated user, or null to clear RSVP'),
	client_nonce: z.string().optional().describe('Client-generated nonce echoed back in gateway event to filter own bounces'),
});

export type CalendarRsvpUpdateRequest = z.infer<typeof CalendarRsvpUpdateRequest>;

export const CalendarDataResponse = z.object({
	events: z.array(CalendarEventSchema).describe('Array of calendar events'),
	version: z.number().describe('Version counter for the calendar data'),
});

export type CalendarDataResponse = z.infer<typeof CalendarDataResponse>;

export const CalendarRemoteUpdate = z.object({
	channel_id: z.string(),
	user_id: z.string(),
	client_nonce: z.string().optional(),
	version: z.number(),
});

export type CalendarRemoteUpdate = z.infer<typeof CalendarRemoteUpdate>;
