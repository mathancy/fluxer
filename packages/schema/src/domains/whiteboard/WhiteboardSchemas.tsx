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

export const WhiteboardSaveRequest = z.object({
	elements: z.array(z.looseObject({})).describe('Excalidraw element array'),
	appState: z.looseObject({}).optional().describe('Excalidraw app state subset to persist'),
	files: z.record(z.string(), z.unknown()).optional().describe('Excalidraw binary files map'),
	client_nonce: z.string().optional().describe('Client-generated nonce echoed back in gateway event to filter own bounces'),
});

export type WhiteboardSaveRequest = z.infer<typeof WhiteboardSaveRequest>;

export const WhiteboardCursorRequest = z.object({
	x: z.number().describe('Canvas X coordinate'),
	y: z.number().describe('Canvas Y coordinate'),
	tool: z.enum(['pointer', 'laser']).optional().default('pointer').describe('Active pointer tool'),
	selectedElementIds: z.array(z.string()).optional().describe('Currently selected element IDs'),
});

export type WhiteboardCursorRequest = z.infer<typeof WhiteboardCursorRequest>;

export const WhiteboardCursorEvent = z.object({
	channel_id: z.string(),
	user_id: z.string(),
	x: z.number(),
	y: z.number(),
	tool: z.enum(['pointer', 'laser']).optional(),
	selectedElementIds: z.array(z.string()).optional(),
});

export type WhiteboardCursorEvent = z.infer<typeof WhiteboardCursorEvent>;

export const WhiteboardDataResponse = z.object({
	elements: z.array(z.looseObject({})).describe('Excalidraw element array'),
	appState: z.looseObject({}).optional().describe('Excalidraw app state subset'),
	files: z.record(z.string(), z.unknown()).optional().describe('Excalidraw binary files map'),
	version: z.number().describe('Version counter for the whiteboard data'),
});

export type WhiteboardDataResponse = z.infer<typeof WhiteboardDataResponse>;
