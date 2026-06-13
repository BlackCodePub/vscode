#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PipelineResponse = {
	status: 'completed' | 'blocked' | 'needs-input';
	summary: string;
	actions: Array<{
		type: 'edit' | 'create' | 'run-command' | 'analysis';
		target: string;
		description: string;
	}>;
	validations: Array<{
		name: string;
		result: 'passed' | 'failed' | 'skipped';
		details?: string;
	}>;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-ollama-pipeline.ts');
const sampleRequestPath = resolve(scriptDir, '..', 'examples', 'request.sample.json');
const invalidRequestPath = resolve(scriptDir, '..', 'examples', 'request.invalid.sample.json');

type RunResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

function runWithArgs(args: string[]): Promise<RunResult> {
	return new Promise((resolvePromise, rejectPromise) => {
		const child = spawn(process.execPath, ['--experimental-strip-types', pipelinePath, ...args], {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stdout = '';
		let stderr = '';
		child.stdout.on('data', chunk => {
			stdout += chunk.toString();
		});
		child.stderr.on('data', chunk => {
			stderr += chunk.toString();
		});

		child.on('error', error => {
			rejectPromise(error);
		});

		child.on('close', code => {
			resolvePromise({ status: code, stdout, stderr });
		});
	});
}

function parseStdoutAsJson(stdout: string): PipelineResponse {
	try {
		return JSON.parse(stdout) as PipelineResponse;
	} catch {
		console.error('Saida do pipeline Ollama nao e JSON valido.');
		console.error(stdout);
		process.exit(1);
	}
}

async function startMockServer() {
	const server = createServer((req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== 'POST' || req.url !== '/api/generate') {
			res.statusCode = 404;
			res.end('not-found');
			return;
		}

		const chunks: Buffer[] = [];
		req.on('data', chunk => chunks.push(Buffer.from(chunk)));
		req.on('end', () => {
			const bodyText = Buffer.concat(chunks).toString('utf-8');
			if (!bodyText.includes('Request:')) {
				res.statusCode = 400;
				res.end(JSON.stringify({ error: 'prompt-invalido' }));
				return;
			}

			const suggestion = {
				summary: 'Resumo sugerido pelo modelo local Ollama.',
				actions: [
					{
						type: 'analysis',
						target: 'workspace',
						description: 'Conferir impacto das mudancas antes da aplicacao.'
					}
				],
				nextSteps: [
					'Revisar diff final com foco em seguranca.',
					'Executar release-check apos ajustes.'
				]
			};
			res.setHeader('content-type', 'application/json');
			res.end(JSON.stringify({ response: JSON.stringify(suggestion) }));
		});
	});

	await new Promise<void>((resolvePromise, rejectPromise) => {
		server.once('error', error => rejectPromise(error));
		server.listen(0, '127.0.0.1', () => resolvePromise());
	});

	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Falha ao iniciar servidor mock de Ollama.');
	}

	const baseUrl = `http://127.0.0.1:${address.port}`;
	return {
		server,
		baseUrl,
		close: () => new Promise<void>(resolvePromise => server.close(() => resolvePromise()))
	};
}

(async () => {
	const mock = await startMockServer();
	try {
		const successRun = await runWithArgs(['--request', sampleRequestPath, '--ollama-url', mock.baseUrl, '--model', 'mock-model']);
		if (successRun.status !== 0) {
			console.error('Falha no teste Ollama com servidor mock.');
			console.error(successRun.stderr);
			process.exit(1);
		}

		const successPayload = parseStdoutAsJson(successRun.stdout);
		if (successPayload.summary !== 'Resumo sugerido pelo modelo local Ollama.') {
			console.error('Resumo de sucesso nao refletiu resposta do modelo mock.');
			console.error(`Resumo recebido: ${successPayload.summary}`);
			console.error(`Saida completa: ${successRun.stdout}`);
			process.exit(1);
		}
		const ollamaValidation = successPayload.validations.find(item => item.name === 'ollama-inference');
		if (!ollamaValidation || ollamaValidation.result !== 'passed') {
			console.error('Validacao ollama-inference deveria estar passed em sucesso mock.');
			process.exit(1);
		}

		const fallbackRun = await runWithArgs(['--request', sampleRequestPath, '--ollama-url', 'http://127.0.0.1:65512', '--timeout-ms', '1000']);
		if (fallbackRun.status !== 0) {
			console.error('Falha no teste de fallback Ollama (nao strict).');
			console.error(fallbackRun.stderr);
			process.exit(1);
		}

		const fallbackPayload = parseStdoutAsJson(fallbackRun.stdout);
		const fallbackValidation = fallbackPayload.validations.find(item => item.name === 'ollama-inference');
		if (!fallbackValidation || fallbackValidation.result !== 'failed') {
			console.error('Validacao ollama-inference deveria estar failed no fallback nao strict.');
			process.exit(1);
		}
		if (!fallbackValidation.details?.includes('fallback deterministico')) {
			console.error('Detalhes de fallback nao encontrados na validacao ollama-inference.');
			process.exit(1);
		}

		const strictRun = await runWithArgs(['--request', sampleRequestPath, '--ollama-url', 'http://127.0.0.1:65512', '--timeout-ms', '1000', '--strict-ollama']);
		if (strictRun.status !== 4) {
			console.error('Falha no teste strict-ollama: exit code esperado 4.');
			console.error(`Exit code recebido: ${strictRun.status ?? 'null'}`);
			console.error(strictRun.stderr);
			process.exit(1);
		}
		if (!strictRun.stderr.includes('Falha na inferencia Ollama (strict):')) {
			console.error('Mensagem esperada para strict-ollama nao encontrada.');
			console.error(strictRun.stderr);
			process.exit(1);
		}

		const invalidRun = await runWithArgs(['--request', invalidRequestPath, '--ollama-url', mock.baseUrl]);
		if (invalidRun.status !== 2) {
			console.error('Falha no teste de request invalido para pipeline Ollama: exit code esperado 2.');
			console.error(`Exit code recebido: ${invalidRun.status ?? 'null'}`);
			console.error(invalidRun.stderr);
			process.exit(1);
		}
		if (!invalidRun.stderr.includes('Falha na validacao do request (schema):')) {
			console.error('Mensagem de schema invalido nao encontrada para pipeline Ollama.');
			console.error(invalidRun.stderr);
			process.exit(1);
		}
	} finally {
		await mock.close();
	}

	console.log('Teste Ollama passou para cenarios de sucesso mock, fallback, strict e request invalido.');
})();
