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
import WhiteboardStore from '@app/stores/WhiteboardStore';
import type {WhiteboardRemoteUpdate} from '@app/stores/WhiteboardStore';
// @ts-expect-error — CaptureUpdateAction is exported at runtime but types resolution fails with verbatimModuleSyntax
import {CaptureUpdateAction, reconcileElements} from '@excalidraw/excalidraw';
import type {ExcalidrawImperativeAPI} from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type {AppState, BinaryFiles} from '@excalidraw/excalidraw/dist/types/excalidraw/types';
import type {ExcalidrawElement, OrderedExcalidrawElement} from '@excalidraw/excalidraw/dist/types/excalidraw/element/types';
import type {RemoteExcalidrawElement} from '@excalidraw/excalidraw/dist/types/excalidraw/data/reconcile';
import {useCallback, useEffect, useRef, useState} from 'react';
import type {MutableRefObject} from 'react';

interface WhiteboardData {
	elements: Array<Record<string, unknown>>;
	appState?: Record<string, unknown>;
	files?: Record<string, unknown>;
	version?: number;
}

interface UseWhiteboardSyncOptions {
	channelId: string;
	debounceMs?: number;
	darkModeDefault?: boolean;
}

interface UseWhiteboardSyncResult {
	initialData: WhiteboardData | null;
	loading: boolean;
	error: string | null;
	handleChange: (elements: ReadonlyArray<ExcalidrawElement>, appState: AppState, files: BinaryFiles) => void;
	setExcalidrawAPI: (api: ExcalidrawImperativeAPI) => void;
	excalidrawAPIRef: MutableRefObject<ExcalidrawImperativeAPI | null>;
}

const STORAGE_KEY = (channelId: string) => `fluxer_whiteboard_${channelId}`;

function loadFromLocalStorage(channelId: string): WhiteboardData | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY(channelId));
		return raw ? (JSON.parse(raw) as WhiteboardData) : null;
	} catch {
		return null;
	}
}

function saveToLocalStorage(channelId: string, data: WhiteboardData): void {
	try {
		localStorage.setItem(STORAGE_KEY(channelId), JSON.stringify(data));
	} catch {
		// Storage quota exceeded
	}
}

// Set localStorage.setItem('wbDebug','1') in the browser console to enable logging.
const wbLog = (...args: Array<unknown>) => {
	if (typeof localStorage !== 'undefined' && localStorage.getItem('wbDebug')) {
		console.log('[WB]', ...args);
	}
};

