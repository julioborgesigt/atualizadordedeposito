import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export async function calcularSha256(buffer: ArrayBuffer): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
	return Array.from(new Uint8Array(hashBuffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function extrairTextoPdf(file: File): Promise<{ texto: string; hashSha256: string }> {
	const buffer = await file.arrayBuffer();
	const hashSha256 = await calcularSha256(buffer);

	const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
	const paginas: string[] = [];

	for (let p = 1; p <= pdf.numPages; p++) {
		const page = await pdf.getPage(p);
		const content = await page.getTextContent();

		const linhas: string[] = [];
		let linhaAtual = '';
		let ultimoY: number | null = null;

		for (const item of content.items) {
			if (!('str' in item)) continue;
			const y = Math.round(item.transform[5]);

			if (ultimoY !== null && Math.abs(y - ultimoY) > 3) {
				if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
				linhaAtual = item.str;
			} else {
				linhaAtual += (linhaAtual && !linhaAtual.endsWith(' ') ? ' ' : '') + item.str;
			}

			if (item.hasEOL) {
				if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
				linhaAtual = '';
				ultimoY = null;
			} else {
				ultimoY = y;
			}
		}

		if (linhaAtual.trim()) linhas.push(linhaAtual.trim());
		paginas.push(linhas.join('\n'));
	}

	const texto = paginas.join('\n');
	if (texto.replace(/\s+/g, '').length < 50) {
		throw new Error(
			`O arquivo "${file.name}" parece ser um PDF escaneado (sem texto selecionável).`
		);
	}

	return { texto, hashSha256 };
}
