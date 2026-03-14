/**
 * LLM explanation layer.
 * Abstract provider interface so OpenAI / Anthropic / local can be swapped.
 */

import { env } from '$env/dynamic/private';
import { buildSystemPrompt, buildExplanationPrompt, type ExplanationRequest, type ExplanationResult } from './prompt.js';

/**
 * Abstract LLM provider interface.
 */
export interface LLMProvider {
	name: string;
	generateExplanation(systemPrompt: string, userPrompt: string): Promise<string>;
}

/**
 * Anthropic Claude provider.
 */
class AnthropicProvider implements LLMProvider {
	name = 'anthropic';

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const apiKey = env.LLM_API_KEY;
		if (!apiKey) throw new Error('LLM_API_KEY not set');

		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-6',
				max_tokens: 1024,
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }]
			})
		});

		if (!response.ok) {
			throw new Error(`Anthropic API error: ${response.status} ${await response.text()}`);
		}

		const data = await response.json();
		return data.content[0].text;
	}
}

/**
 * OpenAI provider.
 */
class OpenAIProvider implements LLMProvider {
	name = 'openai';

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const apiKey = env.LLM_API_KEY;
		if (!apiKey) throw new Error('LLM_API_KEY not set');

		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: 'gpt-4o',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 1024,
				response_format: { type: 'json_object' }
			})
		});

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status} ${await response.text()}`);
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}
}

/**
 * Google Gemini provider via Vertex AI.
 * Uses Application Default Credentials (gcloud auth / service account).
 */
class GeminiProvider implements LLMProvider {
	name = 'gemini';

	async generateExplanation(systemPrompt: string, userPrompt: string): Promise<string> {
		const project = env.GCP_PROJECT;
		const location = env.GCP_LOCATION || 'us-central1';
		const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite-preview';

		if (!project) throw new Error('GCP_PROJECT not set');

		const accessToken = await getGcpAccessToken();
		const host = location === 'global'
			? 'aiplatform.googleapis.com'
			: `${location}-aiplatform.googleapis.com`;
		const url = `https://${host}/v1beta1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

		const response = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${accessToken}`
			},
			body: JSON.stringify({
				systemInstruction: { parts: [{ text: systemPrompt }] },
				contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
				generationConfig: {
					maxOutputTokens: 4096,
					responseMimeType: 'application/json'
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Vertex AI error: ${response.status} ${await response.text()}`);
		}

		const data = await response.json();
		return data.candidates[0].content.parts[0].text;
	}
}

/**
 * Get a GCP access token via Application Default Credentials.
 * In dev: uses `gcloud auth print-access-token`.
 * In production (GCE/Cloud Run): uses the metadata server.
 */
async function getGcpAccessToken(): Promise<string> {
	// Try metadata server first (works on GCE, Cloud Run, GKE)
	try {
		const res = await fetch(
			'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
			{ headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(1000) }
		);
		if (res.ok) {
			const data = await res.json();
			return data.access_token;
		}
	} catch {
		// Not on GCP — fall through to gcloud
	}

	// Fall back to gcloud CLI (local dev)
	const { execSync } = await import('child_process');
	const token = execSync('gcloud auth print-access-token', { encoding: 'utf-8' }).trim();
	if (!token) throw new Error('Failed to get access token from gcloud');
	return token;
}

/**
 * Mock provider for testing / development without API keys.
 */
class MockProvider implements LLMProvider {
	name = 'mock';

	async generateExplanation(_systemPrompt: string, _userPrompt: string): Promise<string> {
		return JSON.stringify({
			summary: 'This move leaves a blot in a dangerous position.',
			reasons: [
				'The played move leaves an exposed checker that can be hit.',
				'The best move builds the home board instead.'
			],
			coach_tip: 'When in doubt, prioritize safety and building your prime.',
			confidence: 'medium'
		});
	}
}

const providers: Record<string, () => LLMProvider> = {
	anthropic: () => new AnthropicProvider(),
	openai: () => new OpenAIProvider(),
	gemini: () => new GeminiProvider(),
	mock: () => new MockProvider()
};

/**
 * Get the configured LLM provider.
 */
export function getLLMProvider(): LLMProvider {
	const providerName = env.LLM_PROVIDER || 'mock';
	const factory = providers[providerName];
	if (!factory) {
		console.warn(`Unknown LLM provider "${providerName}", falling back to mock`);
		return new MockProvider();
	}
	return factory();
}

/**
 * Generate an explanation for a blunder.
 */
export async function explainBlunder(request: ExplanationRequest): Promise<ExplanationResult> {
	const provider = getLLMProvider();
	const systemPrompt = buildSystemPrompt();
	const userPrompt = buildExplanationPrompt(request);

	const raw = await provider.generateExplanation(systemPrompt, userPrompt);

	try {
		// Extract JSON from response (handle markdown code blocks)
		const jsonStr = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
		const parsed = JSON.parse(jsonStr);
		return {
			summary: parsed.summary || 'Analysis unavailable',
			simple: {
				race: parsed.simple?.race || '',
				board: parsed.simple?.board || '',
				threat: parsed.simple?.threat || ''
			},
			reasons: parsed.reasons || [],
			coachTip: parsed.coach_tip || '',
			confidence: parsed.confidence || 'low'
		};
	} catch {
		return {
			summary: raw.slice(0, 200),
			simple: { race: '', board: '', threat: '' },
			reasons: [],
			coachTip: '',
			confidence: 'low'
		};
	}
}
