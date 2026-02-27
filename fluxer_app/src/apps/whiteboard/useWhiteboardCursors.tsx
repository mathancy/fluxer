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
import GuildMemberStore from '@app/stores/GuildMemberStore';
import UserStore from '@app/stores/UserStore';
import WhiteboardStore from '@app/stores/WhiteboardStore';
import type {WhiteboardCursorEvent} from '@app/stores/WhiteboardStore';
import * as AvatarUtils from '@app/utils/AvatarUtils';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {RefObject} from 'react';

// Deterministic per-user cursor color derived from userId.
const CURSOR_COLORS = [
	{background: '#4dacff', stroke: '#1971c2'},
	{background: '#69db7c', stroke: '#2f9e44'},
	{background: '#ffa94d', stroke: '#e67700'},
	{background: '#f783ac', stroke: '#c2255c'},
	{background: '#da77f2', stroke: '#9c36b5'},
	{background: '#74c0fc', stroke: '#1c7ed6'},
	{background: '#f0c070', stroke: '#c58c00'},
	{background: '#ff8787', stroke: '#c92a2a'},
];

function colorForUserId(userId: string): {background: string; stroke: string} {
	let hash = 0;
	for (let i = 0; i < userId.length; i++) {
		hash = ((hash * 31 + userId.charCodeAt(i)) >>> 0);
	}
	return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

/** How long (ms) a cursor remains visible after the last update before being hidden. */
const CURSOR_EXPIRY_MS = 30_000;

/** Minimum interval (ms) between cursor position POST requests. */
const CURSOR_THROTTLE_MS = 100;

/**
 * Exponential smoothing factor: higher = snappier, lower = smoother lag.
 * At 10, the cursor covers ~63% of the remaining distance every 100ms.
 */
const LERP_FACTOR = 8;

export interface CursorOverlayEntry {
	/** Container-relative CSS left position in px. */
	relX: number;
	/** Container-relative CSS top position in px. */
	relY: number;
	color: {background: string; stroke: string};
	avatarUrl?: string;
	username?: string;
	/** Pre-computed CSS bounding boxes for selected elements. */
	selectionBoxes?: Array<{relX: number; relY: number; relW: number; relH: number}>;
}

interface UseWhiteboardCursorsResult {
	/** HTML overlay data for rendering avatar images and selection boxes. */
	overlayData: Map<string, CursorOverlayEntry>;
	/** Recompute CSS positions after scroll/zoom — pass into Excalidraw onChange. */
	refreshOverlayPositions: () => void;
	/** Pass as `onPointerUpdate` to <Excalidraw>. */
	handlePointerUpdate: (payload: {
		pointer: {x: number; y: number; tool: 'pointer' | 'laser'};
		button: 'down' | 'up';
	}) => void;
	/** Call when the local user's selection changes (from Excalidraw onChange). */
	handleSelectionChange: (selectedElementIds: Record<string, boolean>) => void;
}

/** Per-user interpolation state, all in scene coordinates. */
type UserCursorState = {
	targetX: number;
	targetY: number;
	currentX: number;
	currentY: number;
	color: {background: string; stroke: string};
	avatarUrl?: string;
	username?: string;
	selectedElementIds?: string[];
	/** Pre-computed CSS selection boxes (updated on event + on scroll/zoom). */
	selectionBoxes?: Array<{relX: number; relY: number; relW: number; relH: number}>;
};

/** Padding (scene px) between element edge and selection border. */
const SELECTION_PADDING = 6;

/** Axis-aligned bounding box for an arbitrary (possibly rotated) element. */
function getElementAABB(el: {
	x: number;
	y: number;
	width: number;
	height: number;
	angle?: number;
	points?: ReadonlyArray<readonly [number, number]>;
}) {
	// For elements with a points array (freedraw, line, arrow) the origin (el.x, el.y)
	// is the reference for relative coords, not necessarily the top-left corner.
	// Compute the true AABB from the actual point extents.
	if (el.points && el.points.length > 0) {
		let minPX = Infinity, minPY = Infinity, maxPX = -Infinity, maxPY = -Infinity;
		for (const [px, py] of el.points) {
			if (px < minPX) minPX = px;
			if (py < minPY) minPY = py;
			if (px > maxPX) maxPX = px;
			if (py > maxPY) maxPY = py;
		}
		return {
			x: el.x + minPX,
			y: el.y + minPY,
			w: maxPX - minPX,
			h: maxPY - minPY,
		};
	}
	// For box-like elements (rectangle, ellipse, diamond, image, text) el.x/y is top-left.
	const angle = el.angle ?? 0;
	if (angle === 0) return {x: el.x, y: el.y, w: el.width, h: el.height};
	const cx = el.x + el.width / 2;
	const cy = el.y + el.height / 2;
	const hw = el.width / 2;
	const hh = el.height / 2;
	const cos = Math.abs(Math.cos(angle));
	const sin = Math.abs(Math.sin(angle));
	const rw = hw * cos + hh * sin;
	const rh = hw * sin + hh * cos;
	return {x: cx - rw, y: cy - rh, w: rw * 2, h: rh * 2};
}

export function useWhiteboardCursors(
	channelId: string,
	excalidrawAPIRef: RefObject<ExcalidrawImperativeAPI | null>,
): UseWhiteboardCursorsResult {
	// Per-user interpolation state (scene coords).
	const cursorStates = useRef<Map<string, UserCursorState>>(new Map());

	// RAF handle.
	const rafId = useRef<number | null>(null);
	const lastFrameTime = useRef<number>(0);

	// HTML overlay state consumed by React.
	const [overlayData, setOverlayData] = useState<Map<string, CursorOverlayEntry>>(new Map());

	// Per-user expiry timers.
	const expiryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

	// Track users we've already requested to avoid duplicate fetches.
	const requestedUsers = useRef<Set<string>>(new Set());

	// Throttle state for outbound cursor POSTs.
	const lastSentAt = useRef<number>(0);
	const pendingFrame = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Last known pointer position (scene coords) for selection-only sends.
	const lastPointerPos = useRef<{x: number; y: number; tool: 'pointer' | 'laser'}>({x: 0, y: 0, tool: 'pointer'});

	const myUserId = AuthenticationStore.userId;

	/** Project scene coords to container-relative CSS px using current appState. */
	const toRelCoords = useCallback(
		(sceneX: number, sceneY: number) => {
			const appState = excalidrawAPIRef.current?.getAppState();
			if (!appState) return null;
			const z = appState.zoom.value;
			return {
				relX: (sceneX + appState.scrollX) * z,
				relY: (sceneY + appState.scrollY) * z,
			};
		},
		[excalidrawAPIRef],
	);

	/** Compute CSS selection boxes for a list of element IDs. */
	const computeSelectionBoxes = useCallback(
		(elementIds: string[]): Array<{relX: number; relY: number; relW: number; relH: number}> => {
			if (elementIds.length === 0) return [];
			const appState = excalidrawAPIRef.current?.getAppState();
			const allElements = excalidrawAPIRef.current?.getSceneElementsIncludingDeleted();
			if (!appState || !allElements) return [];
			const selected = allElements.filter((el) => !el.isDeleted && elementIds.includes(el.id));
			if (selected.length === 0) return [];
			let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
			for (const el of selected) {
				const b = getElementAABB(el as {x: number; y: number; width: number; height: number; angle?: number; points?: ReadonlyArray<readonly [number, number]>});
				minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
				maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
			}
			const z = appState.zoom.value;
			return [{
				relX: (minX - SELECTION_PADDING + appState.scrollX) * z,
				relY: (minY - SELECTION_PADDING + appState.scrollY) * z,
				relW: (maxX - minX + 2 * SELECTION_PADDING) * z,
				relH: (maxY - minY + 2 * SELECTION_PADDING) * z,
			}];
		},
		[excalidrawAPIRef],
	);

	/** Build an overlayData snapshot from current interpolated positions. */
	const buildOverlaySnapshot = useCallback(() => {
		const snapshot = new Map<string, CursorOverlayEntry>();
		for (const [userId, state] of cursorStates.current) {
			const coords = toRelCoords(state.currentX, state.currentY);
			if (!coords) continue;
			snapshot.set(userId, {
				relX: coords.relX,
				relY: coords.relY,
				color: state.color,
				avatarUrl: state.avatarUrl,
				username: state.username,
				selectionBoxes: state.selectionBoxes,
			});
		}
		return snapshot;
	}, [toRelCoords]);

	/** Start the RAF interpolation loop if it's not already running. */
	const startRAF = useCallback(() => {
		if (rafId.current !== null) return;

		const tick = (timestamp: number) => {
			if (cursorStates.current.size === 0) {
				rafId.current = null;
				return;
			}

			const dt = lastFrameTime.current > 0 ? Math.min((timestamp - lastFrameTime.current) / 1000, 0.1) : 0.016;
			lastFrameTime.current = timestamp;

			// Exponential smoothing: frame-rate-independent lerp.
			const alpha = 1 - Math.exp(-LERP_FACTOR * dt);

			let anyMoved = false;
			for (const state of cursorStates.current.values()) {
				const dx = state.targetX - state.currentX;
				const dy = state.targetY - state.currentY;
				if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
					state.currentX += dx * alpha;
					state.currentY += dy * alpha;
					anyMoved = true;
				}
			}

			if (anyMoved) {
				setOverlayData(buildOverlaySnapshot());
			}

			rafId.current = requestAnimationFrame(tick);
		};

		lastFrameTime.current = 0;
		rafId.current = requestAnimationFrame(tick);
	}, [buildOverlaySnapshot]);

	/** Reproject all current positions after scroll/zoom without lerping. */
	const refreshOverlayPositions = useCallback(() => {
		if (cursorStates.current.size === 0) return;
		// Recompute selection boxes (zoom changed so pixel sizes differ).
		for (const state of cursorStates.current.values()) {
			if (state.selectedElementIds?.length) {
				state.selectionBoxes = computeSelectionBoxes(state.selectedElementIds);
			}
		}
		setOverlayData(buildOverlaySnapshot());
	}, [buildOverlaySnapshot, computeSelectionBoxes]);

	// Subscribe to incoming cursor events from other users.
	useEffect(() => {
		const unsubscribe = WhiteboardStore.subscribeCursor(channelId, (event: WhiteboardCursorEvent) => {
			if (event.user_id === myUserId) return;

			const userId = event.user_id;
			const user = UserStore.getUser(userId);

			// If the user isn't cached yet, fetch their guild member data once.
			if (!user && event.guild_id && !requestedUsers.current.has(userId)) {
				requestedUsers.current.add(userId);
				void GuildMemberStore.fetchMembers(event.guild_id, {userIds: [userId]});
			}

			const username = user?.globalName ?? user?.username ?? undefined;
			const avatarUrl = user ? (AvatarUtils.getUserAvatarURL(user, false) ?? undefined) : undefined;
			const color = colorForUserId(userId);

			const existing = cursorStates.current.get(userId);
			if (existing) {
				existing.targetX = event.x;
				existing.targetY = event.y;
				existing.avatarUrl = avatarUrl;
				existing.username = username;
				if (event.selectedElementIds !== undefined) {
					existing.selectedElementIds = event.selectedElementIds;
					existing.selectionBoxes = computeSelectionBoxes(event.selectedElementIds);
				}
			} else {
				// First appearance: start current at target so it doesn't fly in from origin.
				cursorStates.current.set(userId, {
					targetX: event.x,
					targetY: event.y,
					currentX: event.x,
					currentY: event.y,
					color,
					avatarUrl,
					username,
					selectedElementIds: event.selectedElementIds ?? [],
					selectionBoxes: event.selectedElementIds?.length ? computeSelectionBoxes(event.selectedElementIds) : undefined,
				});
			}

			startRAF();

			// Reset expiry timer.
			if (expiryTimers.current[userId]) clearTimeout(expiryTimers.current[userId]);
			expiryTimers.current[userId] = setTimeout(() => {
				cursorStates.current.delete(userId);
				setOverlayData((prev) => {
					const next = new Map(prev);
					next.delete(userId);
					return next;
				});
				delete expiryTimers.current[userId];
			}, CURSOR_EXPIRY_MS);
		});

		return () => {
			unsubscribe();
			if (rafId.current !== null) {
				cancelAnimationFrame(rafId.current);
				rafId.current = null;
			}
			for (const timer of Object.values(expiryTimers.current)) clearTimeout(timer);
			expiryTimers.current = {};
			cursorStates.current = new Map();
			setOverlayData(new Map());
		};
	}, [channelId, myUserId, startRAF]);

	const handlePointerUpdate = useCallback(
		(payload: {pointer: {x: number; y: number; tool: 'pointer' | 'laser'}; button: 'down' | 'up'}) => {
			const now = Date.now();
			const remaining = CURSOR_THROTTLE_MS - (now - lastSentAt.current);

			if (pendingFrame.current != null) {
				clearTimeout(pendingFrame.current);
				pendingFrame.current = null;
			}

			const send = () => {
				lastSentAt.current = Date.now();
				pendingFrame.current = null;
				void http.post({
					url: Endpoints.CHANNEL_WHITEBOARD_CURSOR(channelId),
					body: {
						x: payload.pointer.x,
						y: payload.pointer.y,
						tool: payload.pointer.tool,
					},
				});
				lastPointerPos.current = payload.pointer;
			};

			if (remaining <= 0) {
				send();
			} else {
				pendingFrame.current = setTimeout(send, remaining);
			}
		},
		[channelId],
	);

	const handleSelectionChange = useCallback(
		(selectedElementIds: Record<string, boolean>) => {
			const ids = Object.keys(selectedElementIds).filter((id) => selectedElementIds[id]);
			void http.post({
				url: Endpoints.CHANNEL_WHITEBOARD_CURSOR(channelId),
				body: {
					x: lastPointerPos.current.x,
					y: lastPointerPos.current.y,
					tool: lastPointerPos.current.tool,
					selectedElementIds: ids,
				},
			});
		},
		[channelId],
	);

	return {overlayData, refreshOverlayPositions, handlePointerUpdate, handleSelectionChange};
}

