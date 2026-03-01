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

import {AdminRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/AdminRateLimitConfig';
import {AuthRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/AuthRateLimitConfig';
import {ChannelRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/ChannelRateLimitConfig';
import {DiscoveryRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/DiscoveryRateLimitConfig';
import {DonationRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/DonationRateLimitConfig';
import {GuildRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/GuildRateLimitConfig';
import {IntegrationRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/IntegrationRateLimitConfig';
import {InviteRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/InviteRateLimitConfig';
import {MiscRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/MiscRateLimitConfig';
import {OAuthRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/OAuthRateLimitConfig';
import {PackRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/PackRateLimitConfig';
import type {RateLimitSection} from '@fluxer/api/src/rate_limit_configs/RateLimitHelpers';
import {mergeRateLimitSections} from '@fluxer/api/src/rate_limit_configs/RateLimitHelpers';
import {UserRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/UserRateLimitConfig';
import {WebhookRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/WebhookRateLimitConfig';
import {WhiteboardRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/WhiteboardRateLimitConfig';
import {CalendarRateLimitConfigs} from '@fluxer/api/src/rate_limit_configs/CalendarRateLimitConfig';

const rateLimitSections = [
	AuthRateLimitConfigs,
	OAuthRateLimitConfigs,
	UserRateLimitConfigs,
	ChannelRateLimitConfigs,
	DiscoveryRateLimitConfigs,
	DonationRateLimitConfigs,
	GuildRateLimitConfigs,
	InviteRateLimitConfigs,
	WebhookRateLimitConfigs,
	IntegrationRateLimitConfigs,
	AdminRateLimitConfigs,
	MiscRateLimitConfigs,
	PackRateLimitConfigs,
	WhiteboardRateLimitConfigs,
	CalendarRateLimitConfigs,
] satisfies ReadonlyArray<RateLimitSection>;

export const RateLimitConfigs = mergeRateLimitSections(...rateLimitSections);
