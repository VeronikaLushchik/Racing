/** @format */

import React, { FC, useRef } from 'react';

import useCanvasLoop, { TCanvasDrawArgs } from 'src/modules/canvasChart/useCanvasLoop';

import { ggAxisLimit, trailAlpha } from './driverTelemetryFunctions';

import { GG_TRAIL_MS } from './driverTelemetryConstants';

import classes from './driverTelemetry.module.scss';

interface GGDiagramProps {
	ariaLabel: string;
}

const draw = (args: TCanvasDrawArgs): void => {
	const { ctx, width, height, store, color } = args;
	const buffer = store.buffer;
	const tEnd = buffer.latest('t') ?? 0;
	const first = buffer.firstIndexSince(tEnd - GG_TRAIL_MS);

	let maxAbs = 0;
	for (let i = first; i < buffer.count; i += 1) {
		maxAbs = Math.max(
			maxAbs,
			Math.abs(buffer.get('gLat', i)),
			Math.abs(buffer.get('gLong', i)),
		);
	}
	const limit = ggAxisLimit(maxAbs);
	const size = Math.min(width, height);
	const cx = width / 2;
	const cy = height / 2;
	const scale = (size / 2 - 14) / limit;

	ctx.strokeStyle = color('--color-grid');
	ctx.fillStyle = color('--color-text-secondary');
	ctx.font = '10px system-ui, sans-serif';
	ctx.lineWidth = 1;
	for (let g = 1; g <= limit; g += 1) {
		ctx.beginPath();
		ctx.arc(cx, cy, g * scale, 0, Math.PI * 2);
		ctx.stroke();
		ctx.fillText(`${g}G`, cx + g * scale * 0.71 + 2, cy - g * scale * 0.71);
	}
	ctx.beginPath();
	ctx.moveTo(cx - limit * scale, cy);
	ctx.lineTo(cx + limit * scale, cy);
	ctx.moveTo(cx, cy - limit * scale);
	ctx.lineTo(cx, cy + limit * scale);
	ctx.stroke();

	const accent = color('--color-accent');
	ctx.fillStyle = accent;
	for (let i = first; i < buffer.count; i += 1) {
		ctx.globalAlpha = trailAlpha(tEnd - buffer.get('t', i), GG_TRAIL_MS) * 0.6;
		// Braking (negative longitudinal G) is drawn upwards, as engineers usually plot it.
		const px = cx + buffer.get('gLat', i) * scale;
		const py = cy + buffer.get('gLong', i) * scale;
		ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
	}
	ctx.globalAlpha = 1;

	const lat = buffer.latest('gLat');
	const long = buffer.latest('gLong');
	if (lat !== null && long !== null) {
		ctx.beginPath();
		ctx.arc(cx + lat * scale, cy + long * scale, 5, 0, Math.PI * 2);
		ctx.fillStyle = color('--color-text');
		ctx.fill();
	}
};

const GGDiagram: FC<GGDiagramProps> = props => {
	const { ariaLabel } = props;

	const canvasRef = useRef<HTMLCanvasElement>(null);

	useCanvasLoop(canvasRef, draw);

	return (
		<canvas
			ref={canvasRef}
			className={classes.ggCanvas}
			role="img"
			aria-label={ariaLabel}
		/>
	);
};

export default GGDiagram;
