#!/usr/bin/env node
/**
 * Upload bundled skills to Server A for remote update delivery.
 *
 * Usage:
 *   node scripts/upload-skills.cjs              # upload all skills
 *   node scripts/upload-skills.cjs cn-docx xlsx # upload specific skills
 *
 * Requires: zip (system), ssh/scp access to Server A via PEM key.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SKILLS_DIR = path.resolve(__dirname, '../SKILLs');
const DIST_DIR = path.resolve(__dirname, '../dist-skills');
const PEM = path.join(process.env.HOME, 'Downloads/pem/udiskaimodelserver.pem');
const SERVER = 'ubuntu@1.14.96.63';
const REMOTE_DIR = '/home/ubuntu/server/skills';

// Parse version from SKILL.md frontmatter
function readSkillVersion(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return '0.0.0';
  const content = fs.readFileSync(skillFile, 'utf-8');
  const match = content.match(/^version:\s*["']?([^"'\s]+)["']?/m);
  return match ? match[1] : '0.0.0';
}

// Collect all skill directories (those containing SKILL.md)
function listSkillDirs() {
  return fs.readdirSync(SKILLS_DIR)
    .map(name => path.join(SKILLS_DIR, name))
    .filter(dir => fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, 'SKILL.md')));
}

function run(cmd, opts = {}) {
  console.log('$', cmd);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

function main() {
  const filter = process.argv.slice(2); // optional skill name filter

  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });

  const allSkillDirs = listSkillDirs();
  const targetDirs = filter.length
    ? allSkillDirs.filter(d => filter.includes(path.basename(d)))
    : allSkillDirs;

  if (targetDirs.length === 0) {
    console.error('No matching skills found.');
    process.exit(1);
  }

  const manifest = {};

  for (const skillDir of targetDirs) {
    const id = path.basename(skillDir);
    const version = readSkillVersion(skillDir);
    const zipName = `${id}.zip`;
    const zipPath = path.join(DIST_DIR, zipName);

    console.log(`\n[${id}] v${version} — zipping...`);

    // Zip the skill directory, excluding node_modules and __pycache__
    run(
      `cd "${SKILLS_DIR}" && zip -r "${zipPath}" "${id}" ` +
      `-x "${id}/node_modules/*" -x "${id}/__pycache__/*" -x "${id}/.env"`,
    );

    manifest[id] = version;
    console.log(`[${id}] done → ${zipPath}`);
  }

  // Write manifest.json
  const manifestPath = path.join(DIST_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('\nmanifest.json:', JSON.stringify(manifest, null, 2));

  // Upload to Server A
  console.log('\nUploading to Server A...');
  run(`ssh -i "${PEM}" ${SERVER} "mkdir -p ${REMOTE_DIR}"`);
  run(`scp -i "${PEM}" "${DIST_DIR}"/*.zip "${DIST_DIR}/manifest.json" ${SERVER}:${REMOTE_DIR}/`);

  console.log('\nAll done. Skills available at http://1.14.96.63:3000/skills/');
}

main();
