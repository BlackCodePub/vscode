#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

type JsonObject = Record<string, unknown>;

type NdjsonEventName = 'execution-report' | 'response' | 'validate-only-result' | 'output-written';
type NdjsonPresetName = 'ci-minimal' | 'ci-audit' | 'ci-debug';
type FailOnStatusPresetName = 'strict' | 'security';

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

type ResponseStatus = ResponsePayload['status'];

type ExecutionReport = {
	timestamp: string;
	mode: 'full' | 'validate-only';
	requestPath?: string;
	outputPath?: string;
	reportPath?: string;
	outcome: 'success' | 'usage-error' | 'request-invalid' | 'response-invalid' | 'runtime-error' | 'status-gate-failed';
	exitCode: number;
	requestValidation: {
		valid: boolean;
		errors: string[];
	};
	responseValidation: {
		valid: boolean;
		errors: string[];
	};
	responseStatus?: ResponsePayload['status'];
	security?: ResponsePayload['security'];
};

type ValidateOnlyPayload = {
	mode: 'validate-only';
	requestId: string;
	status: ResponsePayload['status'];
	outcome: 'success';
	validations: {
		requestSchema: 'passed';
		responseSchema: 'passed';
		securityGate: 'passed' | 'failed';
	};
	security: ResponsePayload['security'];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(scriptDir, '..', 'contracts');
const requestSchemaPath = resolve(contractsDir, 'request.schema.json');
const responseSchemaPath = resolve(contractsDir, 'response.schema.json');
const allowedNdjsonEvents = ['execution-report', 'response', 'validate-only-result', 'output-written'] as const;
const allowedResponseStatuses = ['completed', 'needs-input', 'blocked'] as const;
const ndjsonPresets: Record<NdjsonPresetName, readonly NdjsonEventName[]> = {
	'ci-minimal': ['execution-report', 'response', 'validate-only-result'],
	'ci-audit': ['execution-report', 'output-written'],
	'ci-debug': allowedNdjsonEvents
};
const failOnStatusPresets: Record<FailOnStatusPresetName, readonly ResponseStatus[]> = {
	strict: ['needs-input', 'blocked'],
	security: ['blocked']
};

function parseArgs(argv) {
	const args = {
		request: '',
		output: '',
		report: '',
		validateOnly: false,
		ndjson: false,
		noNdjsonHints: false,
		failOnStatusRaw: '',
		failOnStatusProvided: false,
		failOnStatusPresetRaw: '',
		failOnStatusPresetProvided: false,
		eventsRaw: '',
		eventsPresetRaw: ''
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
		if ((token === '--report' || token === '-p') && argv[i + 1]) {
			args.report = argv[++i];
			continue;
		}
		if (token === '--validate-only' || token === '-v') {
			args.validateOnly = true;
			continue;
		}
		if (token === '--ndjson' || token === '-n') {
			args.ndjson = true;
			continue;
		}
		if (token === '--no-ndjson-hints') {
			args.noNdjsonHints = true;
			continue;
		}
		if (token === '--fail-on-status' || token === '-f') {
			args.failOnStatusProvided = true;
			if (argv[i + 1]) {
				args.failOnStatusRaw = argv[++i];
			}
			continue;
		}
		if (token === '--fail-on-status-preset' || token === '-F') {
			args.failOnStatusPresetProvided = true;
			if (argv[i + 1]) {
				args.failOnStatusPresetRaw = argv[++i];
			}
			continue;
		}
		if ((token === '--events' || token === '-e') && argv[i + 1]) {
			args.eventsRaw = argv[++i];
			continue;
		}
		if ((token === '--events-preset' || token === '-E') && argv[i + 1]) {
			args.eventsPresetRaw = argv[++i];
		}
	}
	return args;
}

function parseNdjsonEventsFilter(raw: string): { filter?: Set<NdjsonEventName>; error?: string } {
	if (!raw.trim()) {
		return { error: 'Parametro --events vazio. Informe ao menos um evento.' };
	}

	const requested = raw
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);

	if (requested.length === 0) {
		return { error: 'Parametro --events vazio. Informe ao menos um evento.' };
	}

	const invalid = requested.filter(item => !allowedNdjsonEvents.includes(item as NdjsonEventName));
	if (invalid.length > 0) {
		return {
			error: `Evento(s) NDJSON invalido(s): ${invalid.join(', ')}. Permitidos: ${allowedNdjsonEvents.join(', ')}`
		};
	}

	return { filter: new Set(requested as NdjsonEventName[]) };
}