export function useWhiteboardSync({channelId, debounceMs = 200, darkModeDefault = false}: UseWhiteboardSyncOptions): UseWhiteboardSyncResult {
	// Debug helper — enable with localStorage.setItem('wbSwitchDebug','1')
	const switchLog = (...args: unknown[]) => {
		if (typeof localStorage !== 'undefined' && localStorage.getItem('wbSwitchDebug')) {
			console.log('[WB-SWITCH]', ...args);
		}
	};

	const [initialData, setInitialData] = useState<WhiteboardData | null>(null);
	// Track which channelId the current initialData belongs to so we can detect mismatches.
	const initialDataChannelRef = useRef<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const pendingPayloadRef = useRef<WhiteboardData | null>(null);
	const isSavingRef = useRef<boolean>(false);
	const lastNonceRef = useRef<string | null>(null);
	const serverVersionRef = useRef<number>(0);
	const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const isApplyingRemoteRef = useRef(false);
	// Always reflects the current channelId without being part of any closure so
	// handleChange (which has [] deps) can guard against storing stale-channel data.
	const currentChannelRef = useRef<string>(channelId);
	currentChannelRef.current = channelId;

	const setExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
		excalidrawAPIRef.current = api;
	}, []);

	// Load from server on mount, fall back to localStorage
	useEffect(() => {
		let cancelled = false;

		switchLog('effect fired', {channelId, currentInitialDataChannel: initialDataChannelRef.current, hasStaleData: initialDataChannelRef.current !== null && initialDataChannelRef.current !== channelId});

		// Synchronously clear stale data BEFORE the async fetch so React can schedule
		// a re-render with null before Excalidraw mounts with the new channelId key.
		if (initialDataChannelRef.current !== channelId) {
			switchLog('clearing stale state synchronously', {was: initialDataChannelRef.current, now: channelId});
			initialDataChannelRef.current = null;
			setInitialData(null);
			setLoading(true);
			setError(null);
			// Critical: discard any pending save payload from the previous channel so the
			// flush interval cannot write old channel data into the new channel on its first tick.
			pendingPayloadRef.current = null;
			isSavingRef.current = false;
			serverVersionRef.current = 0;
			lastNonceRef.current = null;
			switchLog('stale save state cleared', {channelId});
		}

		async function loadData() {
			switchLog('loadData start', {channelId, cancelled});

			try {
				const response = await http.get<WhiteboardData>({
					url: Endpoints.CHANNEL_WHITEBOARD(channelId),
					retries: 2,
				});

				if (cancelled) {
					switchLog('loadData: fetch completed but effect was cancelled (channel changed)', {channelId});
					return;
				}

				const serverData = response.body;
				switchLog('loadData: fetch ok', {channelId, elementCount: serverData?.elements?.length ?? 0, version: serverData?.version});

				if (serverData?.elements?.length > 0) {
					serverVersionRef.current = serverData.version ?? 0;
					initialDataChannelRef.current = channelId;
					setInitialData(serverData);
					// Update localStorage cache with server data
					saveToLocalStorage(channelId, serverData);
				} else {
					// No server data, try localStorage
					const localData = loadFromLocalStorage(channelId);
					switchLog('loadData: no server data, localStorage elems=', localData?.elements?.length ?? 0);
					const defaultBg = darkModeDefault ? '#121212' : '#ffffff';
					initialDataChannelRef.current = channelId;
					setInitialData(localData ?? {elements: [], appState: {viewBackgroundColor: defaultBg}});
				}
			} catch (err) {
				if (cancelled) {
					switchLog('loadData: fetch errored but effect was cancelled', {channelId});
					return;
				}
				switchLog('loadData: fetch error, falling back to localStorage', {channelId, err});
				// Server unavailable, fall back to localStorage
				const localData = loadFromLocalStorage(channelId);
				const defaultBg = darkModeDefault ? '#121212' : '#ffffff';
				initialDataChannelRef.current = channelId;
				setInitialData(localData ?? {elements: [], appState: {viewBackgroundColor: defaultBg}});
				setError('offline');
			} finally {
				if (!cancelled) {
					setLoading(false);
					switchLog('loadData: done', {channelId});
				}
			}
		}

		void loadData();

		return () => {
			switchLog('effect cleanup (channel changing away from)', {channelId});
			cancelled = true;
		};
		// switchLog is stable (defined in render body without deps), safe to exclude
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [channelId]);

	// Subscribe to remote update notifications from the gateway.
	// The gateway event carries only metadata (no elements) to stay within NATS's
	// 1 MB payload limit. On receipt we fetch the full whiteboard from the server
	// and reconcile with our local scene.
	useEffect(() => {
		const unsubscribe = WhiteboardStore.subscribe(channelId, (update: WhiteboardRemoteUpdate) => {
			wbLog('received gateway notification', {
				user_id: update.user_id,
				client_nonce: update.client_nonce,
				myNonce: lastNonceRef.current,
				myUserId: AuthenticationStore.currentUserId,
				version: update.version,
			});

			// Definitively ignore our own saves bouncing back.
			if (update.client_nonce && update.client_nonce === lastNonceRef.current) {
				wbLog('→ filtered by nonce (own bounce)');
				return;
			}
			// Secondary userId guard for events that lack a nonce.
			const myUserId = AuthenticationStore.currentUserId;
			if (myUserId && String(update.user_id) === String(myUserId)) {
				wbLog('→ filtered by userId (own bounce, no nonce)');
				return;
			}

			const api = excalidrawAPIRef.current;
			if (!api) {
				wbLog('→ dropped, no Excalidraw API ref yet');
				return;
			}

			wbLog('→ fetching remote whiteboard', {version: update.version});

			// Capture the channelId at the time this handler fires. If the channel
			// changes before the async fetch completes, we must not apply the result.
			const fetchingForChannel = channelId;

			// Fetch full whiteboard data then reconcile with local scene.
			void (async () => {
				try {
					const response = await http.get<WhiteboardData>({
						url: Endpoints.CHANNEL_WHITEBOARD(channelId),
					});

					// Guard: if the user navigated away before this fetch completed,
					// discard the result — applying it would corrupt the new channel's scene.
					if (currentChannelRef.current !== fetchingForChannel) {
						wbLog('→ discarding stale remote fetch (channel changed during in-flight request)', {fetchedFor: fetchingForChannel, currentChannel: currentChannelRef.current});
						return;
					}

					const remote = response.body;
					if (!remote?.elements) {
						wbLog('→ fetch returned no elements, ignoring');
						return;
					}

					wbLog('→ applying remote fetch', {
						remoteElementCount: remote.elements.length,
						localElementCount: api.getSceneElements().length,
					});

					// Guard against re-entrancy: prevent handleChange from capturing the
					// scene update triggered by updateScene into pendingPayloadRef.
					// setTimeout(0) so the guard stays up through the React render cycle
					// and Excalidraw's subsequent onChange call.
					isApplyingRemoteRef.current = true;
					try {
						// Use getSceneElementsIncludingDeleted so that locally-deleted elements
						// are present with isDeleted:true and a higher version, allowing
						// reconcileElements to correctly keep them deleted rather than
						// resurrecting them from the remote's stale non-deleted copy.
						const localElements = api.getSceneElementsIncludingDeleted() as unknown as Array<OrderedExcalidrawElement>;
						const remoteElements = remote.elements as unknown as Array<RemoteExcalidrawElement>;
						const merged = reconcileElements(localElements, remoteElements, api.getAppState());

						wbLog('→ after reconcile', {mergedElementCount: merged.length});

						api.updateScene({
							elements: merged,
							captureUpdate: CaptureUpdateAction.NEVER,
						});

						if (remote.files && Object.keys(remote.files).length > 0) {
							const binaryFiles = Object.values(remote.files);
							api.addFiles(binaryFiles as Parameters<ExcalidrawImperativeAPI['addFiles']>[0]);
						}

						serverVersionRef.current = remote.version ?? update.version;
					} finally {
						setTimeout(() => {
							isApplyingRemoteRef.current = false;
							wbLog('isApplyingRemote released');
						}, 0);
					}
				} catch (err) {
					wbLog('→ fetch failed', err);
				}
			})();
		});

		return unsubscribe;
	}, [channelId]);

	// Flush the captured onChange payload to the server.
	// Using the payload captured in onChange ensures we always send the exact
	// element state that was reported by Excalidraw—including in-progress freedraw
	// stroke points—rather than a potentially-stale snapshot from getSceneElements().
	// Saves are serialized to prevent concurrent writes to the same S3 key.
	const flushSave = useCallback(async () => {
		if (isSavingRef.current) {
			wbLog('flushSave skipped: save in progress');
			return;
		}
		if (!pendingPayloadRef.current) return;

		// Grab and clear the pending payload atomically
		const payload = pendingPayloadRef.current;
		pendingPayloadRef.current = null;
		isSavingRef.current = true;

		// Generate a unique nonce so we can definitively identify and suppress the
		// gateway echo of our own save.
		const nonce = crypto.randomUUID();
		lastNonceRef.current = nonce;

		wbLog('flushSave sending', {nonce, elementCount: (payload.elements as Array<unknown>).length, fileCount: Object.keys(payload.files ?? {}).length});

		saveToLocalStorage(channelId, payload);

		try {
			const response = await http.put<WhiteboardData>(
				{url: Endpoints.CHANNEL_WHITEBOARD(channelId)},
				{...payload, client_nonce: nonce},
			);
			if (response.body?.version) {
				serverVersionRef.current = response.body.version;
			}
			wbLog('flushSave ok', {nonce, version: response.body?.version});
		} catch (err) {
			// Server save failed silently — data is still in localStorage
			wbLog('flushSave error', err);
		} finally {
			isSavingRef.current = false;
		}
	}, [channelId]);

	// Interval-based flush: every `debounceMs` ms, push any pending payload to the
	// server. This guarantees continuous updates while drawing without any complex
	// timer arithmetic, and the interval naturally picks up the final state after
	// the last stroke.
	useEffect(() => {
		intervalRef.current = setInterval(() => {
			void flushSave();
		}, debounceMs);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
			// Flush any final pending changes on unmount
			void flushSave();
		};
	}, [channelId, debounceMs, flushSave]);

	// onChange captures the current scene snapshot into pendingPayloadRef.
	// Storing the elements provided by onChange—rather than reading them later via
	// getSceneElements()—guarantees we capture the exact in-progress freedraw stroke
	// state at the moment Excalidraw reported it, including all intermediate points.
	const handleChange = useCallback(
		(elements: ReadonlyArray<ExcalidrawElement>, appState: AppState, files: BinaryFiles) => {
			// Skip saves triggered by applying remote updates
			if (isApplyingRemoteRef.current) {
				wbLog('handleChange blocked (isApplyingRemote)', {elementCount: elements.length});
				return;
			}
			// Guard: Excalidraw can fire onChange during the unmount/remount cycle that
			// follows a channel switch. Discard any onChange calls that arrive while
			// the pending payload has been cleared (i.e. between channel switch and
			// first new-channel draw). More precisely: if initialDataChannelRef says
			// we're still loading the new channel, don't overwrite a null/empty
			// pendingPayload with stale old-channel elements.
			if (initialDataChannelRef.current !== currentChannelRef.current) {
				wbLog('handleChange blocked (channel switching — stale onChange)', {elementCount: elements.length, dataChannel: initialDataChannelRef.current, currentChannel: currentChannelRef.current});
				return;
			}

			wbLog('handleChange captured', {elementCount: elements.length, fileCount: Object.keys(files).length});

			const hasFiles = Object.keys(files).length > 0;
			pendingPayloadRef.current = {
				elements: elements as unknown as Array<Record<string, unknown>>,
				appState: {
					viewBackgroundColor: appState.viewBackgroundColor,
					gridSize: appState.gridSize,
					currentItemFontFamily: appState.currentItemFontFamily,
					currentItemFontSize: appState.currentItemFontSize,
				},
				...(hasFiles && {files: files as unknown as Record<string, unknown>}),
			};
		},
		[],
	);

	// Guard against the React timing gap: on the first render after channelId changes,
	// the effect hasn't run yet so `initialData` still belongs to the old channel.
	// Return null + loading=true until the state reflects the current channelId.
	const isCoherent = initialDataChannelRef.current === channelId;
	switchLog('render', {channelId, initialDataChannel: initialDataChannelRef.current, isCoherent, loading, elementCount: initialData?.elements?.length ?? 0});

	return {
		initialData: isCoherent ? initialData : null,
		loading: loading || !isCoherent,
		error,
		handleChange,
		setExcalidrawAPI,
		excalidrawAPIRef,
	};
}
