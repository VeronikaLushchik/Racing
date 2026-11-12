import { TChannelTable, ImportError } from './importTypings';

/** "RTLG": magic, u16 version, u16 frame size, f64 start time (epoch ms), 8 reserved bytes. */
export const RTLG_MAGIC = 'RTLG';
const RTLG_HEADER_BYTES = 24;

interface TRtlgChannel {
	key: string;
	type: string;
	scale?: number;
	unit?: string;
	label?: string;
}

/** session.json written next to frames.bin by the recorder. */
export interface TRtlgSession {
	formatVersion?: number;
	id?: string;
	source?: string;
	car?: string | null;
	track?: string | null;
	startedAt?: number;
	frameCount?: number;
	frameBytes?: number;
	trackLengthM?: number | null;
	channels: TRtlgChannel[];
}

const TYPE_SIZES: Record<string, number> = {
	u8: 1,
	i8: 1,
	u16: 2,
	i16: 2,
	u32: 4,
	i32: 4,
	f32: 4,
	f64: 8,
};

const readValue = (view: DataView, offset: number, type: string): number => {
	switch (type) {
		case 'u8':
			return view.getUint8(offset);
		case 'i8':
			return view.getInt8(offset);
		case 'u16':
			return view.getUint16(offset, true);
		case 'i16':
			return view.getInt16(offset, true);
		case 'u32':
			return view.getUint32(offset, true);
		case 'i32':
			return view.getInt32(offset, true);
		case 'f32':
			return view.getFloat32(offset, true);
		case 'f64':
		default:
			return view.getFloat64(offset, true);
	}
};

export const isRtlgFrames = (bytes: Uint8Array): boolean =>
	bytes.length >= 4 && Buffer.from(bytes.subarray(0, 4)).toString('latin1') === RTLG_MAGIC;

export const isRtlgSession = (value: unknown): value is TRtlgSession =>
	typeof value === 'object' &&
	value !== null &&
	Array.isArray((value as TRtlgSession).channels) &&
	(value as TRtlgSession).channels.every(
		channel => typeof channel.key === 'string' && channel.type in TYPE_SIZES,
	);

/**
 * Reads a recorder session: session.json describes the channels, frames.bin holds fixed-size
 * little-endian frames with the channels packed in that order (value = raw / scale).
 */
export const readRtlg = (session: TRtlgSession, frames: Uint8Array): TChannelTable => {
	const frameBytes = session.channels.reduce((sum, channel) => sum + TYPE_SIZES[channel.type], 0);
	const view = new DataView(frames.buffer, frames.byteOffset, frames.length);
	const headerFrameBytes = view.getUint16(6, true);
	if (headerFrameBytes !== frameBytes || (session.frameBytes ?? frameBytes) !== frameBytes) {
		throw new ImportError('importChannelsMismatch');
	}

	const count = Math.floor((frames.length - RTLG_HEADER_BYTES) / frameBytes);
	const channels: TChannelTable['channels'] = {};
	let offset = 0;
	session.channels.forEach(channel => {
		const values = new Float64Array(count);
		const scale = channel.scale || 1;
		for (let i = 0; i < count; i += 1) {
			values[i] =
				readValue(view, RTLG_HEADER_BYTES + i * frameBytes + offset, channel.type) / scale;
		}
		channels[channel.key] = { values, unit: channel.unit ?? '' };
		offset += TYPE_SIZES[channel.type];
	});

	return {
		origin: session.source ?? null,
		car: session.car ?? null,
		track: session.track ?? null,
		startedAt: session.startedAt ?? view.getFloat64(8, true),
		trackLength: session.trackLengthM ?? null,
		count,
		channels,
	};
};