function parseNdjsonPresetFilter(raw: string): { filter?: Set<NdjsonEventName>; error?: string } {
	const preset = raw.trim();
	if (!preset) {
		return { error: 'Parametro --events-preset vazio. Use ci-minimal, ci-audit ou ci-debug.' };
	}

	if (!(preset in ndjsonPresets)) {
		return { error: `Preset NDJSON invalido: ${preset}. Permitidos: ci-minimal, ci-audit, ci-debug` };
	}

	const typedPreset = preset as NdjsonPresetName;
	return { filter: new Set(ndjsonPresets[typedPreset]) };
}

function parseFailOnStatus(raw: string): { filter?: Set<ResponseStatus>; error?: string } {
	if (!raw.trim()) {
		return { error: 'Parametro --fail-on-status vazio. Use completed, needs-input e/ou blocked.' };
	}

	const requested = raw
		.split(',')
		.map(item => item.trim())
		.filter(Boolean);

	if (requested.length === 0) {
		return { error: 'Parametro --fail-on-status vazio. Use completed, needs-input e/ou blocked.' };
	}

	const invalid = requested.filter(item => !allowedResponseStatuses.includes(item as ResponseStatus));
	if (invalid.length > 0) {
		return {
			error: `Status(es) invalido(s) em --fail-on-status: ${invalid.join(', ')}. Permitidos: ${allowedResponseStatuses.join(', ')}`
		};
	}

	return { filter: new Set(requested as ResponseStatus[]) };
}

function parseFailOnStatusPreset(raw: string): { filter?: Set<ResponseStatus>; error?: string } {
	const preset = raw.trim();
	if (!preset) {
		return { error: 'Parametro --fail-on-status-preset vazio. Use strict ou security.' };
	}

	if (!(preset in failOnStatusPresets)) {
		return { error: `Preset invalido em --fail-on-status-preset: ${preset}. Permitidos: strict, security` };
	}

	const typedPreset = preset as FailOnStatusPresetName;
	return { filter: new Set(failOnStatusPresets[typedPreset]) };
}

function readJsonFile(path) {
	const raw = readFileSync(path, 'utf-8');
	return JSON.parse(raw) as JsonObject;
}

function writeExecutionReport(reportPath: string, report: ExecutionReport) {
	writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
}

