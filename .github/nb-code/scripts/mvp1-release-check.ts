#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CheckResult = 'passed' | 'failed' | 'skipped';

type ReleaseCheck = {
	name: string;
	result: CheckResult;
	details: string;
	exitCode?: number;
};

type ReleaseStatus = 'ready' | 'blocked';

type ReleaseReport = {
	timestamp: string;
	project: 'nb-code-mvp1';
	status: ReleaseStatus;
	checks: ReleaseCheck[];
	summary: string;
	nextSteps: string[];
};

type ParsedArgs = {
	output: string;
	skipTests: boolean;
	skipDirtyCheck: boolean;
};

const usage = [
	'Uso: node --experimental-strip-types .github/nb-code/scripts/mvp1-release-check.ts',
	'[--output <arquivo.json>] [--skip-tests] [--skip-dirty-check]'
].join(' ');

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nbCodeDir = resolve(scriptDir, '..');
const repoRootDir = resolve(scriptDir, '..', '..', '..');

function resolveOutputPath(rawPath: string) {
	if (!rawPath) {
		return '';
	}

	const normalized = rawPath.replace(/\\/g, '/');
	if (normalized.startsWith('.github/nb-code/')) {
		return resolve(repoRootDir, normalized);
	}

	return resolve(process.cwd(), rawPath);
}

function parseArgs(argv: string[]): { args?: ParsedArgs; error?: string } {
	const args: ParsedArgs = {
		output: '',
		skipTests: false,
		skipDirtyCheck: false
	};

	for (let i = 2; i < argv.length; i++) {
		const token = argv[i];

		if ((token === '--output' || token === '-o') && argv[i + 1]) {
			args.output = argv[++i];
			continue;
		}

		if (token === '--skip-tests') {
			args.skipTests = true;
			continue;
		}

		if (token === '--skip-dirty-check') {
			args.skipDirtyCheck = true;
			continue;
		}

		if (token === '--output' || token === '-o') {
			return { error: 'Parametro --output requer um caminho de arquivo.' };
		}

		return { error: `Parametro nao reconhecido: ${token}` };
	}

	return { args };
}

function buildRequiredFilesCheck(): ReleaseCheck {
	const requiredFiles = [
		'contracts/request.schema.json',
		'contracts/response.schema.json',
		'checklists/mvp1-delivery-checklist.md',
		'scripts/mvp1-pipeline.ts'
	];

	const missing = requiredFiles.filter(relativePath => !existsSync(resolve(nbCodeDir, relativePath)));
	if (missing.length > 0) {
		return {
			name: 'required-files',
			result: 'failed',
			details: `Arquivos obrigatorios ausentes: ${missing.join(', ')}`
		};
	}

	return {
		name: 'required-files',
		result: 'passed',
		details: `Arquivos obrigatorios encontrados (${requiredFiles.length}).`
	};
}

function buildPipelineTestsCheck(skipTests: boolean): ReleaseCheck {
	if (skipTests) {
		return {
			name: 'pipeline:test',
			result: 'skipped',
			details: 'Validacao de testes ignorada por --skip-tests.'
		};
	}

	const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
	const run = spawnSync(npmExecutable, ['run', 'pipeline:test'], {
		cwd: nbCodeDir,
		encoding: 'utf-8'
	});

	if ((run.status ?? 1) !== 0) {
		const outputSummary = (run.stderr || run.stdout || '').trim().split('\n').slice(-8).join(' | ');
		return {
			name: 'pipeline:test',
			result: 'failed',
			details: `Falha na suite pipeline:test. Resumo: ${outputSummary || 'sem detalhes'}`,
			exitCode: run.status ?? 1
		};
	}

	return {
		name: 'pipeline:test',
		result: 'passed',
		details: 'Suite pipeline:test executada com sucesso.',
		exitCode: 0
	};
}

function buildDirtyTreeCheck(skipDirtyCheck: boolean): ReleaseCheck {
	if (skipDirtyCheck) {
		return {
			name: 'git-status:.github/nb-code',
			result: 'skipped',
			details: 'Verificacao de dirty tree ignorada por --skip-dirty-check.'
		};
	}

	const statusRun = spawnSync('git', ['status', '--short', '--', '.github/nb-code'], {
		cwd: repoRootDir,
		encoding: 'utf-8'
	});

	if ((statusRun.status ?? 1) !== 0) {
		return {
			name: 'git-status:.github/nb-code',
			result: 'failed',
			details: `Falha ao executar git status para .github/nb-code: ${(statusRun.stderr || '').trim() || 'sem detalhes'}`,
			exitCode: statusRun.status ?? 1
		};
	}

	const changedLines = statusRun.stdout.trim().split('\n').filter(Boolean);
	if (changedLines.length > 0) {
		return {
			name: 'git-status:.github/nb-code',
			result: 'failed',
			details: `Workspace .github/nb-code com alteracoes locais: ${changedLines.join(' | ')}`
		};
	}

	return {
		name: 'git-status:.github/nb-code',
		result: 'passed',
		details: 'Workspace .github/nb-code limpo para release.'
	};
}

function buildReleaseReport(checks: ReleaseCheck[]): ReleaseReport {
	const failedChecks = checks.filter(check => check.result === 'failed');
	const status: ReleaseStatus = failedChecks.length === 0 ? 'ready' : 'blocked';

	if (status === 'ready') {
		return {
			timestamp: new Date().toISOString(),
			project: 'nb-code-mvp1',
			status,
			checks,
			summary: 'Release-check MVP1 concluido com validacoes essenciais aprovadas.',
			nextSteps: [
				'Atualizar a descricao do draft PR com os resultados deste release-check.',
				'Prosseguir com revisao humana final e decisao de merge.'
			]
		};
	}

	return {
		timestamp: new Date().toISOString(),
		project: 'nb-code-mvp1',
		status,
		checks,
		summary: 'Release-check MVP1 bloqueado. Corrija os checks falhos antes de finalizar o projeto.',
		nextSteps: [
			'Revisar os checks com result=failed no relatorio.',
			'Corrigir os pontos pendentes e executar novamente o release-check.'
		]
	};
}

function main() {
	const parsed = parseArgs(process.argv);
	if (parsed.error || !parsed.args) {
		console.error(parsed.error || 'Falha ao interpretar argumentos.');
		console.error(usage);
		process.exit(1);
	}

	const checks: ReleaseCheck[] = [];
	checks.push(buildRequiredFilesCheck());
	checks.push(buildPipelineTestsCheck(parsed.args.skipTests));
	checks.push(buildDirtyTreeCheck(parsed.args.skipDirtyCheck));

	const report = buildReleaseReport(checks);
	const outputText = JSON.stringify(report, null, 2);

	if (parsed.args.output) {
		const outputPath = resolveOutputPath(parsed.args.output);
		writeFileSync(outputPath, outputText, 'utf-8');
		console.log(`Release-check salvo em: ${outputPath}`);
	} else {
		console.log(outputText);
	}

	if (report.status === 'blocked') {
		process.exit(5);
	}
}

main();