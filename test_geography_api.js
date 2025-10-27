#!/usr/bin/env node
/**
 * Test script for Geography API
 * Tests the /api/pension/geography/states endpoint
 */

const sqlite3 = require('better-sqlite3');

// Open database
const db = sqlite3('database.db');

console.log('='.repeat(80));
console.log('GEOGRAPHY API DATA VERIFICATION');
console.log('='.repeat(80));
console.log();

// 1. Check dlc_bank_summary (main source)
console.log('1. DLC Bank Summary (Main Source)');
console.log('-'.repeat(40));
const bankSummary = db.prepare(`
  SELECT 
    SUM(total_pensioners) as total_pensioners,
    SUM(manual_lc_submitted) as dlc_submitted,
    SUM(manual_lc_pending) as pending
  FROM dlc_bank_summary
`).get();

console.log(`Total Pensioners: ${bankSummary.total_pensioners?.toLocaleString() || 0}`);
console.log(`DLC Submitted: ${bankSummary.dlc_submitted?.toLocaleString() || 0}`);
console.log(`Pending: ${bankSummary.pending?.toLocaleString() || 0}`);
console.log();

// 2. Check UBI tables
console.log('2. UBI Tables (Additional Pensioners)');
console.log('-'.repeat(40));
const ubi1 = db.prepare('SELECT COUNT(*) as count FROM ubi_pensioners').get();
const ubi2 = db.prepare('SELECT COUNT(*) as count FROM ubi2_pensioners').get();
const ubi3 = db.prepare('SELECT COUNT(*) as count FROM ubi3_pensioners').get();
const ubiTotal = (ubi1.count || 0) + (ubi2.count || 0) + (ubi3.count || 0);

console.log(`UBI1 Pensioners: ${ubi1.count?.toLocaleString() || 0}`);
console.log(`UBI2 Pensioners: ${ubi2.count?.toLocaleString() || 0}`);
console.log(`UBI3 Pensioners: ${ubi3.count?.toLocaleString() || 0}`);
console.log(`UBI Total: ${ubiTotal.toLocaleString()}`);
console.log();

// 3. Check DOPPW table
console.log('3. DOPPW Table (Detailed Records)');
console.log('-'.repeat(40));
const doppw = db.prepare(`
  SELECT 
    COUNT(*) as total,
    COUNT(CASE WHEN SUBMISSION_MODE = 'DLC' THEN 1 END) as dlc_count,
    COUNT(CASE WHEN SUBMISSION_MODE = 'PLC' OR SUBMISSION_MODE = 'VLC' THEN 1 END) as manual_count
  FROM TBL_DOPPW_DLCDATA_MST
`).get();

console.log(`Total Records: ${doppw.total?.toLocaleString() || 0}`);
console.log(`DLC Mode: ${doppw.dlc_count?.toLocaleString() || 0}`);
console.log(`Manual Mode: ${doppw.manual_count?.toLocaleString() || 0}`);
console.log();

// 4. Calculate final totals
console.log('='.repeat(80));
console.log('FINAL TOTALS (What API Should Return)');
console.log('='.repeat(80));

const finalTotalPensioners = (bankSummary.total_pensioners || 0) + ubiTotal;
const finalTotalDLC = bankSummary.dlc_submitted || 0;
const finalPending = bankSummary.pending || 0;

console.log(`Total Pensioners: ${finalTotalPensioners.toLocaleString()}`);
console.log(`Total DLC: ${finalTotalDLC.toLocaleString()}`);
console.log(`Total Pending: ${finalPending.toLocaleString()}`);
console.log('='.repeat(80));
console.log();

// 5. Show breakdown
console.log('Breakdown:');
console.log(`  Bank Summary: ${bankSummary.total_pensioners?.toLocaleString() || 0} pensioners`);
console.log(`  UBI Tables: ${ubiTotal.toLocaleString()} pensioners`);
console.log(`  DOPPW Table: ${doppw.total?.toLocaleString() || 0} records (for reference)`);
console.log();

console.log('Note: Bank Summary is the main source for total pensioners and DLC count.');
console.log('      UBI tables contain additional pensioner records.');
console.log('      DOPPW table has detailed submission records.');

db.close();
