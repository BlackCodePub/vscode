#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type CheckResult = 'passed' | 'failed' | 'skipped';
type ReleaseStatus = 'ready' | 'blocked';

type ReleaseCheck = {
	name: string;
	result: CheckResult;
	details: string;
	exitCode?: number;
};

type ReleaseReport = {
	timestamp: string;
	project: 'nb-code-mvp1';
	status: ReleaseStatus;
	checks: ReleaseCheck[];
	summary: string;
	nextSteps: string[];
};

type ParsedArgs = {
	reportPath: string;
	outputPath: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const nbCodeDir = resolve(scriptDir, '..');
const repoRootDir = resolve(scriptDir, '..', '..', '..');

function resolveCliPath(rawPath: string) {
	const normalized = rawPath.replace(/\\/g, '/');
	if (normalized.startsWith('.github/nb-code/')) {
		return resolve(repoRootDir, normalized);
	}

	return resolve(process.cwd(), rawPath);
}

function parseArgs(argv: string[]): { args?: ParsedArgs; error?: string } {
	const args: ParsedArgs = {
		reportPath: resolve(nbCodeDir, 'examples', 'release-check.sample.json'),
		outputPath: ''
	};

	for (let i = 2; i < argv.length; i++) {
		const token = argv[i];
		if ((token === '--report' || token === '-r') && argv[i + 1]) {
			args.reportPath = resolveCliPath(argv[++i]);
			continue;
		}
		if ((token === '--output' || token === '-o') && argv[i + 1]) {
			args.outputPath = resolveCliPath(argv[++i]);
			continue;
		}
		if (token === '--report' || token === '-r' || token === '--output' || token === '-o') {
			return { error: `Parametro ${token} requer um caminho.` };
		}
		return { error: `Parametro nao reconhecido: ${token}` };
	}

	return { args };
}

function parseReport(reportPath: string): { report?: ReleaseReport; error?: string } {
	let raw = '';
	try {
		raw = readFileSync(reportPath, 'utf-8');
	} catch (error) {
		const typed = error as Error;
		return { error: `Falha ao ler report: ${typed.message}` };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return { error: 'Report informado nao e JSON valido.' };
	}

	const maybe = parsed as Partial<ReleaseReport>;
	if (maybe.project !== 'nb-code-mvp1') {
		return { error: 'Report invalido: project inesperado.' };
	}
	if (maybe.status !== 'ready' && maybe.status !== 'blocked') {
		return { error: 'Report invalido: status deve ser ready ou blocked.' };
	}
	if (!Array.isArray(maybe.checks)) {
		return { error: 'Report invalido: checks deve ser um array.' };
	}

	return { report: maybe as ReleaseReport };
}

function resultIcon(result: CheckResult) {
	if (result === 'passed') {
		return 'OK';
	}
	if (result === 'failed') {
		return 'FAIL';
	}
	return 'SKIP';
}

function buildMarkdown(report: ReleaseReport): string {
	const checksTable = report.checks
		.map(check => `| ${resultIcon(check.result)} | ${check.name} | ${check.result} | ${check.details.replace(/\|/g, '/')} |`)
		.join('\n');

	const nextSteps = report.nextSteps.map(step => `- ${step}`).join('\n');
	const blocked = report.status === 'blocked';

	return [
		'# NB-Code MVP1 - Draft PR Summary',
		'',
		`- Projeto: ${report.project}`,
		`- Timestamp do release-check: ${report.timestamp}`,
		`- Status de Prontidao: ${report.status}`,
		'',
		'## Resumo',
		report.summary,
		'',
		'## Validacoes',
		'| Resultado | Check | Status | Detalhes |',
		'|---|---|---|---|',
		checksTable,
		'',
		'## Proximos Passos',
		nextSteps,
		'',
		'## Checklist de Revisao Humana',
		'- [ ] Escopo da entrega esta claro e aderente ao MVP1.',
		'- [ ] Validacoes tecnicas foram executadas e evidenciadas.',
		'- [ ] Nao ha segredos hardcoded ou risco de seguranca nao tratado.',
		'- [ ] Mudancas estao prontas para decisao de merge.',
		'',
		blocked ? '> ALERTA: release-check bloqueado. Corrigir pendencias antes de merge.' : '> Pronto para revisao humana e decisao de merge.'
	].join('\n');
}

function main() {
	const parsedArgs = parseArgs(process.argv);
	if (parsedArgs.error || !parsedArgs.args) {
		console.error(parsedArgs.error || 'Falha ao processar argumentos.');
		process.exit(1);
	}

	const parsedReport = parseReport(parsedArgs.args.reportPath);
	if (parsedReport.error || !parsedReport.report) {
		console.error(parsedReport.error || 'Falha ao processar report.');
		process.exit(2);
	}

	const markdown = buildMarkdown(parsedReport.report);
	if (parsedArgs.args.outputPath) {
		writeFileSync(parsedArgs.args.outputPath, markdown, 'utf-8');
		console.log(`Resumo de PR salvo em: ${parsedArgs.args.outputPath}`);
	} else {
		console.log(markdown);
	}

	if (parsedReport.report.status === 'blocked') {
		process.exit(4);
	}
}

main();
