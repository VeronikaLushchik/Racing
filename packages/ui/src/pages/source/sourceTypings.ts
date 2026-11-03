export interface TF1Session {
	session_key: number;
	country_name: string;
	circuit_short_name: string;
	date_start: string;
}

export interface TF1Driver {
	driver_number: number;
	full_name: string;
	name_acronym: string;
	team_name: string;
}
