import { RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const useStableCallback = <A extends unknown[], R>(callback: (...args: A) => R) => {
	const ref = useRef(callback);
	useLayoutEffect(() => {
		ref.current = callback;
	});
	return useCallback((...args: A) => ref.current(...args), []);
};

export const useElementSize = (ref: RefObject<HTMLElement>): { width: number; height: number } => {
	const [size, setSize] = useState({ width: 0, height: 0 });
	useEffect(() => {
		const element = ref.current;
		if (!element) return undefined;
		const observer = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			setSize(prev =>
				prev.width === Math.round(width) && prev.height === Math.round(height)
					? prev
					: { width: Math.round(width), height: Math.round(height) },
			);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref]);
	return size;
};
