#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ReportOutcome = 'success' | 'usage-error' | 'request-invalid' | 'response-invalid' | 'runtime-error' | 'status-gate-failed';

type ExecutionReport = {
	outcome: ReportOutcome;
	exitCode: number;
	responseStatus?: 'completed' | 'blocked' | 'needs-input';
};

type NdjsonLine = {
	event: string;
	data?: {
		outcome?: string;
		exitCode?: number;
	};
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');
const sampleRequest = resolve(scriptDir, '..', 'examples', 'request.sample.json');
const sensitiveRequest = resolve(scriptDir, '..', 'examples', 'request.sensitive.sample.json');
const secretRequest = resolve(scriptDir, '..', 'examples', 'request.secret.sample.json');

function runWithArgs(args: string[]) {
	return spawnSync(process.execPath, ['--experimental-strip-types', pipelinePath, ...args], {
		encoding: 'utf-8'
	});
}

function parseStdoutJson<T>(stdout: string, errorLabel: string): T {
	try {
		return JSON.parse(stdout) as T;
	} catch {
		console.error(errorLabel);
		console.error(stdout);
		process.exit(1);
	}
}

function parseNdjson(stdout: string): NdjsonLine[] {
	const lines = stdout.trim().split('\n').filter(Boolean);
	return lines.map(line => JSON.parse(line) as NdjsonLine);
}

const blockedRun = runWithArgs(['--request', secretRequest, '--fail-on-status', 'blocked']);
if (blockedRun.status !== 4) {
	console.error('Falha no gate de status: blocked deveria retornar exit code 4.');
	console.error(`Exit code recebido: ${blockedRun.status ?? 'null'}`);
	console.error(blockedRun.stderr);
	process.exit(1);
}

const blockedPayload = parseStdoutJson<{ status: string }>(blockedRun.stdout, 'Saida JSON invalida para caso blocked.');
if (blockedPayload.status !== 'blocked') {
	console.error('Falha no gate de status: response deveria manter status blocked.');
	process.exit(1);
}
if (!blockedRun.stderr.includes('Status do response bloqueado por --fail-on-status: blocked.')) {
	console.error('Mensagem esperada de bloqueio por status blocked nao encontrada.');
	console.error(blockedRun.stderr);
	process.exit(1);
}

const needsInputRun = runWithArgs(['--request', sensitiveRequest, '--fail-on-status', 'needs-input']);
if (needsInputRun.status !== 4) {
	console.error('Falha no gate de status: needs-input deveria retornar exit code 4.');
	console.error(`Exit code recebido: ${needsInputRun.status ?? 'null'}`);
	console.error(needsInputRun.stderr);
	process.exit(1);
}

const passThroughRun = runWithArgs(['--request', sampleRequest, '--fail-on-status', 'blocked']);
if (passThroughRun.status !== 0) {
	console.error('Falha no gate de status: completed nao deveria falhar com gate blocked.');
	console.error(passThroughRun.stderr);
	process.exit(1);
}

const invalidStatusRun = runWithArgs(['--request', sampleRequest, '--fail-on-status', 'foo']);
if (invalidStatusRun.status !== 1) {
	console.error('Falha no parse de --fail-on-status invalido: exit code esperado 1.');
	process.exit(1);
}
if (!invalidStatusRun.stderr.includes('Status(es) invalido(s) em --fail-on-status: foo.')) {
	console.error('Mensagem de erro para --fail-on-status invalido nao encontrada.');
	console.error(invalidStatusRun.stderr);
	process.exit(1);
}

const tmpDir = mkdtempSync(resolve(tmpdir(), 'nb-code-fail-on-status-'));

try {
	const reportPath = resolve(tmpDir, 'status-gate-report.json');
	const reportRun = runWithArgs(['--request', secretRequest, '--report', reportPath, '--fail-on-status', 'blocked']);
	if (reportRun.status !== 4) {
		console.error('Falha no report com --fail-on-status: exit code esperado 4.');
		console.error(reportRun.stderr);
		process.exit(1);
	}

	const report = parseStdoutJson<ExecutionReport>(readFileSync(reportPath, 'utf-8'), 'Relatorio JSON invalido no teste de status gate.');
	if (report.outcome !== 'status-gate-failed' || report.exitCode !== 4) {
		console.error('Relatorio invalido no status gate: outcome/exitCode inesperados.');
		console.error(JSON.stringify(report, null, 2));
		process.exit(1);
	}
	if (report.responseStatus !== 'blocked') {
		console.error('Relatorio invalido no status gate: responseStatus esperado blocked.');
		console.error(JSON.stringify(report, null, 2));
		process.exit(1);
	}

	const ndjsonRun = runWithArgs(['--request', sensitiveRequest, '--ndjson', '--fail-on-status', 'needs-input']);
	if (ndjsonRun.status !== 4) {
		console.error('Falha no NDJSON com --fail-on-status: exit code esperado 4.');
		console.error(ndjsonRun.stderr);
		process.exit(1);
	}

	const ndjsonLines = parseNdjson(ndjsonRun.stdout);
	if (ndjsonLines.length < 2) {
		console.error('Saida NDJSON invalida no status gate: eventos insuficientes.');
		console.error(ndjsonRun.stdout);
		process.exit(1);
	}

	if (ndjsonLines[0]?.event !== 'execution-report') {
		console.error('Saida NDJSON invalida no status gate: primeiro evento deveria ser execution-report.');
		process.exit(1);
	}
	if (ndjsonLines[0]?.data?.outcome !== 'status-gate-failed' || ndjsonLines[0]?.data?.exitCode !== 4) {
		console.error('Saida NDJSON invalida no status gate: outcome/exitCode do execution-report inesperados.');
		console.error(ndjsonRun.stdout);
		process.exit(1);
	}

	const hasResponseEvent = ndjsonLines.some(line => line.event === 'response');
	if (!hasResponseEvent) {
		console.error('Saida NDJSON invalida no status gate: evento response ausente.');
		console.error(ndjsonRun.stdout);
		process.exit(1);
	}
} finally {
	rmSync(tmpDir, { recursive: true, force: true });
}

console.log('Teste fail-on-status passou para cenarios de gate, report, NDJSON e erros de uso.');
