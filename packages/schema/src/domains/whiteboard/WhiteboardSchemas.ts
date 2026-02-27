// SPDX-License-Identifier: AGPL-3.0-or-later

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
