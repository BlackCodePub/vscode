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

const filteredRun = runWithArgs(['--request', sampleRequest, '--ndjson', '--events', 'execution-report']);
if (filteredRun.status !== 0) {
	console.error('Falha no teste NDJSON com filtro execution-report.');
	console.error(filteredRun.stderr);
	process.exit(1);
}

const filteredLines = parseNdjsonLines(filteredRun.stdout);
if (filteredLines.length !== 1 || filteredLines[0]?.event !== 'execution-report') {
	console.error('Filtro NDJSON falhou: esperado apenas evento execution-report.');
	console.error(filteredRun.stdout);
	process.exit(1);
}

const presetMinimalRun = runWithArgs(['--request', sampleRequest, '--ndjson', '--events-preset', 'ci-minimal']);
if (presetMinimalRun.status !== 0) {
	console.error('Falha no teste NDJSON com preset ci-minimal.');
	console.error(presetMinimalRun.stderr);
	process.exit(1);
}

const presetMinimalLines = parseNdjsonLines(presetMinimalRun.stdout);
if (presetMinimalLines.length !== 2) {
	console.error('Preset ci-minimal invalido: esperado 2 eventos no modo full.');
	console.error(presetMinimalRun.stdout);
	process.exit(1);
}
if (presetMinimalLines[0]?.event !== 'execution-report' || presetMinimalLines[1]?.event !== 'response') {
	console.error('Preset ci-minimal invalido: eventos inesperados no modo full.');
	console.error(presetMinimalRun.stdout);
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

const presetMinimalValidateOnlyRun = runWithArgs(['--request', sampleRequest, '--validate-only', '--ndjson', '--events-preset', 'ci-minimal']);
if (presetMinimalValidateOnlyRun.status !== 0) {
	console.error('Falha no teste NDJSON com preset ci-minimal em validate-only.');
	console.error(presetMinimalValidateOnlyRun.stderr);
	process.exit(1);
}

const presetMinimalValidateOnlyLines = parseNdjsonLines(presetMinimalValidateOnlyRun.stdout);
if (presetMinimalValidateOnlyLines.length !== 2) {
	console.error('Preset ci-minimal invalido: esperado 2 eventos no validate-only.');
	console.error(presetMinimalValidateOnlyRun.stdout);
	process.exit(1);
}
if (presetMinimalValidateOnlyLines[0]?.event !== 'execution-report' || presetMinimalValidateOnlyLines[1]?.event !== 'validate-only-result') {
	console.error('Preset ci-minimal invalido: eventos inesperados no validate-only.');
	console.error(presetMinimalValidateOnlyRun.stdout);
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

const invalidUsageRun = runWithArgs(['--request', sampleRequest, '--events', 'response']);
if (invalidUsageRun.status !== 1) {
	console.error('Falha no teste de uso invalido: --events sem --ndjson deve retornar exit code 1.');
	process.exit(1);
}
if (!invalidUsageRun.stderr.includes('Parametro --events requer --ndjson.')) {
	console.error('Mensagem de uso invalido para --events sem --ndjson nao encontrada.');
	console.error(invalidUsageRun.stderr);
	process.exit(1);
}

const invalidEventRun = runWithArgs(['--request', sampleRequest, '--ndjson', '--events', 'foo']);
if (invalidEventRun.status !== 1) {
	console.error('Falha no teste de evento NDJSON invalido: exit code esperado 1.');
	process.exit(1);
}
if (!invalidEventRun.stderr.includes('Evento(s) NDJSON invalido(s): foo.')) {
	console.error('Mensagem de evento NDJSON invalido nao encontrada.');
	console.error(invalidEventRun.stderr);
	process.exit(1);
}

const invalidPresetRun = runWithArgs(['--request', sampleRequest, '--ndjson', '--events-preset', 'foo']);
if (invalidPresetRun.status !== 1) {
	console.error('Falha no teste de preset NDJSON invalido: exit code esperado 1.');
	process.exit(1);
}
if (!invalidPresetRun.stderr.includes('Preset NDJSON invalido: foo.')) {
	console.error('Mensagem de preset NDJSON invalido nao encontrada.');
	console.error(invalidPresetRun.stderr);
	process.exit(1);
}

const invalidPresetUsageRun = runWithArgs(['--request', sampleRequest, '--events-preset', 'ci-minimal']);
if (invalidPresetUsageRun.status !== 1) {
	console.error('Falha no teste de uso invalido: --events-preset sem --ndjson deve retornar exit code 1.');
	process.exit(1);
}
if (!invalidPresetUsageRun.stderr.includes('Parametro --events-preset requer --ndjson.')) {
	console.error('Mensagem de uso invalido para --events-preset sem --ndjson nao encontrada.');
	console.error(invalidPresetUsageRun.stderr);
	process.exit(1);
}

const conflictingFiltersRun = runWithArgs(['--request', sampleRequest, '--ndjson', '--events', 'response', '--events-preset', 'ci-minimal']);
if (conflictingFiltersRun.status !== 1) {
	console.error('Falha no teste de conflito: --events e --events-preset devem retornar exit code 1.');
	process.exit(1);
}
if (!conflictingFiltersRun.stderr.includes('Use apenas um entre --events e --events-preset.')) {
	console.error('Mensagem de conflito entre --events e --events-preset nao encontrada.');
	console.error(conflictingFiltersRun.stderr);
	process.exit(1);
}

console.log('Teste NDJSON passou para cenarios full, filtros, presets, validate-only, request invalido e erros de uso.');
