import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from 'react-query';

import { TImportedRecording, TImportResult } from '@racing/shared';

import { apiFetch } from 'src/services/apiFetch';
import { ServerStatusError } from 'src/services/serverStatusError';

import { API_PATHS } from 'src/constants/apiConstants';

export const importsQueryKey = 'upload/imports';

export const useImports = (isEnabled: boolean) => {
	const query = useQuery<TImportedRecording[]>({
		queryKey: [importsQueryKey],
		queryFn: () => apiFetch.json<TImportedRecording[]>(API_PATHS.imports),
		enabled: isEnabled,
	});

	return { imports: query.data ?? [], isImportsLoading: query.isLoading };
};

type TUploadState =
	| { phase: 'idle' }
	| { phase: 'uploading'; progress: number }
	| { phase: 'processing' }
	| { phase: 'done'; result: TImportResult }
	| { phase: 'error'; error: unknown };

/**
 * Sends the files to the relay with upload progress (fetch has none, so this uses XHR), then
 * waits while the relay converts them.
 */
export const useUpload = () => {
	const queryClient = useQueryClient();
	const [state, setState] = useState<TUploadState>({ phase: 'idle' });

	const upload = useCallback(
		(files: File[]) => {
			const body = new FormData();
			files.forEach(file => body.append('file', file, file.name));
			const request = new XMLHttpRequest();
			request.open('POST', API_PATHS.imports);
			request.upload.onprogress = event => {
				if (!event.lengthComputable) return;
				const progress = event.loaded / event.total;
				setState(
					progress >= 1 ? { phase: 'processing' } : { phase: 'uploading', progress },
				);
			};
			request.upload.onload = () => setState({ phase: 'processing' });
			request.onload = () => {
				let parsed: { messageKey?: string; message?: string } & Partial<TImportResult> = {};
				try {
					parsed = JSON.parse(request.responseText);
				} catch {
					// Not JSON: reported as a failed upload below.
				}
				if (request.status >= 200 && request.status < 300 && parsed.file) {
					setState({ phase: 'done', result: parsed as TImportResult });
					queryClient.invalidateQueries(importsQueryKey);
					queryClient.invalidateQueries('source/recordings');
				} else {
					setState({
						phase: 'error',
						error: new ServerStatusError(
							request.status,
							parsed.messageKey ?? null,
							parsed.message ?? request.statusText,
						),
					});
				}
			};
			request.onerror = () => setState({ phase: 'error', error: new Error('Network error') });
			setState({ phase: 'uploading', progress: 0 });
			request.send(body);
		},
		[queryClient],
	);

	const reset = useCallback(() => setState({ phase: 'idle' }), []);

	return { state, upload, reset };
};
