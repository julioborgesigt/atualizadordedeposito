<script lang="ts">
	import { page } from '$app/state';
	let { children } = $props();
</script>

<div class="shell">
	<header class="topbar">
		<div class="brand">
			<strong>Custódia PCCE</strong>
			<span>Controle de Apreensões e Restituições</span>
		</div>
		<nav>
			<a href="/" class:active={page.url.pathname === '/'}>Depósito / Bens</a>
			<a href="/gerenciar" class:active={page.url.pathname === '/gerenciar'}>
				Gerenciar Caixas e Apreensões
			</a>
			<a href="/importar" class:active={page.url.pathname === '/importar'}>+ Importar PDFs</a>
		</nav>
	</header>

	<main class="content">
		{@render children()}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		background: #f4f6f9;
		color: #1e293b;
	}
	.topbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.9rem 1.5rem;
		background: #0f172a;
		color: #fff;
		gap: 1rem;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		flex-direction: column;
	}
	.brand span {
		font-size: 0.8rem;
		color: #94a3b8;
	}
	nav {
		display: flex;
		gap: 0.75rem;
	}
	nav a {
		color: #cbd5e1;
		text-decoration: none;
		padding: 0.45rem 0.9rem;
		border-radius: 6px;
		font-weight: 500;
		font-size: 0.9rem;
	}
	nav a:hover,
	nav a.active {
		background: #2563eb;
		color: #fff;
	}
	.content {
		max-width: 1200px;
		margin: 1.5rem auto;
		padding: 0 1rem 3rem;
	}
</style>
