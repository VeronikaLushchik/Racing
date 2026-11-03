/** @format */

import React, { FC, useRef } from 'react';

import useCanvasLoop, { TCanvasDrawArgs } from './useCanvasLoop';

import { TTraceLane } from './canvasChartTypings';

import classes from './canvasChart.module.scss';

interface CanvasTraceProps {
	lanes: TTraceLane[];
	windowSeconds: number;
	ariaLabel: string;
}

const LABEL_WIDTH = 64;
const LANE_GAP = 6;

const drawTraces = (lanes: TTraceLane[], windowSeconds: number) => (args: TCanvasDrawArgs) => {
	const { ctx, width, height, store, color } = args;
	const buffer = store.buffer;
	const plotWidth = width - LABEL_WIDTH;
	const totalWeight = lanes.reduce((sum, lane) => sum + lane.weight, 0);
	const usable = height - LANE_GAP * (lanes.length - 1);

	const tEnd = buffer.latest('t') ?? 0;
	const tStart = tEnd - windowSeconds * 1000;
	const first = Math.max(0, buffer.firstIndexSince(tStart) - 1);
	const x = (t: number): number =>
		LABEL_WIDTH + ((t - tStart) / (tEnd - tStart || 1)) * plotWidth;

	ctx.font = '11px system-ui, sans-serif';
	ctx.textBaseline = 'middle';
	let top = 0;

	lanes.forEach(lane => {
		const laneHeight = (usable * lane.weight) / totalWeight;
		const y = (value: number): number =>
			top + laneHeight - ((value - lane.min) / (lane.max - lane.min)) * laneHeight;

		ctx.strokeStyle = color('--color-grid');
		ctx.lineWidth = 1;
		ctx.strokeRect(LABEL_WIDTH + 0.5, top + 0.5, plotWidth - 1, laneHeight - 1);
		ctx.fillStyle = color('--color-text-secondary');
		ctx.fillText(lane.label, 4, top + 10);

		lane.series.forEach((series, seriesIndex) => {
			ctx.strokeStyle = color(series.colorVar);
			ctx.lineWidth = 1.5;
			ctx.beginPath();
			let prevY: number | null = null;
			for (let i = first; i < buffer.count; i += 1) {
				const px = x(buffer.get('t', i));
				const value = Math.min(lane.max, Math.max(lane.min, buffer.get(series.channel, i)));
				const py = y(value);
				if (prevY === null) ctx.moveTo(px, py);
				else if (series.isStep) {
					ctx.lineTo(px, prevY);
					ctx.lineTo(px, py);
				} else ctx.lineTo(px, py);
				prevY = py;
			}
			ctx.stroke();

			const latest = buffer.latest(series.channel);
			if (latest !== null) {
				ctx.fillStyle = color(series.colorVar);
				const text = lane.format ? lane.format(latest) : latest.toFixed(0);
				ctx.fillText(text, 4, top + 26 + seriesIndex * 14);
			}
		});
		top += laneHeight + LANE_GAP;
	});
};

const CanvasTrace: FC<CanvasTraceProps> = props => {
	const { lanes, windowSeconds, ariaLabel } = props;

	const canvasRef = useRef<HTMLCanvasElement>(null);

	useCanvasLoop(canvasRef, drawTraces(lanes, windowSeconds));

	return (
		<canvas
			ref={canvasRef}
			className={classes.canvas}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default CanvasTrace;
