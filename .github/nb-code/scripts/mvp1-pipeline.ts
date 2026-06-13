#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(argv) {
	const args = { request: '', output: '' };
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
	}
	return args;
}

function readJsonFile(path) {
	const raw = readFileSync(path, 'utf-8');
	return JSON.parse(raw);
}

function hasString(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function validateRequest(request) {
	const errors = [];
	if (!request || typeof request !== 'object') {
		errors.push('Request deve ser um objeto JSON.');
		return errors;
	}
	if (!hasString(request.requestId)) {
		errors.push('Campo requestId e obrigatorio.');
	}

	const allowedTaskTypes = new Set(['docs', 'code', 'refactor', 'review', 'setup']);
	if (!allowedTaskTypes.has(request.taskType)) {
		errors.push('Campo taskType invalido.');
	}
	if (!hasString(request.goal) || request.goal.trim().length < 10) {
		errors.push('Campo goal deve ter pelo menos 10 caracteres.');
	}
	if (!request.context || typeof request.context !== 'object') {
		errors.push('Campo context e obrigatorio.');
		return errors;
	}
	if (!hasString(request.context.currentFile)) {
		errors.push('Campo context.currentFile e obrigatorio.');
	}
	if (typeof request.context.selectedText !== 'string') {
		errors.push('Campo context.selectedText deve ser string.');
	}
	if (!Array.isArray(request.context.workspaceHints)) {
		errors.push('Campo context.workspaceHints deve ser array.');
	}
	return errors;
}

function detectSensitiveArea(request) {
	const text = [request.goal, ...(request.constraints || []), request.context?.selectedText || '']
		.join(' ')
		.toLowerCase();
	return /(auth|autentic|crypto|criptograf|token|senha|password)/.test(text);
}

function detectSecretExposure(request) {
	const text = [request.goal, request.context?.selectedText || ''].join(' ');
	return /(api[_-]?key\s*=|token\s*=|password\s*=|senha\s*=)/i.test(text);
}

function buildActions(request) {
	const actions = [];
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

function buildResponse(request) {
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

function validateResponse(response) {
	const errors = [];
	if (!hasString(response.requestId)) {
		errors.push('Response: requestId invalido.');
	}
	if (!new Set(['completed', 'blocked', 'needs-input']).has(response.status)) {
		errors.push('Response: status invalido.');
	}
	if (!Array.isArray(response.actions) || response.actions.length === 0) {
		errors.push('Response: actions deve conter ao menos uma acao.');
	}
	if (!response.security || typeof response.security !== 'object') {
		errors.push('Response: security e obrigatorio.');
	}
	return errors;
}

function main() {
	const args = parseArgs(process.argv);
	if (!args.request) {
		console.error('Uso: node --experimental-strip-types .github/nb-code/scripts/mvp1-pipeline.ts --request <arquivo.json> [--output <saida.json>]');
		process.exit(1);
	}

	const requestPath = resolve(args.request);
	const request = readJsonFile(requestPath);
	const requestErrors = validateRequest(request);
	if (requestErrors.length > 0) {
		console.error('Falha na validacao do request:');
		for (const error of requestErrors) {
			console.error(`- ${error}`);
		}
		process.exit(2);
	}

	const response = buildResponse(request);
	const responseErrors = validateResponse(response);
	if (responseErrors.length > 0) {
		console.error('Falha na validacao do response:');
		for (const error of responseErrors) {
			console.error(`- ${error}`);
		}
		process.exit(3);
	}

	const output = JSON.stringify(response, null, 2);
	if (args.output) {
		const outputPath = resolve(args.output);
		writeFileSync(outputPath, output, 'utf-8');
		console.log(`Response salvo em: ${outputPath}`);
	}

	console.log(output);
}

main();
