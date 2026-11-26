<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import IndicadorTarefa from '$lib/components/IndicadorTarefa.svelte';
	import ModalConfirmacao from '$lib/components/ModalConfirmacao.svelte';
	import { confirmarAcao } from '$lib/stores/confirmacao.svelte';

	let { data, children } = $props();

	let menuAberto = $state(false);
	let saindo = $state(false);

	const unidade = $derived(data.unidade);
	const mostrarNav = $derived(Boolean(unidade && !unidade.deve_trocar_senha));

	const links = $derived(
		unidade?.role === 'ADMIN'
			? ([
					{ href: '/', label: 'Depósito / Bens', icon: 'bens' },
					{ href: '/gerenciar', label: 'Caixas e Apreensões', icon: 'caixas' },
					{ href: '/importar', label: 'Importar PDFs', icon: 'importar' },
					{ href: '/admin/unidades', label: 'Unidades', icon: 'unidades' }
				] as const)
			: ([
					{ href: '/', label: 'Depósito / Bens', icon: 'bens' },
					{ href: '/gerenciar', label: 'Caixas e Apreensões', icon: 'caixas' },
					{ href: '/importar', label: 'Importar PDFs', icon: 'importar' }
				] as const)
	);

	afterNavigate(() => {
		menuAberto = false;
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') menuAberto = false;
	}

	async function sair() {
		if (saindo) return;
		const ok = await confirmarAcao({
			titulo: 'Encerrar sessão',
			mensagem: 'Deseja realmente sair do sistema Custódia PCCE?',
			textoConfirmar: 'Sair'
		});
		if (!ok) return;
		saindo = true;
		try {
			await fetch('/api/auth/logout', { method: 'POST' });
			await invalidateAll();
			await goto('/login');
		} finally {
			saindo = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="shell">
	<header class="topbar">
		<div class="topbar-inner">
			<a href={mostrarNav ? '/' : '/login'} class="brand" aria-label="Custódia PCCE — página inicial">
				<span class="brand-mark" aria-hidden="true">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
						<path d="m9 12 2 2 4-4" />
					</svg>
				</span>
				<span class="brand-text">
					<strong>Custódia PCCE</strong>
					<span>{unidade ? unidade.nome : 'Apreensões e Restituições'}</span>
				</span>
			</a>

			{#if mostrarNav}
				<button
					type="button"
					class="menu-toggle"
					aria-label={menuAberto ? 'Fechar menu' : 'Abrir menu'}
					aria-expanded={menuAberto}
					aria-controls="nav-principal"
					onclick={() => (menuAberto = !menuAberto)}
				>
					{#if menuAberto}
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
					{:else}
						<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
					{/if}
				</button>

				<nav id="nav-principal" class="nav" class:open={menuAberto} aria-label="Navegação principal">
					{#each links as link}
						<a
							href={link.href}
							class="nav-link"
							class:active={page.url.pathname === link.href}
							aria-current={page.url.pathname === link.href ? 'page' : undefined}
						>
							<span class="nav-icon" aria-hidden="true">
								{#if link.icon === 'bens'}
									<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z" /></svg>
								{:else if link.icon === 'caixas'}
									<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>
								{:else if link.icon === 'importar'}
									<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5M12 3v12" /></svg>
								{:else}
									<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v.01M9 12v.01M9 15v.01M9 18v.01" /></svg>
								{/if}
							</span>
							{link.label}
						</a>
					{/each}

					<div class="nav-user">
						<a
							href="/trocar-senha"
							class="nav-link nav-sub"
							class:active={page.url.pathname === '/trocar-senha'}
							title="Alterar senha da unidade"
						>
							Senha
						</a>
						<button type="button" class="nav-logout" onclick={sair} disabled={saindo}>
							{saindo ? 'Saindo...' : 'Sair'}
						</button>
					</div>
				</nav>
			{/if}
		</div>
	</header>

	{#if menuAberto}
		<button
			type="button"
			class="nav-backdrop"
			aria-label="Fechar menu"
			onclick={() => (menuAberto = false)}
		></button>
	{/if}

	<main class="content">
		{@render children()}
	</main>

	<IndicadorTarefa />
	<ModalConfirmacao />
</div>

<style>
	.shell {
		min-height: 100vh;
		min-height: 100dvh;
	}

	.topbar {
		position: sticky;
		top: 0;
		z-index: 40;
		background: linear-gradient(180deg, hsl(222 47% 12%), hsl(222 47% 9.5%));
		border-bottom: 1px solid hsl(222 30% 20%);
		box-shadow: 0 1px 0 hsl(0 0% 100% / 0.03) inset, 0 4px 16px hsl(222 50% 5% / 0.18);
		padding-top: env(safe-area-inset-top);
	}

	.topbar-inner {
		max-width: 1240px;
		height: var(--header-h);
		margin: 0 auto;
		padding: 0 1.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		text-decoration: none;
		color: #fff;
		min-width: 0;
	}

	.brand-mark {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		flex-shrink: 0;
		border-radius: 10px;
		background: linear-gradient(145deg, hsl(221 80% 56%), hsl(224 76% 42%));
		box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.22), 0 2px 8px hsl(221 80% 40% / 0.4);
		color: #fff;
	}

	.brand-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		min-width: 0;
	}

	.brand-text strong {
		font-size: 0.98rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.brand-text span {
		font-size: 0.74rem;
		color: hsl(220 15% 68%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 0.2rem;
	}

	.nav-link {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.5rem 0.75rem;
		border-radius: 8px;
		color: hsl(220 18% 76%);
		text-decoration: none;
		font-size: 0.86rem;
		font-weight: 500;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.nav-icon {
		display: inline-flex;
		opacity: 0.8;
	}

	.nav-link:hover {
		background: hsl(0 0% 100% / 0.07);
		color: #fff;
	}

	.nav-link.active {
		background: hsl(0 0% 100% / 0.11);
		color: #fff;
		box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.06);
	}

	.nav-link.active .nav-icon {
		opacity: 1;
		color: hsl(213 94% 72%);
	}

	.nav-user {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		margin-left: 0.45rem;
		padding-left: 0.55rem;
		border-left: 1px solid hsl(222 30% 24%);
	}

	.nav-sub {
		font-size: 0.82rem;
		padding: 0.42rem 0.6rem;
	}

	.nav-logout {
		border: 1px solid hsl(0 0% 100% / 0.16);
		background: hsl(0 0% 100% / 0.06);
		color: hsl(220 18% 86%);
		border-radius: 8px;
		padding: 0.42rem 0.72rem;
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.nav-logout:hover {
		background: hsl(350 72% 45% / 0.25);
		border-color: hsl(350 72% 60% / 0.5);
		color: #fff;
	}

	.menu-toggle {
		display: none;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 42px;
		border: 1px solid hsl(0 0% 100% / 0.12);
		border-radius: 10px;
		background: hsl(0 0% 100% / 0.05);
		color: #fff;
		cursor: pointer;
	}

	.nav-backdrop {
		display: none;
	}

	.content {
		max-width: 1240px;
		margin: 0 auto;
		padding: 1.6rem 1.25rem 4rem;
	}

	@media (max-width: 960px) {
		.menu-toggle {
			display: inline-flex;
		}

		.nav {
			position: fixed;
			top: calc(var(--header-h) + env(safe-area-inset-top));
			left: 0;
			right: 0;
			z-index: 39;
			flex-direction: column;
			align-items: stretch;
			gap: 0.25rem;
			padding: 0.6rem 0.75rem 0.9rem;
			background: hsl(222 47% 9.5%);
			border-bottom: 1px solid hsl(222 30% 20%);
			box-shadow: var(--shadow-lg);
			transform: translateY(-8px);
			opacity: 0;
			visibility: hidden;
			pointer-events: none;
			transition:
				transform 0.18s ease,
				opacity 0.18s ease,
				visibility 0.18s;
		}

		.nav.open {
			transform: none;
			opacity: 1;
			visibility: visible;
			pointer-events: auto;
		}

		.nav-link {
			padding: 0.85rem 0.9rem;
			font-size: 0.97rem;
		}

		.nav-user {
			margin-left: 0;
			padding-left: 0;
			margin-top: 0.45rem;
			padding-top: 0.55rem;
			border-left: none;
			border-top: 1px solid hsl(222 30% 22%);
			justify-content: space-between;
		}

		.nav-logout {
			padding: 0.65rem 1rem;
			font-size: 0.9rem;
		}

		.nav-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			z-index: 38;
			border: none;
			padding: 0;
			background: hsl(222 47% 6% / 0.45);
			backdrop-filter: blur(2px);
			cursor: default;
		}
	}

	@media (max-width: 720px) {
		.topbar-inner {
			padding: 0 0.9rem;
		}

		.content {
			padding: 1rem 0.85rem 3rem;
		}
	}

	@media (max-width: 380px) {
		.brand-text span {
			display: none;
		}
	}
</style>
