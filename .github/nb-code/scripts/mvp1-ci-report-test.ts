#!/usr/bin/env node

import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

type ReportOutcome = 'success' | 'usage-error' | 'request-invalid' | 'response-invalid' | 'runtime-error';

type ExecutionReport = {
	outcome: ReportOutcome;
	exitCode: number;
	requestValidation: {
		valid: boolean;
		errors: string[];
	};
	responseValidation: {
		valid: boolean;
		errors: string[];
	};
	responseStatus?: 'completed' | 'blocked' | 'needs-input';
	security?: {
		secretsExposed: boolean;
		sensitiveAreaTouched: boolean;
		notes: string;
	};
};

function runCase(requestPath: string, reportPath: string) {
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');
	return spawnSync(
		process.execPath,
		['--experimental-strip-types', pipelinePath, '--request', requestPath, '--report', reportPath],
		{ encoding: 'utf-8' }
	);
}

function readReport(reportPath: string): ExecutionReport {
	return JSON.parse(readFileSync(reportPath, 'utf-8')) as ExecutionReport;
}

const tmpDir = mkdtempSync(resolve(tmpdir(), 'nb-code-report-'));

try {
	const scriptDir = dirname(fileURLToPath(import.meta.url));
	const sampleRequestPath = resolve(scriptDir, '..', 'examples', 'request.sample.json');
	const invalidRequestPath = resolve(scriptDir, '..', 'examples', 'request.invalid.sample.json');
	const sampleReportPath = resolve(tmpDir, 'sample-report.json');
	const invalidReportPath = resolve(tmpDir, 'invalid-report.json');

	const sampleResult = runCase(sampleRequestPath, sampleReportPath);
	if (sampleResult.status !== 0) {
		console.error('Falha no teste de report para request valido.');
		console.error(sampleResult.stderr);
		process.exit(1);
	}

	const sampleReport = readReport(sampleReportPath);
	if (sampleReport.outcome !== 'success' || sampleReport.exitCode !== 0) {
		console.error('Relatorio invalido para request valido.');
		console.error(JSON.stringify(sampleReport, null, 2));
		process.exit(1);
	}
	if (!sampleReport.requestValidation.valid || !sampleReport.responseValidation.valid) {
		console.error('Relatorio invalido: validacoes esperadas como true para request valido.');
		console.error(JSON.stringify(sampleReport, null, 2));
		process.exit(1);
	}

	const invalidResult = runCase(invalidRequestPath, invalidReportPath);
	if (invalidResult.status !== 2) {
		console.error('Falha no teste de report para request invalido.');
		console.error(`Exit code recebido: ${invalidResult.status ?? 'null'}`);
		console.error(invalidResult.stderr);
		process.exit(1);
	}

	const invalidReport = readReport(invalidReportPath);
	if (invalidReport.outcome !== 'request-invalid' || invalidReport.exitCode !== 2) {
		console.error('Relatorio invalido para request invalido.');
		console.error(JSON.stringify(invalidReport, null, 2));
		process.exit(1);
	}
	if (invalidReport.requestValidation.valid || invalidReport.requestValidation.errors.length === 0) {
		console.error('Relatorio invalido: requestValidation deveria estar invalido com erros.');
		console.error(JSON.stringify(invalidReport, null, 2));
		process.exit(1);
	}

	console.log('Teste de CI report passou para cenarios valido e invalido.');
} finally {
	rmSync(tmpDir, { recursive: true, force: true });
}
