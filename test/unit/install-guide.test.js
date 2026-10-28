// INSTALL.md is written for people who have never run a server, so it has to
// stay exactly in step with the code. These checks fail the build when they
// drift apart; test/install/run.sh (CI) runs the guide's commands for real.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const guide = read('INSTALL.md');
const envExample = read('deploy/.env.production.example');
const waymark = read('deploy/waymark');
const install = read('deploy/install.sh');
const compose = read('deploy/docker-compose.prod.yml');
const pkg = JSON.parse(read('package.json'));

// GitHub's heading anchors: lower-case, punctuation dropped, spaces to dashes.
const anchors = new Set([...guide.matchAll(/^#{1,6} (.+)$/gm)].map(([, h]) => h.trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-')));

describe('INSTALL.md', () => {
    test('says which version it was checked with, and it is this one', () => {
        const m = guide.match(/Checked with Waymark Gear (\d+\.\d+\.\d+)/);
        assert.ok(m, 'INSTALL.md needs a "Checked with Waymark Gear x.y.z" line');
        assert.equal(m[1], pkg.version, `INSTALL.md was checked with ${m[1]} but this is ${pkg.version}: walk through the guide again, then update the line (CONTRIBUTING.md, "Releasing")`);
    });

    test('says when DigitalOcean\'s screens were last checked', () => {
        assert.match(guide, /screens last checked[\s>]*\d{4}-\d{2}-\d{2}/);
    });

    test('explains every waymark command', () => {
        const commands = [...waymark.matchAll(/^ {4}([a-z-]+)(?:\|[^)]*)?\) /gm)].map(([, c]) => c);
        assert.ok(commands.length >= 10, `found only ${commands.length} commands in deploy/waymark`);
        for (const c of commands) {
            assert.ok(guide.includes(`\`waymark ${c}`), `INSTALL.md doesn't explain \`waymark ${c}\``);
        }
    });

    test('every setting is either filled in by install.sh, or explained in a guide', () => {
        const filled = new Set([...install.matchAll(/^set_env ([A-Z_]+) /gm)].map(([, k]) => k));
        assert.ok(filled.size >= 4, 'expected install.sh to fill in at least 4 settings');
        const deploy = read('DEPLOY.md');
        const keys = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map(([, k]) => k);
        for (const k of keys) {
            if (filled.has(k)) continue;
            assert.ok(guide.includes(k) || deploy.includes(k), `${k} is in deploy/.env.production.example but neither INSTALL.md nor DEPLOY.md mentions it`);
        }
    });

    test('the settings install.sh fills in exist in the example', () => {
        for (const [, k] of install.matchAll(/^set_env ([A-Z_]+) /gm)) {
            assert.match(envExample, new RegExp(`^${k}=`, 'm'), `install.sh sets ${k}, which isn't in deploy/.env.production.example`);
        }
    });

    test('sections the scripts send people to exist', () => {
        const scripts = install + waymark + compose + read('deploy/Caddyfile') + read('deploy/backup.sh') + envExample;
        const refs = [...scripts.matchAll(/INSTALL\.md, (?:\\?")([^"\\]+)(?:\\?")/g)].map(([, h]) => h);
        assert.ok(refs.length >= 5, 'expected the scripts to point at INSTALL.md sections');
        for (const h of refs) {
            const id = h.toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
            assert.ok(anchors.has(id), `a script points to INSTALL.md, "${h}", but there's no such heading`);
        }
        for (const [, n] of scripts.matchAll(/INSTALL\.md, step (\d+)/g)) {
            assert.ok([...anchors].some((a) => a.startsWith(`step-${n}-`)), `a script points to INSTALL.md step ${n}, which doesn't exist`);
        }
    });

    test('its own links to sections work', () => {
        for (const [, id] of guide.matchAll(/\]\(#([\w-]+)\)/g)) {
            assert.ok(anchors.has(id), `INSTALL.md links to #${id}, which doesn't exist`);
        }
        const deployAnchors = new Set([...read('DEPLOY.md').matchAll(/^#{1,6} (.+)$/gm)].map(([, h]) => h.trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-')));
        for (const [, id] of guide.matchAll(/\]\(DEPLOY\.md#([\w-]+)\)/g)) {
            assert.ok(deployAnchors.has(id), `INSTALL.md links to DEPLOY.md#${id}, which doesn't exist`);
        }
    });

    test('the bootstrap commands match the files they rely on', () => {
        // Step 5b reads install.sh out of the image, so the image must ship it.
        assert.match(read('Dockerfile'), /COPY .*\/app\/deploy \.\/deploy/);
        const image = guide.match(/docker run --rm (\S+) cat deploy\/install\.sh > install\.sh/);
        assert.ok(image, 'INSTALL.md step 5b changed shape');
        assert.ok(install.includes(image[1]), `install.sh's default image isn't ${image[1]}`);
        assert.match(compose, new RegExp(image[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(':latest', '')));
        assert.match(envExample, new RegExp(`^APP_IMAGE=${image[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
    });

    test('the plan it recommends is the one install.sh sizes for', () => {
        // The swap file and "2 GB" droplet go together; the $6 plan is too small.
        assert.match(guide, /\$12\/mo/);
        assert.match(install, /fallocate -l 2G/);
    });
});
