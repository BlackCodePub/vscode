#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type NdjsonLine = {
	event: string;
	data?: Record<string, unknown>;
	mode?: string;
	path?: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');

function parseNdjsonLines(stdout: string): NdjsonLine[] {
	const lines = stdout.trim().split('\n').filter(Boolean);
	if (lines.length === 0) {
		return [];
	}
	return lines.map(line => JSON.parse(line) as NdjsonLine);
}

function runWithArgs(args: string[]) {
	return spawnSync(process.execPath, ['--experimental-strip-types', pipelinePath, ...args], {
		encoding: 'utf-8'
	});
}

const sampleRequest = resolve(scriptDir, '..', 'examples', 'request.sample.json');
const invalidRequest = resolve(scriptDir, '..', 'examples', 'request.invalid.sample.json');

const successRun = runWithArgs(['--request', sampleRequest, '--ndjson']);
if (successRun.status !== 0) {
	console.error('Falha no teste NDJSON para request valido.');
	console.error(successRun.stderr);
	process.exit(1);
}

const successLines = parseNdjsonLines(successRun.stdout);
if (successLines.length < 2) {
	console.error('Saida NDJSON invalida: esperado pelo menos 2 eventos em sucesso.');
	console.error(successRun.stdout);
	process.exit(1);
}
if (successLines[0]?.event !== 'execution-report') {
	console.error('Saida NDJSON invalida: primeiro evento deve ser execution-report.');
	process.exit(1);
}
if (successLines[1]?.event !== 'response') {
	console.error('Saida NDJSON invalida: segundo evento deve ser response.');
	process.exit(1);
}

const validateOnlyRun = runWithArgs(['--request', sampleRequest, '--validate-only', '--ndjson']);
if (validateOnlyRun.status !== 0) {
	console.error('Falha no teste NDJSON para validate-only.');
	console.error(validateOnlyRun.stderr);
	process.exit(1);
}

const validateOnlyLines = parseNdjsonLines(validateOnlyRun.stdout);
if (validateOnlyLines.length < 2) {
	console.error('Saida NDJSON invalida no validate-only.');
	console.error(validateOnlyRun.stdout);
	process.exit(1);
}
if (validateOnlyLines[1]?.event !== 'validate-only-result') {
	console.error('Saida NDJSON invalida: esperado evento validate-only-result.');
	process.exit(1);
}

const invalidRun = runWithArgs(['--request', invalidRequest, '--ndjson']);
if (invalidRun.status !== 2) {
	console.error('Falha no teste NDJSON para request invalido: exit code esperado 2.');
	console.error(`Exit code recebido: ${invalidRun.status ?? 'null'}`);
	console.error(invalidRun.stderr);
	process.exit(1);
}

const invalidLines = parseNdjsonLines(invalidRun.stdout);
if (invalidLines.length < 1 || invalidLines[0]?.event !== 'execution-report') {
	console.error('Saida NDJSON invalida para request invalido: execution-report ausente.');
	process.exit(1);
}

const invalidOutcome = invalidLines[0]?.data?.outcome;
if (invalidOutcome !== 'request-invalid') {
	console.error('Saida NDJSON invalida para request invalido: outcome inesperado.');
	process.exit(1);
}

console.log('Teste NDJSON passou para cenarios full, validate-only e request invalido.');
