#!/usr/bin/env python3
"""
DLC vs Manual Analysis Script
Analyzes all database tables and Excel files to determine total DLC vs Manual submissions
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime
import re
import numpy as np

class DLCManualAnalyzer:
    def __init__(self, db_path="database.db"):
        self.db_path = db_path
        self.excel_folder = "Excel Files"
        self.results = {
            'database_analysis': {},
            'excel_analysis': {},
            'total_dlc': 0,
            'total_manual': 0,
            'total_records': 0,
            'summary': {}
        }
        
    def connect_db(self):
        """Connect to SQLite database"""
        return sqlite3.connect(self.db_path)
    
    def analyze_database_tables(self):
        """Analyze all database tables for DLC vs Manual data"""
        print("🔍 ANALYZING DATABASE TABLES")
        print("=" * 50)
        
        conn = self.connect_db()
        cursor = conn.cursor()
        
        # Get all table names
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
        tables = [row[0] for row in cursor.fetchall()]
        
        total_dlc = 0
        total_manual = 0
        total_records = 0
        
        for table in tables:
            print(f"\n📊 Analyzing table: {table}")
            
            try:
                # Get table schema
                cursor.execute(f"PRAGMA table_info({table});")
                columns = [col[1] for col in cursor.fetchall()]
                
                # Check if table has submission_mode or similar columns
                submission_cols = [col for col in columns if any(keyword in col.lower() 
                                 for keyword in ['submission', 'mode', 'type', 'method', 'dlc', 'manual'])]
                
                if submission_cols:
                    print(f"   📋 Found submission columns: {submission_cols}")
                    
                    for col in submission_cols:
                        # Analyze submission modes
                        cursor.execute(f"SELECT {col}, COUNT(*) FROM {table} WHERE {col} IS NOT NULL GROUP BY {col};")
                        results = cursor.fetchall()
                        
                        table_dlc = 0
                        table_manual = 0
                        
                        for mode, count in results:
                            mode_str = str(mode).upper() if mode else ""
                            
                            if any(keyword in mode_str for keyword in ['DLC', 'DIGITAL', 'ONLINE', 'PORTAL']):
                                table_dlc += count
                                print(f"      ✅ DLC ({mode}): {count:,}")
                            elif any(keyword in mode_str for keyword in ['MANUAL', 'OFFLINE', 'PHYSICAL', 'PAPER']):
                                table_manual += count
                                print(f"      📝 Manual ({mode}): {count:,}")
                            else:
                                print(f"      ❓ Unknown ({mode}): {count:,}")
                        
                        self.results['database_analysis'][f"{table}_{col}"] = {
                            'dlc': table_dlc,
                            'manual': table_manual,
                            'total': table_dlc + table_manual
                        }
                        
                        total_dlc += table_dlc
                        total_manual += table_manual
                
                # Get total records in table
                cursor.execute(f"SELECT COUNT(*) FROM {table};")
                table_total = cursor.fetchone()[0]
                total_records += table_total
                
                print(f"   📈 Total records in {table}: {table_total:,}")
                
            except Exception as e:
                print(f"   ❌ Error analyzing {table}: {e}")
        
        conn.close()
        
        print(f"\n📊 DATABASE SUMMARY:")
        print(f"   ✅ Total DLC: {total_dlc:,}")
        print(f"   📝 Total Manual: {total_manual:,}")
        print(f"   📈 Total Records: {total_records:,}")
        
        self.results['database_analysis']['totals'] = {
            'dlc': total_dlc,
            'manual': total_manual,
            'total_records': total_records
        }
        
        return total_dlc, total_manual, total_records
    
    def analyze_excel_files(self):
        """Analyze Excel files for DLC vs Manual indicators"""
        print(f"\n🔍 ANALYZING EXCEL FILES")
        print("=" * 50)
        
        if not os.path.exists(self.excel_folder):
            print(f"❌ Excel folder '{self.excel_folder}' not found")
            return 0, 0, 0
        
        total_dlc = 0
        total_manual = 0
        total_files_processed = 0
        
        # Process main Excel Files folder
        excel_files = []
        for root, dirs, files in os.walk(self.excel_folder):
            for file in files:
                if file.endswith(('.xlsx', '.xls')):
                    excel_files.append(os.path.join(root, file))
        
        print(f"📁 Found {len(excel_files)} Excel files")
        
        for file_path in excel_files:
            try:
                filename = os.path.basename(file_path)
                print(f"\n📄 Analyzing: {filename}")
                
                # Check if filename indicates DLC or Manual
                filename_upper = filename.upper()
                file_dlc = 0
                file_manual = 0
                
                if 'DLC' in filename_upper or 'PORTAL' in filename_upper or 'DIGITAL' in filename_upper:
                    print(f"   🔍 Filename indicates DLC data")
                    file_type = 'DLC'
                elif 'MANUAL' in filename_upper or 'OFFLINE' in filename_upper:
                    print(f"   🔍 Filename indicates Manual data")
                    file_type = 'MANUAL'
                else:
                    file_type = 'UNKNOWN'
                
                # Read Excel file
                excel_file = pd.ExcelFile(file_path)
                
                for sheet_name in excel_file.sheet_names:
                    try:
                        df = pd.read_excel(file_path, sheet_name=sheet_name)
                        
                        if df.empty:
                            continue
                        
                        print(f"   📋 Sheet '{sheet_name}': {len(df)} rows")
                        
                        # Look for submission mode columns
                        submission_cols = []
                        for col in df.columns:
                            col_str = str(col).upper()
                            if any(keyword in col_str for keyword in 
                                  ['SUBMISSION', 'MODE', 'TYPE', 'METHOD', 'DLC', 'MANUAL', 'PORTAL']):
                                submission_cols.append(col)
                        
                        sheet_dlc = 0
                        sheet_manual = 0
                        
                        if submission_cols:
                            print(f"      📊 Found submission columns: {submission_cols}")
                            
                            for col in submission_cols:
                                # Analyze values in submission columns
                                unique_values = df[col].dropna().unique()
                                
                                for value in unique_values:
                                    value_str = str(value).upper()
                                    count = len(df[df[col] == value])
                                    
                                    if any(keyword in value_str for keyword in ['DLC', 'DIGITAL', 'ONLINE', 'PORTAL']):
                                        sheet_dlc += count
                                        print(f"         ✅ DLC ({value}): {count}")
                                    elif any(keyword in value_str for keyword in ['MANUAL', 'OFFLINE', 'PHYSICAL']):
                                        sheet_manual += count
                                        print(f"         📝 Manual ({value}): {count}")
                        
                        # If no submission columns found, use filename indication
                        elif file_type == 'DLC':
                            # Count non-empty rows as DLC
                            non_empty_rows = len(df.dropna(how='all'))
                            sheet_dlc = non_empty_rows
                            print(f"      ✅ Assuming DLC based on filename: {sheet_dlc}")
                        elif file_type == 'MANUAL':
                            # Count non-empty rows as Manual
                            non_empty_rows = len(df.dropna(how='all'))
                            sheet_manual = non_empty_rows
                            print(f"      📝 Assuming Manual based on filename: {sheet_manual}")
                        else:
                            # Look for other indicators in data
                            sheet_data = df.to_string().upper()
                            if 'DLC' in sheet_data or 'PORTAL' in sheet_data:
                                non_empty_rows = len(df.dropna(how='all'))
                                sheet_dlc = non_empty_rows
                                print(f"      ✅ Found DLC indicators in data: {sheet_dlc}")
                            elif 'MANUAL' in sheet_data:
                                non_empty_rows = len(df.dropna(how='all'))
                                sheet_manual = non_empty_rows
                                print(f"      📝 Found Manual indicators in data: {sheet_manual}")
                            else:
                                print(f"      ❓ No clear indicators found")
                        
                        file_dlc += sheet_dlc
                        file_manual += sheet_manual
                        
                    except Exception as e:
                        print(f"      ❌ Error processing sheet '{sheet_name}': {e}")
                
                self.results['excel_analysis'][filename] = {
                    'dlc': file_dlc,
                    'manual': file_manual,
                    'total': file_dlc + file_manual,
                    'type': file_type
                }
                
                total_dlc += file_dlc
                total_manual += file_manual
                total_files_processed += 1
                
                print(f"   📊 File totals - DLC: {file_dlc:,}, Manual: {file_manual:,}")
                
            except Exception as e:
                print(f"   ❌ Error processing {filename}: {e}")
        
        print(f"\n📊 EXCEL FILES SUMMARY:")
        print(f"   📁 Files processed: {total_files_processed}")
        print(f"   ✅ Total DLC: {total_dlc:,}")
        print(f"   📝 Total Manual: {total_manual:,}")
        
        self.results['excel_analysis']['totals'] = {
            'dlc': total_dlc,
            'manual': total_manual,
            'files_processed': total_files_processed
        }
        
        return total_dlc, total_manual, total_files_processed
    
    def generate_comprehensive_report(self):
        """Generate comprehensive analysis report"""
        print(f"\n🎯 COMPREHENSIVE DLC vs MANUAL ANALYSIS")
        print("=" * 60)
        
        # Analyze database
        db_dlc, db_manual, db_total = self.analyze_database_tables()
        
        # Analyze Excel files
        excel_dlc, excel_manual, excel_files = self.analyze_excel_files()
        
        # Calculate totals
        total_dlc = db_dlc + excel_dlc
        total_manual = db_manual + excel_manual
        total_records = total_dlc + total_manual
        
        # Update results
        self.results['total_dlc'] = total_dlc
        self.results['total_manual'] = total_manual
        self.results['total_records'] = total_records
        
        # Generate final report
        print(f"\n📋 FINAL SUMMARY REPORT")
        print("=" * 40)
        print(f"📊 DATABASE ANALYSIS:")
        print(f"   ✅ DLC Submissions: {db_dlc:,}")
        print(f"   📝 Manual Submissions: {db_manual:,}")
        print(f"   📈 Database Records: {db_total:,}")
        
        print(f"\n📁 EXCEL FILES ANALYSIS:")
        print(f"   ✅ DLC Submissions: {excel_dlc:,}")
        print(f"   📝 Manual Submissions: {excel_manual:,}")
        print(f"   📄 Files Processed: {excel_files}")
        
        print(f"\n🎯 GRAND TOTALS:")
        print(f"   ✅ Total DLC Submissions: {total_dlc:,}")
        print(f"   📝 Total Manual Submissions: {total_manual:,}")
        print(f"   📊 Total Records: {total_records:,}")
        
        if total_records > 0:
            dlc_percentage = (total_dlc / total_records) * 100
            manual_percentage = (total_manual / total_records) * 100
            
            print(f"\n📈 PERCENTAGE BREAKDOWN:")
            print(f"   ✅ DLC: {dlc_percentage:.1f}%")
            print(f"   📝 Manual: {manual_percentage:.1f}%")
        
        # Save detailed results
        self.save_detailed_report()
        
        return self.results
    
    def save_detailed_report(self):
        """Save detailed analysis to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = f"DLC_MANUAL_ANALYSIS_{timestamp}.md"
        
        with open(report_file, 'w') as f:
            f.write("# DLC vs Manual Submissions Analysis Report\n\n")
            f.write(f"**Generated:** {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            
            f.write("## Summary\n\n")
            f.write(f"- **Total DLC Submissions:** {self.results['total_dlc']:,}\n")
            f.write(f"- **Total Manual Submissions:** {self.results['total_manual']:,}\n")
            f.write(f"- **Total Records:** {self.results['total_records']:,}\n\n")
            
            if self.results['total_records'] > 0:
                dlc_pct = (self.results['total_dlc'] / self.results['total_records']) * 100
                manual_pct = (self.results['total_manual'] / self.results['total_records']) * 100
                f.write(f"- **DLC Percentage:** {dlc_pct:.1f}%\n")
                f.write(f"- **Manual Percentage:** {manual_pct:.1f}%\n\n")
            
            f.write("## Database Analysis\n\n")
            for table, data in self.results['database_analysis'].items():
                if table != 'totals':
                    f.write(f"### {table}\n")
                    f.write(f"- DLC: {data['dlc']:,}\n")
                    f.write(f"- Manual: {data['manual']:,}\n")
                    f.write(f"- Total: {data['total']:,}\n\n")
            
            f.write("## Excel Files Analysis\n\n")
            for filename, data in self.results['excel_analysis'].items():
                if filename != 'totals':
                    f.write(f"### {filename}\n")
                    f.write(f"- Type: {data['type']}\n")
                    f.write(f"- DLC: {data['dlc']:,}\n")
                    f.write(f"- Manual: {data['manual']:,}\n")
                    f.write(f"- Total: {data['total']:,}\n\n")
        
        print(f"\n💾 Detailed report saved to: {report_file}")

def main():
    analyzer = DLCManualAnalyzer()
    
    print("🚀 DLC vs MANUAL ANALYSIS TOOL")
    print("=" * 50)
    print("📋 This tool will analyze:")
    print("   ✅ All database tables for submission modes")
    print("   📁 All Excel files for DLC/Manual indicators")
    print("   📊 Generate comprehensive statistics")
    print("")
    
    try:
        results = analyzer.generate_comprehensive_report()
        
        print(f"\n✅ ANALYSIS COMPLETE!")
        print(f"📊 Check the generated report file for detailed breakdown")
        
    except Exception as e:
        print(f"❌ Error during analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()