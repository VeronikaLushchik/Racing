import { FC, useEffect } from 'react';

import { buildOutline, trackIdOf } from '~@engines/racingMath/trackOutlineModel';
import { useTelemetryMeta } from 'src/modules/telemetry/useTelemetry';
import { findBestRecord } from 'src/pages/analysis/common/analysisFunctions';
import { trackLibrary } from './trackLibrary';

/**
 * Saves the outline of the session's best clean lap, so the track can be picked again later.
 * Sources without a track name (GT7) get a dated name the driver can change.
 */
const TrackLibrarySync: FC = () => {
	const { lapRecords, session } = useTelemetryMeta();

	useEffect(() => {
		const best = findBestRecord(lapRecords);
		if (!session || !best || !best.isValid || best.isPitLap) {
			return;
		}
		const savedAt = Date.now();
		const name =
			session.track ??
			`${session.title} · ${new Date(savedAt).toLocaleString(undefined, {
				dateStyle: 'short',
				timeStyle: 'short',
			})}`;
		trackLibrary.add(
			buildOutline(
				{
					step: best.step,
					x: best.channels.x,
					z: best.channels.z,
					lapTimeMs: best.lapTimeMs,
				},
				{
					id: session.track ? trackIdOf(session.track) : `track-${session.sessionId}`,
					name,
					savedAt,
					game: session.source,
					isNamed: Boolean(session.track),
				},
			),
		);
	}, [lapRecords, session]);

	return null;
};

export default TrackLibrarySync;
