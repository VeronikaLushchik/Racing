import { RefObject, useEffect, useRef } from 'react';

import { useStableCallback } from 'src/services/customHooks';

import { useTelemetryStore } from 'src/modules/telemetry/useTelemetry';

import { TelemetryStore } from 'src/modules/telemetry/telemetryStore';

export interface TCanvasDrawArgs {
	ctx: CanvasRenderingContext2D;
	width: number;
	height: number;
	store: TelemetryStore;
	color: (name: string) => string;
}

/**
 * Drives a canvas from requestAnimationFrame: sizes it for devicePixelRatio, and redraws only
 * when a new frame arrived or the element was resized. No React state is touched per frame.
 */
const useCanvasLoop = (
	canvasRef: RefObject<HTMLCanvasElement>,
	draw: (args: TCanvasDrawArgs) => void,
) => {
	const store = useTelemetryStore();
	const stableDraw = useStableCallback(draw);
	const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return undefined;
		const ctx = canvas.getContext('2d');
		if (!ctx) return undefined;

		const colorCache = new Map<string, string>();
		const color = (name: string): string => {
			let value = colorCache.get(name);
			if (value === undefined) {
				value = getComputedStyle(canvas).getPropertyValue(name).trim() || 'gray';
				colorCache.set(name, value);
			}
			return value;
		};

		let isDirty = true;
		const observer = new ResizeObserver(([entry]) => {
			const dpr = window.devicePixelRatio || 1;
			const { width, height } = entry.contentRect;
			sizeRef.current = { width, height, dpr };
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
			isDirty = true;
		});
		observer.observe(canvas);

		let lastVersion = -1;
		let raf = 0;
		const loop = (): void => {
			raf = requestAnimationFrame(loop);
			if (!isDirty && store.frameVersion === lastVersion) return;
			isDirty = false;
			lastVersion = store.frameVersion;
			const { width, height, dpr } = sizeRef.current;
			if (width === 0 || height === 0) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, width, height);
			stableDraw({ ctx, width, height, store, color });
		};
		raf = requestAnimationFrame(loop);

		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
		};
	}, [canvasRef, store, stableDraw]);
};

export default useCanvasLoop;
