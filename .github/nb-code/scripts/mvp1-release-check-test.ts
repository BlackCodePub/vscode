#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ReleaseCheck = {
	name: string;
	result: 'passed' | 'failed' | 'skipped';
	details: string;
};

type ReleaseReport = {
	project: 'nb-code-mvp1';
	status: 'ready' | 'blocked';
	checks: ReleaseCheck[];
	summary: string;
	nextSteps: string[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const releaseCheckPath = resolve(scriptDir, 'mvp1-release-check.ts');

function runWithArgs(args: string[]) {
	return spawnSync(process.execPath, ['--experimental-strip-types', releaseCheckPath, ...args], {
		encoding: 'utf-8'
	});
}

function parseJson<T>(text: string, label: string): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		console.error(label);
		console.error(text);
		process.exit(1);
	}
}

const outputRun = mkdtempSync(resolve(tmpdir(), 'nb-code-release-check-'));

try {
	const outputPath = resolve(outputRun, 'release-check-report.json');
	const fileRun = runWithArgs(['--skip-tests', '--skip-dirty-check', '--output', outputPath]);
	if (fileRun.status !== 0) {
		console.error('Falha no release-check com output em arquivo.');
		console.error(fileRun.stderr);
		process.exit(1);
	}

	const fileReport = parseJson<ReleaseReport>(readFileSync(outputPath, 'utf-8'), 'Relatorio em arquivo nao e JSON valido.');
	if (fileReport.project !== 'nb-code-mvp1') {
		console.error('Relatorio invalido: project inesperado.');
		process.exit(1);
	}
	if (fileReport.status !== 'ready') {
		console.error('Relatorio invalido: status esperado ready com checks ignorados.');
		console.error(JSON.stringify(fileReport, null, 2));
		process.exit(1);
	}

	const pipelineCheck = fileReport.checks.find(item => item.name === 'pipeline:test');
	if (!pipelineCheck || pipelineCheck.result !== 'skipped') {
		console.error('Relatorio invalido: pipeline:test deveria estar skipped com --skip-tests.');
		process.exit(1);
	}

	const dirtyCheck = fileReport.checks.find(item => item.name === 'git-status:.github/nb-code');
	if (!dirtyCheck || dirtyCheck.result !== 'skipped') {
		console.error('Relatorio invalido: dirty check deveria estar skipped com --skip-dirty-check.');
		process.exit(1);
	}

	const stdoutRun = runWithArgs(['--skip-tests', '--skip-dirty-check']);
	if (stdoutRun.status !== 0) {
		console.error('Falha no release-check com saida em stdout.');
		console.error(stdoutRun.stderr);
		process.exit(1);
	}

	const stdoutReport = parseJson<ReleaseReport>(stdoutRun.stdout, 'Saida stdout do release-check nao e JSON valido.');
	if (stdoutReport.status !== 'ready') {
		console.error('Relatorio stdout invalido: status esperado ready.');
		process.exit(1);
	}

	const invalidArgRun = runWithArgs(['--flag-nao-existe']);
	if (invalidArgRun.status !== 1) {
		console.error('Falha no teste de argumento invalido do release-check.');
		process.exit(1);
	}
	if (!invalidArgRun.stderr.includes('Parametro nao reconhecido')) {
		console.error('Mensagem esperada para argumento invalido nao encontrada.');
		console.error(invalidArgRun.stderr);
		process.exit(1);
	}
} finally {
	rmSync(outputRun, { recursive: true, force: true });
}

console.log('Teste release-check passou para cenarios de arquivo, stdout e erro de uso.');