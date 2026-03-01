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

import {Excalidraw} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import ChannelStore from '@app/stores/ChannelStore';
import {ChannelFlags} from '@fluxer/constants/src/ChannelConstants';
import {useCallback, useRef} from 'react';
import styles from './WhiteboardApp.module.css';
import {useWhiteboardCursors} from './useWhiteboardCursors';
import {useWhiteboardSync} from './useWhiteboardSync';

interface WhiteboardAppProps {
	channelId: string;
	channelName?: string;
}

export function WhiteboardApp({channelId}: WhiteboardAppProps) {
	const channel = ChannelStore.getChannel(channelId);
	const isDarkModeDefault = channel?.hasFlag(ChannelFlags.DARK_MODE_DEFAULT) ?? false;

	const {initialData, loading, handleChange, setExcalidrawAPI, excalidrawAPIRef} = useWhiteboardSync({channelId, darkModeDefault: isDarkModeDefault});
	const {overlayData, refreshOverlayPositions, handlePointerUpdate, handleSelectionChange} = useWhiteboardCursors(channelId, excalidrawAPIRef);

	const prevSelectionKey = useRef<string>('');

	// Refresh avatar overlay positions whenever the viewport changes (scroll/zoom).
	// Also detect selection changes and broadcast them to other users.
	const handleChangeWithRefresh = useCallback<typeof handleChange>(
		(_elements, appState, files) => {
			handleChange(_elements, appState, files);
			refreshOverlayPositions();
			// Detect selection changes.
			const key = Object.keys(appState.selectedElementIds)
				.filter((id) => appState.selectedElementIds[id])
				.sort()
				.join(',');
			if (key !== prevSelectionKey.current) {
				prevSelectionKey.current = key;
				handleSelectionChange(appState.selectedElementIds);
			}
		},
		[handleChange, refreshOverlayPositions, handleSelectionChange],
	);

	if (loading || !initialData) {
		return <div className={styles.container} />;
	}

	return (
		<div className={styles.container}>
			<Excalidraw
				key={channelId}
				excalidrawAPI={setExcalidrawAPI}
				initialData={initialData}
				theme={isDarkModeDefault ? 'dark' : 'light'}
				onChange={handleChangeWithRefresh}
				onPointerUpdate={handlePointerUpdate}
				UIOptions={{canvasActions: {export: false, saveToActiveFile: false}}}
			/>
			{/* Collaborative overlay: selection boxes + avatar cursors */}
			<div style={{position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10}}>
				{/* Selection borders */}
				{[...overlayData.entries()].flatMap(([userId, entry]) =>
					(entry.selectionBoxes ?? []).map((box, i) => (
						<div
							key={`${userId}-sel-${i}`}
							style={{
								position: 'absolute',
								left: box.relX,
								top: box.relY,
								width: box.relW,
								height: box.relH,
								border: `2px solid ${entry.color.stroke}`,
								borderRadius: 3,
								background: `${entry.color.background}22`,
							}}
						/>
					)),
				)}
				{[...overlayData.entries()].map(([userId, entry]) => (
					<div
						key={userId}
						style={{
							position: 'absolute',
							left: entry.relX,
							top: entry.relY,
							// Offset to bottom-right of the cursor tip.
							transform: 'translate(12px, 8px)',
						}}
					>
						{entry.avatarUrl ? (
							<img
								src={entry.avatarUrl}
								alt={entry.username ?? ''}
								style={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									border: `2.5px solid ${entry.color.stroke}`,
									display: 'block',
									boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
								}}
							/>
						) : (
							<div
								style={{
									width: 28,
									height: 28,
									borderRadius: '50%',
									background: entry.color.background,
									border: `2.5px solid ${entry.color.stroke}`,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									color: 'white',
									fontSize: 12,
									fontWeight: 'bold',
									boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
								}}
							>
								{(entry.username ?? '?')[0].toUpperCase()}
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
