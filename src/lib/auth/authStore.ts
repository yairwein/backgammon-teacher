import { writable, get } from 'svelte/store';

export interface AuthState {
	signedIn: boolean;
	idToken: string | null;
	name: string;
	email: string;
	picture: string;
}

const STORAGE_KEY = 'bg_auth';

/** Decode JWT payload without verification (client-side only) */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
	try {
		return JSON.parse(atob(token.split('.')[1]));
	} catch {
		return null;
	}
}

/** Check if a JWT token is expired (with 60s buffer) */
function isTokenExpired(token: string): boolean {
	const payload = decodeJwtPayload(token);
	if (!payload?.exp) return true;
	return Date.now() / 1000 > (payload.exp as number) - 60;
}

function createAuthStore() {
	const { subscribe, set, update } = writable<AuthState>({
		signedIn: false,
		idToken: null,
		name: '',
		email: '',
		picture: ''
	});

	return {
		subscribe,
		signIn(credential: string, name: string, email: string, picture: string) {
			const state: AuthState = { signedIn: true, idToken: credential, name, email, picture };
			set(state);
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
			} catch { /* SSR guard */ }
		},
		signOut() {
			set({ signedIn: false, idToken: null, name: '', email: '', picture: '' });
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch { /* SSR guard */ }
		},
		restore() {
			try {
				const raw = localStorage.getItem(STORAGE_KEY);
				if (raw) {
					const state: AuthState = JSON.parse(raw);
					if (state.signedIn && state.idToken) {
						set(state);
					}
				}
			} catch { /* SSR guard */ }
		},
		/** Get a fresh ID token, triggering silent GSI refresh if expired */
		async getFreshToken(): Promise<string | null> {
			const state = get({ subscribe });
			if (!state.signedIn || !state.idToken) return null;

			// Dev token never expires
			if (state.idToken === 'dev-test-token') return state.idToken;

			if (!isTokenExpired(state.idToken)) {
				return state.idToken;
			}

			// Token expired — try silent GSI refresh
			if (typeof window !== 'undefined' && window.google?.accounts?.id) {
				return new Promise<string | null>((resolve) => {
					const timeout = setTimeout(() => resolve(null), 5000);
					window.google.accounts.id.initialize({
						client_id: state.idToken ? decodeJwtPayload(state.idToken)?.aud as string : '',
						callback: (response: { credential: string }) => {
							clearTimeout(timeout);
							const payload = decodeJwtPayload(response.credential);
							if (payload) {
								const name = (payload.name as string) || state.name;
								const email = (payload.email as string) || state.email;
								const picture = (payload.picture as string) || state.picture;
								// Update the store with fresh token
								const newState: AuthState = { signedIn: true, idToken: response.credential, name, email, picture };
								set(newState);
								try {
									localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
								} catch { /* SSR guard */ }
								resolve(response.credential);
							} else {
								resolve(null);
							}
						},
						auto_select: true
					});
					window.google.accounts.id.prompt();
				});
			}

			return null;
		}
	};
}

export const auth = createAuthStore();
