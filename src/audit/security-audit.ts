import fs from 'fs';
import path from 'path';

export function runAudit(): boolean {
  console.log(`\n==================================================`);
  console.log(`🛡️ DLMM LEADER OBSERVER — SECURITY & READ-ONLY AUDIT`);
  console.log(`==================================================\n`);

  // Target forbidden patterns (constructed dynamically to avoid false self-positives)
  const forbiddenTokens = [
    'private' + 'Key',
    'secret' + 'Key',
    'Keypair.' + 'fromSecretKey',
    'Keypair.' + 'generate',
    'sign' + 'Transaction',
    'sign' + 'AllTransactions',
    'send' + 'Transaction',
    'send' + 'AndConfirmTransaction',
    'WALLET_' + 'PRIVATE_' + 'KEY',
    'SystemProgram.' + 'transfer',
  ];

  const srcDir = path.resolve(process.cwd(), 'src');
  const files: string[] = [];

  function scanDir(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js'))) {
        // Exclude the audit checker itself from token scanning
        if (entry.name === 'security-audit.ts' || entry.name === 'security-audit.js') {
          continue;
        }
        files.push(fullPath);
      }
    }
  }

  scanDir(srcDir);

  let violationsCount = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(process.cwd(), file);

    for (const token of forbiddenTokens) {
      if (content.includes(token)) {
        violationsCount++;
        console.error(`🚨 SECURITY VIOLATION in ${relativePath}: Found forbidden identifier "${token}"`);
      }
    }
  }

  console.log(`Audited ${files.length} source file(s) in src/\n`);

  if (violationsCount > 0) {
    console.error(`❌ AUDIT FAILED: ${violationsCount} security violation(s) found!`);
    return false;
  } else {
    console.log(`✅ SECURITY AUDIT PASSED: Zero private keys, zero signing methods, strictly read-only.`);
    return true;
  }
}
