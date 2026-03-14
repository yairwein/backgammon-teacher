import { OAuth2Client } from 'google-auth-library';
import { env } from '$env/dynamic/private';
import { dev } from '$app/environment';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
	if (!client) {
		const clientId = env.GOOGLE_CLIENT_ID;
		if (!clientId) throw new Error('GOOGLE_CLIENT_ID env var required');
		client = new OAuth2Client(clientId);
	}
	return client;
}

export interface GoogleUser {
	userId: string; // sub claim
	email: string;
	name: string;
	picture?: string;
}

const DEV_TOKEN = 'dev-test-token';

export function isDevMode(): boolean {
	return dev;
}

export async function verifyGoogleToken(idToken: string): Promise<GoogleUser> {
	// In dev mode, accept a fake test token
	if (isDevMode() && idToken === DEV_TOKEN) {
		return {
			userId: 'dev-user-001',
			email: 'dev@localhost',
			name: 'Dev User'
		};
	}

	const ticket = await getClient().verifyIdToken({
		idToken,
		audience: env.GOOGLE_CLIENT_ID
	});
	const payload = ticket.getPayload();
	if (!payload?.sub) throw new Error('Invalid token: missing sub claim');

	return {
		userId: payload.sub,
		email: payload.email || '',
		name: payload.name || '',
		picture: payload.picture
	};
}
