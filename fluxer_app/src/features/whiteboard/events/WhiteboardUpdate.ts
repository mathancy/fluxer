// SPDX-License-Identifier: AGPL-3.0-or-later

import type {GatewayHandlerContext} from '@app/features/gateway/events/EventRouter';
import WhiteboardStore, {type WhiteboardRemoteUpdate} from '@app/features/whiteboard/state/WhiteboardStore';

export function handleWhiteboardUpdate(data: WhiteboardRemoteUpdate, _context: GatewayHandlerContext): void {
	WhiteboardStore.handleRemoteUpdate(data);
}
