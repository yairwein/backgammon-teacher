import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/tests/**/*.test.ts'],
		alias: {
			'$lib': '/src/lib',
			'$lib/*': '/src/lib/*'
		}
	}
});
