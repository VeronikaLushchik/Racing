export const TRACK_CHANNELS = ['speed', 'throttle', 'brake', 'gLat', 'delta'] as const;

export type TTrackChannel = (typeof TRACK_CHANNELS)[number];

export const TRACK_CHANNEL_KEYS: Record<TTrackChannel, TTranslationKey> = {
	speed: 'driver.speed',
	throttle: 'driver.throttle',
	brake: 'driver.brake',
	gLat: 'trackMap.gLat',
	delta: 'trackMap.timeLost',
};

export const LIVE_CAR_HZ = 10;
export const MAP_MARGIN_PX = 16;
/** Height reserved under the map for the colour scale. */
export const LEGEND_HEIGHT_PX = 44;
