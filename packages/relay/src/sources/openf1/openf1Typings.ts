/**
 * Row shapes of the OpenF1 REST API (https://openf1.org), historical data is free and needs
 * no key. Only the fields this project uses are listed.
 */

export interface TOf1Session {
	session_key: number;
	meeting_key: number;
	session_name: string;
	session_type: string;
	date_start: string;
	date_end: string;
	country_name: string;
	circuit_short_name: string;
	location: string;
	year: number;
}

export interface TOf1Driver {
	driver_number: number;
	full_name: string;
	name_acronym: string;
	team_name: string;
	team_colour: string | null;
}

export interface TOf1CarData {
	date: string;
	speed: number;
	rpm: number;
	n_gear: number;
	/** 0..100 */
	throttle: number;
	/** 0 or 100 (OpenF1 only reports brake on/off). */
	brake: number;
	drs: number;
}

export interface TOf1Location {
	date: string;
	x: number;
	y: number;
	z: number;
}

export interface TOf1Lap {
	lap_number: number;
	date_start: string | null;
	lap_duration: number | null;
	duration_sector_1: number | null;
	duration_sector_2: number | null;
	duration_sector_3: number | null;
	is_pit_out_lap: boolean;
}

export interface TOf1Stint {
	driver_number: number;
	stint_number: number;
	compound: string | null;
	lap_start: number;
	lap_end: number;
	tyre_age_at_start: number;
}

export interface TOf1Interval {
	date: string;
	driver_number: number;
	/** Seconds, or a string such as "+1 LAP", or null for the leader. */
	gap_to_leader: number | string | null;
	interval: number | string | null;
}

export interface TOf1Position {
	date: string;
	driver_number: number;
	position: number;
}

export interface TOf1Pit {
	driver_number: number;
	lap_number: number;
	pit_duration: number | null;
}

export interface TOf1SessionBundle {
	session: TOf1Session;
	drivers: TOf1Driver[];
	driverNumber: number;
	carData: TOf1CarData[];
	location: TOf1Location[];
	laps: TOf1Lap[];
	stints: TOf1Stint[];
	intervals: TOf1Interval[];
	positions: TOf1Position[];
	pits: TOf1Pit[];
}
