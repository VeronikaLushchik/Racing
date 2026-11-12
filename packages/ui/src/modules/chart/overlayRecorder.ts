import type { EChartsCoreOption } from 'echarts/core';

import echarts from './echartsCore';
import { buildLapWindowData, lapValueAt } from './overlayFunctions';
import { buildTraceChartOption } from './traceChartFunctions';
import { formatLapTime } from 'src/services/functions';

import { TColorScheme } from '~@ui/common/themes';
import { TLapRecord } from '../telemetry/lapTypings';
import { TTraceLane } from './chartTypings';

/** Logical size of the overlay; drawn at twice the pixels, so the video is 1920 × 640. */
export const OVERLAY_WIDTH = 960;
export const OVERLAY_HEIGHT = 320;
const OVERLAY_PIXEL_RATIO = 2;
const FPS = 30;
/** Pure green is what video editors key out by default. */
export const CHROMA_GREEN = '#00ff00';
const HEADER_HEIGHT = 30;

const VIDEO_TYPES = [
	'video/webm;codecs=vp9',
	'video/webm;codecs=vp8',
	'video/webm',
	'video/mp4;codecs=avc1',
	'video/mp4',
];

export type TOverlayBackground = 'transparent' | 'green';

export interface TOverlayJob {
	lanes: TTraceLane[];
	record: TLapRecord;
	windowSeconds: number;
	theme: TColorScheme;
	background: TOverlayBackground;
	/** Share of the lap done, 0..1. */
	onProgress: (share: number) => void;
}

export interface TOverlayRecording {
	done: Promise<Blob | null>;
	cancel: () => void;
}

/** Video type this browser records; WebM keeps a transparent background, MP4 does not. */
export const overlayVideoType = (): string | null =>
	typeof MediaRecorder === 'undefined'
		? null
		: (VIDEO_TYPES.find(type => MediaRecorder.isTypeSupported(type)) ?? null);

const headerText = (record: TLapRecord, tMs: number): string =>
	[
		`Lap ${record.lap}`,
		formatLapTime(Math.min(tMs, record.lapTimeMs)),
		`${Math.round(lapValueAt(record, 'speed', tMs))} km/h`,
		`G${Math.round(lapValueAt(record, 'gear', tMs))}`,
	].join('   ');

const overlayOption = (
	lanes: TTraceLane[],
	theme: TColorScheme,
	background: TOverlayBackground,
): EChartsCoreOption => {
	const option = buildTraceChartOption(lanes, theme, OVERLAY_HEIGHT - HEADER_HEIGHT) as {
		grid: { top: number }[];
		series: { lineStyle: object }[];
	};
	return {
		...option,
		backgroundColor: background === 'green' ? CHROMA_GREEN : 'transparent',
		tooltip: { show: false },
		grid: option.grid.map(grid => ({ ...grid, top: grid.top + HEADER_HEIGHT })),
		series: option.series.map(series => ({
			...series,
			lineStyle: { ...series.lineStyle, width: 2.5 },
		})),
		graphic: [
			{
				id: 'header',
				type: 'text',
				left: 56,
				top: 6,
				style: {
					text: '',
					fill: theme['--text-primary'],
					font: '600 16px monospace',
				},
			},
		],
	};
};

/**
 * Records the trace chart of one lap as a video in real time: the chart scrolls as it did
 * during the lap, so it can be laid over the onboard video of that lap.
 */
export const recordOverlay = (job: TOverlayJob): TOverlayRecording => {
	const { lanes, record, windowSeconds, theme, background, onProgress } = job;
	const type = overlayVideoType();
	const container = document.createElement('div');
	Object.assign(container.style, {
		position: 'fixed',
		left: '-10000px',
		top: '0',
		width: `${OVERLAY_WIDTH}px`,
		height: `${OVERLAY_HEIGHT}px`,
	});
	document.body.appendChild(container);
	const chart = echarts.init(container, undefined, {
		renderer: 'canvas',
		devicePixelRatio: OVERLAY_PIXEL_RATIO,
		width: OVERLAY_WIDTH,
		height: OVERLAY_HEIGHT,
	});
	chart.setOption(overlayOption(lanes, theme, background));
	const canvas = container.querySelector('canvas');

	let frame = 0;
	let isCancelled = false;
	const cleanup = () => {
		window.cancelAnimationFrame(frame);
		chart.dispose();
		container.remove();
	};
	if (!type || !canvas) {
		cleanup();
		return { done: Promise.resolve(null), cancel: () => undefined };
	}

	const recorder = new MediaRecorder(canvas.captureStream(FPS), {
		mimeType: type,
		videoBitsPerSecond: 8_000_000,
	});
	const chunks: Blob[] = [];
	recorder.ondataavailable = event => {
		if (event.data.size > 0) chunks.push(event.data);
	};
	const done = new Promise<Blob | null>(resolve => {
		recorder.onstop = () => {
			cleanup();
			resolve(isCancelled ? null : new Blob(chunks, { type: type.split(';')[0] }));
		};
	});

	const draw = (tMs: number) => {
		chart.setOption({
			...buildLapWindowData(lanes, record, tMs, windowSeconds),
			graphic: [{ id: 'header', style: { text: headerText(record, tMs) } }],
		});
	};
	draw(0);
	recorder.start(1000);
	const startedAt = performance.now();
	const tick = () => {
		const tMs = performance.now() - startedAt;
		draw(tMs);
		onProgress(Math.min(1, tMs / record.lapTimeMs));
		if (tMs >= record.lapTimeMs) {
			recorder.stop();
			return;
		}
		frame = window.requestAnimationFrame(tick);
	};
	frame = window.requestAnimationFrame(tick);

	return {
		done,
		cancel: () => {
			isCancelled = true;
			if (recorder.state !== 'inactive') recorder.stop();
		},
	};
};

/** Saves a blob as a file. */
export const downloadBlob = (blob: Blob, name: string): void => {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = name;
	link.click();
	window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** File extension for a recorded video type. */
export const videoExtension = (blob: Blob): string => (blob.type.includes('mp4') ? 'mp4' : 'webm');
