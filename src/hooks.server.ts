import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = ({ error, event }) => {
	console.error('SERVER ERROR on', event.url.pathname, error);
	const err = error as Error;
	return {
		message: `${err?.message || 'Unknown error'} | Stack: ${err?.stack || 'No stack'}`
	};
};