function emitNdjsonLine(payload: unknown) {
	process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function shouldEmitNdjsonEvent(args: { ndjson: boolean; ndjsonEventsFilter?: Set<NdjsonEventName> }, event: NdjsonEventName) {
	if (!args.ndjson) {
		return false;
	}

	if (!args.ndjsonEventsFilter) {
		return true;
	}

	return args.ndjsonEventsFilter.has(event);
}

function emitNdjsonEvent(args: { ndjson: boolean; ndjsonEventsFilter?: Set<NdjsonEventName> }, event: NdjsonEventName, payload: Record<string, unknown>) {
	if (shouldEmitNdjsonEvent(args, event)) {
		emitNdjsonLine({ event, ...payload });
	}
}

function emitExecutionReport(args: { ndjson: boolean; ndjsonEventsFilter?: Set<NdjsonEventName> }, report: ExecutionReport) {
	emitNdjsonEvent(args, 'execution-report', { data: report });
}

function buildNdjsonHints(input: {
	ndjson: boolean;
	hasExplicitEvents: boolean;
	hasExplicitPreset: boolean;
	hasOutput: boolean;
	validateOnly: boolean;
	ndjsonEventsFilter?: Set<NdjsonEventName>;
}) {
	const hints: string[] = [];
	if (!input.ndjson) {
		return hints;
	}

	if (!input.hasExplicitEvents && !input.hasExplicitPreset) {
		if (input.hasOutput) {
			hints.push('Recomendacao NDJSON: use --events-preset ci-audit quando --output estiver ativo.');
		} else {
			hints.push('Recomendacao NDJSON: use --events-preset ci-minimal para pipelines padrao.');
		}
		return hints;
	}

	if (input.hasOutput && input.ndjsonEventsFilter && !input.ndjsonEventsFilter.has('output-written')) {
		hints.push('Combinacao NDJSON possivelmente subotima: --output ativo sem evento output-written. Considere ci-audit ou inclua output-written em --events.');
	}

	if (input.validateOnly && input.ndjsonEventsFilter && !input.ndjsonEventsFilter.has('validate-only-result')) {
		hints.push('Combinacao NDJSON possivelmente subotima: --validate-only ativo sem evento validate-only-result. Considere ci-minimal ou inclua validate-only-result em --events.');
	}

	return hints;
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

function buildActions(request: RequestPayload): ResponsePayload['actions'] {
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

function buildResponse(request: RequestPayload): ResponsePayload {
	const sensitiveAreaTouched = detectSensitiveArea(request);
	const secretsExposed = detectSecretExposure(request);

	let status = 'completed';
	const notes = [];
	if (sensitiveAreaTouched) {
		status = 'needs-input';
		notes.push('Area sensivel detectada. Exigir supervisao antes de aplicar alteracoes finais.');
	}
	if (secretsExposed) {
		status = 'blocked';
		notes.push('Padrao de segredo potencial detectado no contexto.');
	}

	const response = {
		requestId: request.requestId,
		status,
		summary: 'Processamento MVP1 concluido com contrato de saida estruturado.',
		actions: buildActions(request),
		validations: [
			{ name: 'request-schema', result: 'passed', details: 'Estrutura minima de entrada validada.' },
			{ name: 'security-gate', result: secretsExposed ? 'failed' : 'passed', details: 'Verificacao basica de segredos e area sensivel.' }
		],
		security: {
			secretsExposed,
			sensitiveAreaTouched,
			notes: notes.join(' ')
		},
		nextSteps: [
			'Executar validacoes tecnicas aplicaveis (build, type-check e testes).',
			'Preparar resumo para revisao humana e draft PR.'
		]
	};

	return response;
}

function buildValidateOnlyPayload(response: ResponsePayload): ValidateOnlyPayload {
	const securityGateResult = response.security.secretsExposed ? 'failed' : 'passed';
	return {
		mode: 'validate-only',
		requestId: response.requestId,
		status: response.status,
		outcome: 'success',
		validations: {
			requestSchema: 'passed',
			responseSchema: 'passed',
			securityGate: securityGateResult
		},
		security: response.security
	};
}

function main() {
	const { validateRequest, validateResponse } = createSchemaValidators();
	const args = parseArgs(process.argv);
	let ndjsonEventsFilter: Set<NdjsonEventName> | undefined;
	let failOnStatus: Set<ResponseStatus> | undefined;
	const mode = args.validateOnly ? 'validate-only' : 'full';
	const report: ExecutionReport = {
		timestamp: new Date().toISOString(),
		mode,
		outcome: 'runtime-error',
		exitCode: 99,
		requestValidation: {
			valid: false,
			errors: []
		},
		responseValidation: {
			valid: false,
			errors: []
		}
	};

	const reportPath = args.report ? resolve(args.report) : '';
	if (reportPath) {
		report.reportPath = reportPath;
	}

	if (args.eventsRaw && !args.ndjson) {
		report.outcome = 'usage-error';
		report.exitCode = 1;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		console.error('Parametro --events requer --ndjson.');
		process.exit(1);
	}

	if (args.eventsPresetRaw && !args.ndjson) {
		report.outcome = 'usage-error';
		report.exitCode = 1;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		console.error('Parametro --events-preset requer --ndjson.');
		process.exit(1);
	}

	if (args.eventsRaw && args.eventsPresetRaw) {
		report.outcome = 'usage-error';
		report.exitCode = 1;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		console.error('Use apenas um entre --events e --events-preset.');
		process.exit(1);
	}

	if (args.failOnStatusProvided && args.failOnStatusPresetProvided) {
		report.outcome = 'usage-error';
		report.exitCode = 1;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		console.error('Use apenas um entre --fail-on-status e --fail-on-status-preset.');
		process.exit(1);
	}

	if (args.eventsRaw) {
		const parsedFilter = parseNdjsonEventsFilter(args.eventsRaw);
		if (parsedFilter.error) {
			report.outcome = 'usage-error';
			report.exitCode = 1;
			if (reportPath) {
				writeExecutionReport(reportPath, report);
			}
			console.error(parsedFilter.error);
			process.exit(1);
		}

		ndjsonEventsFilter = parsedFilter.filter;
	}

	if (args.eventsPresetRaw) {
		const parsedPreset = parseNdjsonPresetFilter(args.eventsPresetRaw);
		if (parsedPreset.error) {
			report.outcome = 'usage-error';
			report.exitCode = 1;
			if (reportPath) {
				writeExecutionReport(reportPath, report);
			}
			console.error(parsedPreset.error);
			process.exit(1);
		}

		ndjsonEventsFilter = parsedPreset.filter;
	}

	if (args.failOnStatusProvided) {
		const parsedFailOnStatus = parseFailOnStatus(args.failOnStatusRaw);
		if (parsedFailOnStatus.error) {
			report.outcome = 'usage-error';
			report.exitCode = 1;
			if (reportPath) {
				writeExecutionReport(reportPath, report);
			}
			console.error(parsedFailOnStatus.error);
			process.exit(1);
		}

		failOnStatus = parsedFailOnStatus.filter;
	}

	if (args.failOnStatusPresetProvided) {
		const parsedFailOnStatusPreset = parseFailOnStatusPreset(args.failOnStatusPresetRaw);
		if (parsedFailOnStatusPreset.error) {
			report.outcome = 'usage-error';
			report.exitCode = 1;
			if (reportPath) {
				writeExecutionReport(reportPath, report);
			}
			console.error(parsedFailOnStatusPreset.error);
			process.exit(1);
		}

		failOnStatus = parsedFailOnStatusPreset.filter;
	}

	const emitterArgs = {
		ndjson: args.ndjson,
		ndjsonEventsFilter
	};

	if (!args.request) {
		report.outcome = 'usage-error';
		report.exitCode = 1;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		emitExecutionReport(emitterArgs, report);
		console.error('Uso: node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request <arquivo.json> [--output <saida.json>] [--report <relatorio.json>] [--validate-only] [--ndjson] [--no-ndjson-hints] [--fail-on-status <completed|needs-input|blocked[,..]>] [--fail-on-status-preset <strict|security>] [--events <lista>] [--events-preset <ci-minimal|ci-audit|ci-debug>]');
		process.exit(1);
	}

	if (!args.noNdjsonHints) {
		const ndjsonHints = buildNdjsonHints({
			ndjson: args.ndjson,
			hasExplicitEvents: Boolean(args.eventsRaw),
			hasExplicitPreset: Boolean(args.eventsPresetRaw),
			hasOutput: Boolean(args.output),
			validateOnly: args.validateOnly,
			ndjsonEventsFilter
		});
		for (const hint of ndjsonHints) {
			console.error(hint);
		}
	}

	const requestPath = resolve(args.request);
	report.requestPath = requestPath;
	if (args.output) {
		report.outputPath = resolve(args.output);
	}
	const requestData = readJsonFile(requestPath);
	if (!validateRequest(requestData)) {
		const requestErrors = formatSchemaErrors(validateRequest.errors as unknown[] | null | undefined);
		report.outcome = 'request-invalid';
		report.exitCode = 2;
		report.requestValidation = {
			valid: false,
			errors: requestErrors
		};
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		emitExecutionReport(emitterArgs, report);
		console.error('Falha na validacao do request (schema):');
		for (const error of requestErrors) {
			console.error(`- ${error}`);
		}
		process.exit(2);
	}

	const request = requestData as RequestPayload;
	report.requestValidation = {
		valid: true,
		errors: []
	};
	const response = buildResponse(request);
	if (!validateResponse(response)) {
		const responseErrors = formatSchemaErrors(validateResponse.errors as unknown[] | null | undefined);
		report.outcome = 'response-invalid';
		report.exitCode = 3;
		report.responseValidation = {
			valid: false,
			errors: responseErrors
		};
		report.responseStatus = response.status;
		report.security = response.security;
		if (reportPath) {
			writeExecutionReport(reportPath, report);
		}
		emitExecutionReport(emitterArgs, report);
		console.error('Falha na validacao do response (schema):');
		for (const error of responseErrors) {
			console.error(`- ${error}`);
		}
		process.exit(3);
	}

	report.responseValidation = {
		valid: true,
		errors: []
	};
	report.responseStatus = response.status;
	report.security = response.security;
	const statusGateTriggered = Boolean(failOnStatus && failOnStatus.has(response.status));
	if (statusGateTriggered) {
		report.outcome = 'status-gate-failed';
		report.exitCode = 4;
	} else {
		report.outcome = 'success';
		report.exitCode = 0;
	}
	if (reportPath) {
		writeExecutionReport(reportPath, report);
	}
	emitExecutionReport(emitterArgs, report);

	if (args.validateOnly) {
		const validationOnlyPayload = buildValidateOnlyPayload(response);
		const validationOutput = JSON.stringify(validationOnlyPayload, null, 2);
		if (args.output) {
			const outputPath = resolve(args.output);
			writeFileSync(outputPath, validationOutput, 'utf-8');
			if (args.ndjson) {
				emitNdjsonEvent(emitterArgs, 'output-written', { mode: 'validate-only', path: outputPath });
			} else {
				console.log(`Resultado validate-only salvo em: ${outputPath}`);
			}
		}

		if (args.ndjson) {
			emitNdjsonEvent(emitterArgs, 'validate-only-result', { data: validationOnlyPayload });
		} else {
			console.log(validationOutput);
		}

		if (statusGateTriggered) {
			console.error(`Status do response bloqueado por --fail-on-status: ${response.status}.`);
			process.exit(4);
		}
		return;
	}

	const output = JSON.stringify(response, null, 2);
	if (args.output) {
		const outputPath = resolve(args.output);
		writeFileSync(outputPath, output, 'utf-8');
		if (args.ndjson) {
			emitNdjsonEvent(emitterArgs, 'output-written', { mode: 'full', path: outputPath });
		} else {
			console.log(`Response salvo em: ${outputPath}`);
		}
	}

	if (args.ndjson) {
		emitNdjsonEvent(emitterArgs, 'response', { data: response });
	} else {
		console.log(output);
	}

	if (statusGateTriggered) {
		console.error(`Status do response bloqueado por --fail-on-status: ${response.status}.`);
		process.exit(4);
	}
}

main();
