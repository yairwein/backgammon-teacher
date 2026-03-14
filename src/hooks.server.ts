/**
 * Server hooks — runs once at startup.
 * Validates that GNU Backgammon is available before accepting requests.
 * Also provides global error logging for all API requests.
 */

import { execSync } from 'child_process';
import { env } from '$env/dynamic/private';
import type { HandleServerError } from '@sveltejs/kit';

const gnubgPath = env.GNU_BG_PATH || 'gnubg';

try {
	// If it's an absolute path, check the file exists; otherwise use `which`
	if (gnubgPath.startsWith('/')) {
		execSync(`test -x "${gnubgPath}"`, { stdio: 'ignore' });
	} else {
		execSync(`which ${gnubgPath}`, { stdio: 'ignore' });
	}
} catch {
	console.error(`\n  ERROR: GNU Backgammon not found at "${gnubgPath}".`);
	console.error('  Install gnubg or set GNU_BG_PATH in your .env file.\n');
	process.exit(1);
}

console.log(`GNU Backgammon found at: ${gnubgPath}`);

export const handleError: HandleServerError = ({ error, event, status, message }) => {
	console.error(`[${status}] ${event.request.method} ${event.url.pathname}${event.url.search}: ${message}`, error);
	return { message };
};
