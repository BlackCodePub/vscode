#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

type JsonObject = Record<string, unknown>;

type RequestPayload = {
	requestId: string;
	taskType: 'docs' | 'code' | 'refactor' | 'review' | 'setup';
	goal: string;
	constraints?: string[];
	context: {
		currentFile: string;
		selectedText: string;
		workspaceHints: string[];
		gitDiffSummary?: string;
	};
};

type ResponsePayload = {
	requestId: string;
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
	security: {
		secretsExposed: boolean;
		sensitiveAreaTouched: boolean;
		notes: string;
	};
	nextSteps?: string[];
};

type OllamaSuggestion = {
	summary?: string;
	actions?: Array<{
		type?: 'edit' | 'create' | 'run-command' | 'analysis';
		target?: string;
		description?: string;
	}>;
	nextSteps?: string[];
};

type ParsedArgs = {
	request: string;
	output: string;
	model: string;
	ollamaUrl: string;
	timeoutMs: number;
	strictOllama: boolean;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(scriptDir, '..', 'contracts');
const requestSchemaPath = resolve(contractsDir, 'request.schema.json');
const responseSchemaPath = resolve(contractsDir, 'response.schema.json');
const allowedActionTypes = ['edit', 'create', 'run-command', 'analysis'] as const;

function parseArgs(argv: string[]): { args?: ParsedArgs; error?: string } {
	const args: ParsedArgs = {
		request: '',
		output: '',
		model: 'llama3.1:8b',
		ollamaUrl: 'http://127.0.0.1:11434',
		timeoutMs: 60000,
		strictOllama: false
	};

	for (let i = 2; i < argv.length; i++) {
		const token = argv[i];
		if ((token === '--request' || token === '-r') && argv[i + 1]) {
			args.request = argv[++i];
			continue;
		}
		if ((token === '--output' || token === '-o') && argv[i + 1]) {
			args.output = argv[++i];
			continue;
		}
		if ((token === '--model' || token === '-m') && argv[i + 1]) {
			args.model = argv[++i];
			continue;
		}
		if (token === '--ollama-url' && argv[i + 1]) {
			args.ollamaUrl = argv[++i];
			continue;
		}
		if (token === '--timeout-ms' && argv[i + 1]) {
			const parsed = Number(argv[++i]);
			if (!Number.isFinite(parsed) || parsed <= 0) {
				return { error: 'Parametro --timeout-ms invalido. Informe inteiro positivo.' };
			}
			args.timeoutMs = Math.trunc(parsed);
			continue;
		}
		if (token === '--strict-ollama') {
			args.strictOllama = true;
			continue;
		}
		return { error: `Parametro nao reconhecido: ${token}` };
	}

	if (!args.request) {
		return { error: 'Parametro --request e obrigatorio.' };
	}

	return { args };
}

function readJsonFile(path: string): JsonObject {
	const raw = readFileSync(path, 'utf-8');
	return JSON.parse(raw) as JsonObject;
}

function formatSchemaErrors(errors: unknown[] | null | undefined) {
	if (!errors || errors.length === 0) {
		return ['Erro de validacao sem detalhes.'];
	}

	return errors.map(error => {
		const typed = error as { instancePath?: string; message?: string; params?: Record<string, unknown> };
		const location = typed.instancePath && typed.instancePath.length > 0 ? typed.instancePath : '/';
		const detail = typed.message ?? 'erro de validacao';
		const paramText = typed.params ? ` (${JSON.stringify(typed.params)})` : '';
		return `${location}: ${detail}${paramText}`;
	});
}

function createSchemaValidators() {
	const ajv = new Ajv2020({ allErrors: true, strict: false });
	const requestSchema = readJsonFile(requestSchemaPath);
	const responseSchema = readJsonFile(responseSchemaPath);
	const validateRequest = ajv.compile<RequestPayload>(requestSchema);
	const validateResponse = ajv.compile<ResponsePayload>(responseSchema);
	return { validateRequest, validateResponse };
}

function detectSensitiveArea(request: RequestPayload) {
	const text = [request.goal, ...(request.constraints || []), request.context?.selectedText || '']
		.join(' ')
		.toLowerCase();
	return /(auth|autentic|crypto|criptograf|token|senha|password)/.test(text);
}

function detectSecretExposure(request: RequestPayload) {
	const text = [request.goal, request.context?.selectedText || ''].join(' ');
	return /(api[_-]?key\s*=|token\s*=|password\s*=|senha\s*=)/i.test(text);
}

function buildDefaultActions(request: RequestPayload): ResponsePayload['actions'] {
	const actions: ResponsePayload['actions'] = [];
	actions.push({
		type: 'analysis',
		target: request.context.currentFile,
		description: 'Analisa o arquivo atual e define mudancas minimas para cumprir o objetivo.'
	});

	if (request.taskType === 'docs') {
		actions.push({
			type: 'edit',
			target: request.context.currentFile,
			description: 'Aplica ajuste de documentacao alinhado ao objetivo informado.'
		});
	} else if (request.taskType === 'code' || request.taskType === 'refactor') {
		actions.push({
			type: 'edit',
			target: request.context.currentFile,
			description: 'Implementa alteracoes incrementais com foco em seguranca e rastreabilidade.'
		});
	} else {
		actions.push({
			type: 'analysis',
			target: 'workspace',
			description: 'Consolida proximo passo sem alterar codigo fora do escopo.'
		});
	}

	return actions;
}

function buildDefaultSummary() {
	return 'Processamento MVP1 com Ollama concluido com contrato de saida estruturado.';
}

function buildDefaultNextSteps() {
	return [
		'Executar validacoes tecnicas aplicaveis (build, type-check e testes).',
		'Preparar resumo para revisao humana e draft PR.'
	];
}

function buildOllamaPrompt(request: RequestPayload) {
	const compactRequest = JSON.stringify(request);
	return [
		'Voce esta ajudando no projeto NB-Code.',
		'Retorne apenas JSON valido, sem markdown, sem explicacoes.',
		'O JSON deve conter apenas os campos opcionais: summary (string), actions (array), nextSteps (array).',
		'actions usa objetos com type em edit|create|run-command|analysis, target e description.',
		'Nao invente segredos, tokens ou credenciais.',
		`Request: ${compactRequest}`
	].join('\n');
}

function tryParseJson(text: string): unknown | undefined {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

function extractJsonObjectText(raw: string): string | undefined {
	const direct = tryParseJson(raw);
	if (direct && typeof direct === 'object') {
		return raw;
	}

	const firstBrace = raw.indexOf('{');
	const lastBrace = raw.lastIndexOf('}');
	if (firstBrace === -1 || lastBrace === -1 || firstBrace >= lastBrace) {
		return undefined;
	}
	return raw.slice(firstBrace, lastBrace + 1);
}

function sanitizeSuggestion(suggestion: unknown): OllamaSuggestion | undefined {
	if (!suggestion || typeof suggestion !== 'object') {
		return undefined;
	}

	const typed = suggestion as OllamaSuggestion;
	const safe: OllamaSuggestion = {};

	if (typeof typed.summary === 'string' && typed.summary.trim().length > 0) {
		safe.summary = typed.summary.trim();
	}

	if (Array.isArray(typed.actions)) {
		const mapped = typed.actions
			.filter(item => item && typeof item === 'object')
			.map(item => {
				const action = item as { type?: string; target?: string; description?: string };
				if (!action.type || !allowedActionTypes.includes(action.type as (typeof allowedActionTypes)[number])) {
					return undefined;
				}
				if (typeof action.target !== 'string' || action.target.trim().length === 0) {
					return undefined;
				}
				if (typeof action.description !== 'string' || action.description.trim().length < 3) {
					return undefined;
				}
				return {
					type: action.type as ResponsePayload['actions'][number]['type'],
					target: action.target.trim(),
					description: action.description.trim()
				};
			})
			.filter(Boolean) as ResponsePayload['actions'];

		if (mapped.length > 0) {
			safe.actions = mapped;
		}
	}

	if (Array.isArray(typed.nextSteps)) {
		const nextSteps = typed.nextSteps.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean);
		if (nextSteps.length > 0) {
			safe.nextSteps = nextSteps;
		}
	}

	if (!safe.summary && !safe.actions && !safe.nextSteps) {
		return undefined;
	}

	return safe;
}

function postJson(urlText: string, payload: unknown, timeoutMs: number): Promise<{ statusCode: number; body: string }> {
	return new Promise((resolvePromise, rejectPromise) => {
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(urlText);
		} catch (error) {
			rejectPromise(new Error(`URL invalida: ${(error as Error).message}`));
			return;
		}

		const body = JSON.stringify(payload);
		const requestFn = parsedUrl.protocol === 'https:' ? httpsRequest : httpRequest;
		const req = requestFn(
			{
				protocol: parsedUrl.protocol,
				hostname: parsedUrl.hostname,
				port: parsedUrl.port,
				path: `${parsedUrl.pathname}${parsedUrl.search}`,
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'content-length': Buffer.byteLength(body)
				}
			},
			res => {
				const chunks: Buffer[] = [];
				res.on('data', chunk => chunks.push(Buffer.from(chunk)));
				res.on('end', () => {
					resolvePromise({
						statusCode: res.statusCode ?? 0,
						body: Buffer.concat(chunks).toString('utf-8')
					});
				});
			}
		);

		req.setTimeout(timeoutMs, () => {
			req.destroy(new Error(`Timeout apos ${timeoutMs}ms ao chamar Ollama.`));
		});

		req.on('error', error => rejectPromise(error));
		req.write(body);
		req.end();
	});
}

