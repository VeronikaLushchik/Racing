/** @format */

import React, { FC, useEffect, useRef } from 'react';

import useTranslation from '~@engines/translations/useTranslation';
import { useTelemetryStore } from 'src/modules/telemetry/useTelemetry';

import classes from './driverTelemetry.module.scss';

/** Pedal bars are written straight to the DOM in an animation frame, bypassing React renders. */
const PedalBars: FC = () => {
	const t = useTranslation();
	const store = useTelemetryStore();

	const throttleRef = useRef<HTMLDivElement>(null);
	const brakeRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let raf = 0;
		let lastVersion = -1;
		const loop = (): void => {
			raf = requestAnimationFrame(loop);
			if (store.frameVersion === lastVersion) return;
			lastVersion = store.frameVersion;
			const frame = store.latestFrame;
			if (throttleRef.current)
				throttleRef.current.style.height = `${(frame?.throttle ?? 0) * 100}%`;
			if (brakeRef.current) brakeRef.current.style.height = `${(frame?.brake ?? 0) * 100}%`;
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	}, [store]);

	return (
		<div className={classes.pedals}>
			<div className={classes.pedal}>
				<div className={classes.pedalTrack}>
					<div
						ref={brakeRef}
						className={classes.pedalFill}
						data-pedal="brake"
					/>
				</div>
				<span>{t('driver.brake')}</span>
			</div>
			<div className={classes.pedal}>
				<div className={classes.pedalTrack}>
					<div
						ref={throttleRef}
						className={classes.pedalFill}
						data-pedal="throttle"
					/>
				</div>
				<span>{t('driver.throttle')}</span>
			</div>
		</div>
	);
};

export default PedalBars;
