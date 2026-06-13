#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ExpectedStatus = 'completed' | 'needs-input' | 'blocked';

type PipelineResponse = {
	status: ExpectedStatus;
	security: {
		secretsExposed: boolean;
		sensitiveAreaTouched: boolean;
	};
	validations: Array<{
		name: string;
		result: 'passed' | 'failed' | 'skipped';
	}>;
};

type TestCase = {
	name: string;
	requestFile: string;
	expectedStatus: ExpectedStatus;
	expectedSecretsExposed: boolean;
	expectedSensitiveAreaTouched: boolean;
	expectedSecurityGate: 'passed' | 'failed';
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');

const testCases: TestCase[] = [
	{
		name: 'Fluxo padrao concluido',
		requestFile: resolve(scriptDir, '..', 'examples', 'request.sample.json'),
		expectedStatus: 'completed',
		expectedSecretsExposed: false,
		expectedSensitiveAreaTouched: false,
		expectedSecurityGate: 'passed'
	},
	{
		name: 'Fluxo sensivel exige supervisao',
		requestFile: resolve(scriptDir, '..', 'examples', 'request.sensitive.sample.json'),
		expectedStatus: 'needs-input',
		expectedSecretsExposed: false,
		expectedSensitiveAreaTouched: true,
		expectedSecurityGate: 'passed'
	},
	{
		name: 'Fluxo com segredo fica bloqueado',
		requestFile: resolve(scriptDir, '..', 'examples', 'request.secret.sample.json'),
		expectedStatus: 'blocked',
		expectedSecretsExposed: true,
		expectedSensitiveAreaTouched: true,
		expectedSecurityGate: 'failed'
	}
];

for (const testCase of testCases) {
	const result = spawnSync(
		process.execPath,
		['--experimental-strip-types', pipelinePath, '--request', testCase.requestFile],
		{ encoding: 'utf-8' }
	);

	if (result.status !== 0) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error(`Exit code inesperado: ${result.status ?? 'null'}`);
		if (result.stderr) {
			console.error(result.stderr);
		}
		process.exit(1);
	}

	let payload: PipelineResponse;
	try {
		payload = JSON.parse(result.stdout) as PipelineResponse;
	} catch {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error('Saida nao e JSON valido.');
		console.error(result.stdout);
		process.exit(1);
	}

	if (payload.status !== testCase.expectedStatus) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error(`Status esperado: ${testCase.expectedStatus}, recebido: ${payload.status}`);
		process.exit(1);
	}

	if (payload.security.secretsExposed !== testCase.expectedSecretsExposed) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error('Flag security.secretsExposed com valor inesperado.');
		process.exit(1);
	}

	if (payload.security.sensitiveAreaTouched !== testCase.expectedSensitiveAreaTouched) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error('Flag security.sensitiveAreaTouched com valor inesperado.');
		process.exit(1);
	}

	const securityGate = payload.validations.find(item => item.name === 'security-gate');
	if (!securityGate) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error('Validacao security-gate nao encontrada.');
		process.exit(1);
	}
	if (securityGate.result !== testCase.expectedSecurityGate) {
		console.error(`Falha no caso: ${testCase.name}`);
		console.error(`security-gate esperado: ${testCase.expectedSecurityGate}, recebido: ${securityGate.result}`);
		process.exit(1);
	}

	console.log(`OK: ${testCase.name}`);
}

console.log('Suite de regressao MVP1 passou em todos os cenarios.');