async function getOllamaSuggestion(args: ParsedArgs, request: RequestPayload): Promise<{ suggestion?: OllamaSuggestion; error?: string }> {
	const endpoint = `${args.ollamaUrl.replace(/\/$/, '')}/api/generate`;
	const payload = {
		model: args.model,
		stream: false,
		prompt: buildOllamaPrompt(request),
		format: 'json'
	};

	let responseText = '';
	let statusCode = 0;
	try {
		const response = await postJson(endpoint, payload, args.timeoutMs);
		responseText = response.body;
		statusCode = response.statusCode;
	} catch (error) {
		return { error: `Falha ao conectar no Ollama: ${(error as Error).message}` };
	}

	if (statusCode < 200 || statusCode >= 300) {
		return { error: `Ollama retornou HTTP ${statusCode}: ${responseText.slice(0, 300)}` };
	}

	const envelope = tryParseJson(responseText);
	if (!envelope || typeof envelope !== 'object') {
		return { error: 'Resposta do Ollama nao e JSON valido.' };
	}

	const envelopeTyped = envelope as { response?: unknown };
	if (typeof envelopeTyped.response !== 'string' || envelopeTyped.response.trim().length === 0) {
		return { error: 'Resposta do Ollama nao contem campo response textual.' };
	}

	const candidateJson = extractJsonObjectText(envelopeTyped.response.trim());
	if (!candidateJson) {
		return { error: 'Nao foi possivel extrair JSON da resposta do modelo.' };
	}

	const parsedSuggestion = tryParseJson(candidateJson);
	const sanitized = sanitizeSuggestion(parsedSuggestion);
	if (!sanitized) {
		return { error: 'Sugestao do modelo nao trouxe campos aproveitaveis (summary/actions/nextSteps).' };
	}

	return { suggestion: sanitized };
}

