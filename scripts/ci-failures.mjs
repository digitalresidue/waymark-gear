// CI helper: print each test that failed on its final attempt as a GitHub
// error annotation, with its error message. GitHub keeps only ten annotations
// per step and retried (flaky) tests use them up, so the real failure's
// reason was often missing from the summary.
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || 'test-results/results.json';
if (!fs.existsSync(file)) process.exit(0);
const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const rootDir = (report.config && report.config.rootDir) || process.cwd();
const strip = (s) => String(s || '').replace(/\u001b\[[0-9;]*m/g, '');
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '').replace(/\n/g, '%0A');

function* specs(suite, titles = []) {
    const path = suite.title && !suite.title.endsWith('.ts') ? [...titles, suite.title] : titles;
    for (const spec of suite.specs || []) yield { spec, titles: path };
    for (const child of suite.suites || []) yield* specs(child, path);
}

let failed = 0;
for (const top of report.suites || []) {
    for (const { spec, titles } of specs(top)) {
        for (const t of spec.tests || []) {
            const last = t.results[t.results.length - 1];
            if (!last || !['failed', 'timedOut'].includes(last.status)) continue;
            failed++;
            const msg = strip((last.errors || []).map((e) => e.message).join('\n\n') || last.status).slice(0, 3000);
            const name = [...titles, spec.title].join(' › ');
            const where = path.relative(process.cwd(), path.join(rootDir, spec.file));
            console.log(`::error file=${where},line=${spec.line},title=${esc(`${t.projectName}: ${name}`)}::${esc(msg)}`);
        }
    }
}
console.log(`${failed} test(s) failed on every attempt.`);
