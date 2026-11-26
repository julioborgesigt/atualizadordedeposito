<script lang="ts">
	import { page } from '$app/state';
</script>

<div style="padding: 2rem; color: #fff; background: #1a1a2e; font-family: monospace;">
	<h1>Erro {page.status}</h1>
	<p style="color: #ff6b6b; font-size: 1.2rem;">{page.error?.message}</p>
	<pre style="white-space: pre-wrap; color: #aaa;">{JSON.stringify(page.error, null, 2)}</pre>
</div>