async function main() {
	const parsed = parseArgs(process.argv);
	if (parsed.error || !parsed.args) {
		console.error(parsed.error || 'Falha ao interpretar argumentos.');
		console.error('Uso: node --experimental-strip-types .github/nb-code/scripts/mvp1-ollama-pipeline.ts --request <arquivo.json> [--output <saida.json>] [--model <nome-modelo>] [--ollama-url <url>] [--timeout-ms <ms>] [--strict-ollama]');
		process.exit(1);
	}

	const args = parsed.args;
	const { validateRequest, validateResponse } = createSchemaValidators();
	const requestPath = resolve(args.request);
	const requestData = readJsonFile(requestPath);
	if (!validateRequest(requestData)) {
		const requestErrors = formatSchemaErrors(validateRequest.errors as unknown[] | null | undefined);
		console.error('Falha na validacao do request (schema):');
		for (const error of requestErrors) {
			console.error(`- ${error}`);
		}
		process.exit(2);
	}

	const request = requestData as RequestPayload;
	const sensitiveAreaTouched = detectSensitiveArea(request);
	const secretsExposed = detectSecretExposure(request);

	let status: ResponsePayload['status'] = 'completed';
	const securityNotes: string[] = [];
	if (sensitiveAreaTouched) {
		status = 'needs-input';
		securityNotes.push('Area sensivel detectada. Exigir supervisao antes de aplicar alteracoes finais.');
	}
	if (secretsExposed) {
		status = 'blocked';
		securityNotes.push('Padrao de segredo potencial detectado no contexto.');
	}

	const defaultActions = buildDefaultActions(request);
	const defaultSummary = buildDefaultSummary();
	const defaultNextSteps = buildDefaultNextSteps();

	let summary = defaultSummary;
	let actions = defaultActions;
	let nextSteps = defaultNextSteps;
	let ollamaValidation: ResponsePayload['validations'][number] = {
		name: 'ollama-inference',
		result: 'skipped',
		details: 'Inferencia Ollama nao executada.'
	};

	const suggestionResult = await getOllamaSuggestion(args, request);
	if (suggestionResult.suggestion) {
		if (suggestionResult.suggestion.summary) {
			summary = suggestionResult.suggestion.summary;
		}
		if (suggestionResult.suggestion.actions) {
			actions = suggestionResult.suggestion.actions;
		}
		if (suggestionResult.suggestion.nextSteps) {
			nextSteps = suggestionResult.suggestion.nextSteps;
		}
		ollamaValidation = {
			name: 'ollama-inference',
			result: 'passed',
			details: `Inferencia concluida com modelo ${args.model}.`
		};
	} else {
		const fallbackError = suggestionResult.error || 'Falha desconhecida na inferencia.';
		ollamaValidation = {
			name: 'ollama-inference',
			result: 'failed',
			details: `${fallbackError} Aplicando fallback deterministico do MVP1.`
		};
		if (args.strictOllama) {
			console.error(`Falha na inferencia Ollama (strict): ${fallbackError}`);
			process.exit(4);
		}
	}

	const response: ResponsePayload = {
		requestId: request.requestId,
		status,
		summary,
		actions,
		validations: [
			{ name: 'request-schema', result: 'passed', details: 'Estrutura minima de entrada validada.' },
			ollamaValidation,
			{ name: 'security-gate', result: secretsExposed ? 'failed' : 'passed', details: 'Verificacao basica de segredos e area sensivel.' }
		],
		security: {
			secretsExposed,
			sensitiveAreaTouched,
			notes: securityNotes.join(' ')
		},
		nextSteps
	};

	if (!validateResponse(response)) {
		const responseErrors = formatSchemaErrors(validateResponse.errors as unknown[] | null | undefined);
		console.error('Falha na validacao do response (schema):');
		for (const error of responseErrors) {
			console.error(`- ${error}`);
		}
		process.exit(3);
	}

	const outputText = JSON.stringify(response, null, 2);
	if (args.output) {
		const outputPath = resolve(args.output);
		writeFileSync(outputPath, outputText, 'utf-8');
		console.log(`Response salvo em: ${outputPath}`);
		return;
	}

	console.log(outputText);
}

main().catch(error => {
	console.error(`Falha inesperada no pipeline Ollama: ${(error as Error).message}`);
	process.exit(99);
});
