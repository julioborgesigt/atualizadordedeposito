<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="error-container">
	<div class="error-card">
		<span class="status-code">{page.status}</span>
		<h1>Ocorreu um imprevisto</h1>
		<p>{page.error?.message || 'A página solicitada não pôde ser carregada.'}</p>
		<a href="/" class="btn-voltar">Voltar para o Depósito</a>
	</div>
</div>

<style>
	.error-container {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 50vh;
		padding: 2rem 1rem;
	}
	.error-card {
		background: var(--surface-1, #131d33);
		border: 1px solid var(--border-color, #233354);
		border-radius: var(--radius-lg, 12px);
		padding: 2.5rem 2rem;
		max-width: 480px;
		width: 100%;
		text-align: center;
		box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
	}
	.status-code {
		display: inline-block;
		font-size: 2.5rem;
		font-weight: 800;
		color: var(--accent-color, #38bdf8);
		margin-bottom: 0.5rem;
	}
	h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-1, #f8fafc);
		margin-bottom: 0.75rem;
	}
	p {
		font-size: 0.95rem;
		color: var(--text-2, #94a3b8);
		margin-bottom: 1.5rem;
		line-height: 1.5;
		word-break: break-word;
	}
	.btn-voltar {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.65rem 1.25rem;
		border-radius: var(--radius-md, 8px);
		background-color: var(--accent-color, #38bdf8);
		color: #0b1324;
		font-weight: 600;
		text-decoration: none;
		transition: background-color 0.2s ease;
	}
	.btn-voltar:hover {
		background-color: var(--accent-hover, #7dd3fc);
	}
</style>
