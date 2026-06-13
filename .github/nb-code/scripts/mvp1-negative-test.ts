#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pipelinePath = resolve(scriptDir, 'mvp1-pipeline.ts');
const invalidRequestPath = resolve(scriptDir, '..', 'examples', 'request.invalid.sample.json');

const result = spawnSync(
	process.execPath,
	['--experimental-strip-types', pipelinePath, '--request', invalidRequestPath],
	{ encoding: 'utf-8' }
);

if (result.status !== 2) {
	console.error('Teste negativo falhou: esperado exit code 2 para request invalido.');
	console.error(`Exit code recebido: ${result.status ?? 'null'}`);
	if (result.stdout) {
		console.error('STDOUT:');
		console.error(result.stdout);
	}
	if (result.stderr) {
		console.error('STDERR:');
		console.error(result.stderr);
	}
	process.exit(1);
}

if (!result.stderr.includes('Falha na validacao do request (schema):')) {
	console.error('Teste negativo falhou: mensagem de erro de schema nao encontrada no stderr.');
	if (result.stderr) {
		console.error(result.stderr);
	}
	process.exit(1);
}

console.log('Teste negativo passou: request invalido foi rejeitado pelo schema com exit code 2.');
