import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getFilesRecursively(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getFilesRecursively(fullPath));
    } else if (/\.(jsx?|tsx?)$/.test(entry.name) && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.test.jsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Exam Safety Rules (Exam Portal and Exam Monitoring)', () => {
  const portalDir = path.resolve(__dirname);
  const monitoringDir = path.resolve(__dirname, '../exam-monitoring');

  const portalFiles = getFilesRecursively(portalDir);
  const monitoringFiles = getFilesRecursively(monitoringDir);
  const allExamFiles = [...portalFiles, ...monitoringFiles];

  it('scans and finds exam source files', () => {
    expect(allExamFiles.length).toBeGreaterThan(5);
  });

  it('never imports NeonGridBackground in exam-portal or exam-monitoring', () => {
    const violations = [];
    for (const file of allExamFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('NeonGridBackground')) {
        violations.push(path.basename(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('never imports AppFooter in exam-portal or exam-monitoring', () => {
    const violations = [];
    for (const file of allExamFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('AppFooter')) {
        violations.push(path.basename(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('never imports NotificationCenter in exam-portal or exam-monitoring', () => {
    const violations = [];
    for (const file of allExamFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('NotificationCenter')) {
        violations.push(path.basename(file));
      }
    }
    expect(violations).toEqual([]);
  });

  it('never imports or invokes sound-playing APIs (AudioContext, new Audio, playTestAlertSound)', () => {
    const soundPatterns = [
      /\bplayTestAlertSound\b/,
      /\bnew\s+Audio\s*\(/,
      /\bnew\s+(?:window\.)?(?:AudioContext|webkitAudioContext)\s*\(/,
    ];

    const violations = [];
    for (const file of allExamFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const pattern of soundPatterns) {
        if (pattern.test(content)) {
          violations.push(`${path.basename(file)} matches ${pattern.toString()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
