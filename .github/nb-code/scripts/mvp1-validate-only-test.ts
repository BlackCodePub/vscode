#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ValidateOnlyResult = {
	mode: 'validate-only';
	requestId: string;
	status: 'completed' | 'blocked' | 'needs-input';
	outcome: 'success';
	validations: {
		requestSchema: 'passed';
		responseSchema: 'passed';
		securityGate: 'passed' | 'failed';
	};
	security: {
		secretsExposed: boolean;
		sensitiveAreaTouched: boolean;
		notes: string;
	};
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');

function runValidateOnly(requestFileName: string) {
	const requestPath = resolve(scriptDir, '..', 'examples', requestFileName);
	return spawnSync(
		process.execPath,
		['--experimental-strip-types', pipelinePath, '--request', requestPath, '--validate-only'],
		{ encoding: 'utf-8' }
	);
}

function parseStdoutAsJson(stdout: string): ValidateOnlyResult {
	try {
		return JSON.parse(stdout) as ValidateOnlyResult;
	} catch {
		console.error('Saida do pipeline nao e JSON valido em modo validate-only.');
		console.error(stdout);
		process.exit(1);
	}
}

const completedRun = runValidateOnly('request.sample.json');
if (completedRun.status !== 0) {
	console.error('Falha no teste validate-only para request valido.');
	console.error(completedRun.stderr);
	process.exit(1);
}

const completedPayload = parseStdoutAsJson(completedRun.stdout);
if (completedPayload.mode !== 'validate-only') {
	console.error('Payload validate-only invalido: campo mode inesperado.');
	process.exit(1);
}
if (completedPayload.status !== 'completed') {
	console.error('Payload validate-only invalido: status esperado completed.');
	process.exit(1);
}
if (completedPayload.validations.securityGate !== 'passed') {
	console.error('Payload validate-only invalido: securityGate esperado passed.');
	process.exit(1);
}
if ('actions' in (completedPayload as unknown as Record<string, unknown>)) {
	console.error('Payload validate-only nao deve conter actions.');
	process.exit(1);
}

const blockedRun = runValidateOnly('request.secret.sample.json');
if (blockedRun.status !== 0) {
	console.error('Falha no teste validate-only para request com segredo.');
	console.error(blockedRun.stderr);
	process.exit(1);
}

const blockedPayload = parseStdoutAsJson(blockedRun.stdout);
if (blockedPayload.status !== 'blocked') {
	console.error('Payload validate-only invalido: status esperado blocked.');
	process.exit(1);
}
if (blockedPayload.validations.securityGate !== 'failed') {
	console.error('Payload validate-only invalido: securityGate esperado failed.');
	process.exit(1);
}
if (!blockedPayload.security.secretsExposed) {
	console.error('Payload validate-only invalido: secretsExposed esperado true.');
	process.exit(1);
}

console.log('Teste validate-only passou para cenarios completed e blocked.');
