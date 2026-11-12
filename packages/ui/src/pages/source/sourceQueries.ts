import { useMutation, useQuery, useQueryClient } from 'react-query';

import { TImportResult } from '@racing/shared';

import { apiFetch } from 'src/services/apiFetch';
import { qs } from 'src/services/functions';

import { API_PATHS } from 'src/constants/apiConstants';

import { TF1Driver, TF1Session } from './sourceTypings';

export const f1SessionsQueryKey = 'source/f1Sessions';
export const f1DriversQueryKey = 'source/f1Drivers';
export const recordingsQueryKey = 'source/recordings';

const fetchF1Sessions = async ({ queryKey: [, year] }: { queryKey: [string, number] }) =>
	apiFetch.json<TF1Session[]>(qs`${API_PATHS.f1Sessions}`.query({ year }));

const fetchF1Drivers = async ({
	queryKey: [, sessionKey],
}: {
	queryKey: [string, number | null];
}) => apiFetch.json<TF1Driver[]>(qs`${API_PATHS.f1Drivers}`.query({ session_key: sessionKey }));

export const useF1Sessions = (year: number, isEnabled: boolean) => {
	const query = useQuery<TF1Session[], unknown, TF1Session[], [string, number]>({
		queryKey: [f1SessionsQueryKey, year],
		queryFn: fetchF1Sessions,
		enabled: isEnabled,
		staleTime: Infinity,
	});

	return {
		f1Sessions: [...(query.data ?? [])].sort((a, b) =>
			a.date_start.localeCompare(b.date_start),
		),
		isF1SessionsLoading: query.isLoading,
		isF1SessionsError: query.isError,
	};
};

export const useF1Drivers = (sessionKey: number | null) => {
	const query = useQuery<TF1Driver[], unknown, TF1Driver[], [string, number | null]>({
		queryKey: [f1DriversQueryKey, sessionKey],
		queryFn: fetchF1Drivers,
		enabled: sessionKey !== null,
		staleTime: Infinity,
	});

	return {
		f1Drivers: [...(query.data ?? [])].sort((a, b) => a.driver_number - b.driver_number),
		isF1DriversLoading: query.isLoading,
	};
};

export const useRecordings = () => {
	const query = useQuery<string[]>({
		queryKey: [recordingsQueryKey],
		queryFn: () => apiFetch.json<string[]>(API_PATHS.recordings),
	});

	return { recordings: query.data ?? [], isRecordingsLoading: query.isLoading };
};

const uploadFiles = async (files: File[]) => {
	const body = new FormData();
	files.forEach(file => body.append('file', file, file.name));
	return apiFetch.json<TImportResult>(API_PATHS.imports, { method: 'POST', body });
};

/** Uploads recorded files to the relay, which turns them into a recording for the replay. */
export const useImportFiles = () => {
	const queryClient = useQueryClient();
	const mutation = useMutation<TImportResult, unknown, File[]>(uploadFiles, {
		onSuccess: () => queryClient.invalidateQueries(recordingsQueryKey),
	});

	return {
		importFiles: mutation.mutate,
		importResult: mutation.data ?? null,
		importError: mutation.error,
		isImporting: mutation.isLoading,
	};
};
