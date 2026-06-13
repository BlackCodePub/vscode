#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

type ReleaseReport = {
	timestamp: string;
	project: 'nb-code-mvp1';
	status: 'ready' | 'blocked';
	checks: Array<{
		name: string;
		result: 'passed' | 'failed' | 'skipped';
		details: string;
		exitCode?: number;
	}>;
	summary: string;
	nextSteps: string[];
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const summaryScriptPath = resolve(scriptDir, 'mvp1-pr-summary.ts');
const sampleReportPath = resolve(scriptDir, '..', 'examples', 'release-check.sample.json');

function runWithArgs(args: string[]) {
	return spawnSync(process.execPath, ['--experimental-strip-types', summaryScriptPath, ...args], {
		encoding: 'utf-8'
	});
}

const tmpDir = mkdtempSync(resolve(tmpdir(), 'nb-code-pr-summary-'));

try {
	const outputPath = resolve(tmpDir, 'pr-summary.md');
	const readyRun = runWithArgs(['--report', sampleReportPath, '--output', outputPath]);
	if (readyRun.status !== 0) {
		console.error('Falha no teste de resumo para report ready.');
		console.error(readyRun.stderr);
		process.exit(1);
	}

	const summaryText = readFileSync(outputPath, 'utf-8');
	if (!summaryText.includes('Status de Prontidao: ready')) {
		console.error('Resumo de PR invalido: status ready ausente.');
		process.exit(1);
	}
	if (!summaryText.includes('| OK | pipeline:test | passed |')) {
		console.error('Resumo de PR invalido: linha de validacao pipeline:test ausente.');
		process.exit(1);
	}
	if (!summaryText.includes('Pronto para revisao humana e decisao de merge.')) {
		console.error('Resumo de PR invalido: mensagem final de pronto ausente.');
		process.exit(1);
	}

	const blockedReportPath = resolve(tmpDir, 'release-check-blocked.json');
	const blockedReport = JSON.parse(readFileSync(sampleReportPath, 'utf-8')) as ReleaseReport;
	blockedReport.status = 'blocked';
	blockedReport.summary = 'Release-check MVP1 bloqueado para validacao do teste.';
	blockedReport.checks = blockedReport.checks.map(item =>
		item.name === 'pipeline:test'
			? { ...item, result: 'failed', details: 'Falha simulada de teste.', exitCode: 1 }
			: item
	);
	writeFileSync(blockedReportPath, JSON.stringify(blockedReport, null, 2), 'utf-8');

	const blockedOutputPath = resolve(tmpDir, 'pr-summary-blocked.md');
	const blockedRun = runWithArgs(['--report', blockedReportPath, '--output', blockedOutputPath]);
	if (blockedRun.status !== 4) {
		console.error('Falha no teste de resumo para report blocked: exit code esperado 4.');
		console.error(`Exit code recebido: ${blockedRun.status ?? 'null'}`);
		console.error(blockedRun.stderr);
		process.exit(1);
	}

	const blockedSummaryText = readFileSync(blockedOutputPath, 'utf-8');
	if (!blockedSummaryText.includes('Status de Prontidao: blocked')) {
		console.error('Resumo de PR blocked invalido: status blocked ausente.');
		process.exit(1);
	}
	if (!blockedSummaryText.includes('ALERTA: release-check bloqueado.')) {
		console.error('Resumo de PR blocked invalido: alerta final ausente.');
		process.exit(1);
	}

	const invalidArgRun = runWithArgs(['--xpto']);
	if (invalidArgRun.status !== 1) {
		console.error('Falha no teste de argumento invalido do resumo de PR.');
		process.exit(1);
	}
	if (!invalidArgRun.stderr.includes('Parametro nao reconhecido')) {
		console.error('Mensagem de erro para argumento invalido nao encontrada no resumo de PR.');
		console.error(invalidArgRun.stderr);
		process.exit(1);
	}
} finally {
	rmSync(tmpDir, { recursive: true, force: true });
}

console.log('Teste pr-summary passou para cenarios ready, blocked e erro de uso.');
