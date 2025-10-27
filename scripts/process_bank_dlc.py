#!/usr/bin/env python3
"""
Bank-level DLC (Digital Life Certificate) Data Processor
For banks like Bank of Baroda that provide PSA-wise summary
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime

class BankDLCProcessor:
    def __init__(self, db_path='../DLC_Database.db'):
        self.db_path = db_path
        self.conn = None
    
    def create_table(self):
        """Create bank-level DLC summary table"""
        cursor = self.conn.cursor()
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dlc_bank_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bank_name TEXT NOT NULL,
                psa_type TEXT NOT NULL,
                total_pensioners INTEGER DEFAULT 0,
                manual_lc_submitted INTEGER DEFAULT 0,
                manual_lc_pending INTEGER DEFAULT 0,
                completion_percentage REAL DEFAULT 0,
                fiscal_year TEXT DEFAULT '2024-25',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(bank_name, psa_type, fiscal_year)
            )
        ''')
        
        self.conn.commit()
        print("✅ Bank DLC table created successfully")
    
    def process_bank_file(self, excel_file, bank_name):
        """Process bank-level DLC data"""
        print(f"\n📄 Processing {bank_name} DLC data...")
        
        # Read Excel
        df = pd.read_excel(excel_file, sheet_name=0, header=3)
        print(f"   Found {len(df)} rows")
        
        cursor = self.conn.cursor()
        records = []
        
        for idx, row in df.iterrows():
            try:
                psa_type = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else None
                
                # Handle comma-separated numbers
                total_str = str(row.iloc[2]).strip().replace(',', '') if not pd.isna(row.iloc[2]) else '0'
                submitted_str = str(row.iloc[3]).strip().replace(',', '') if not pd.isna(row.iloc[3]) else '0'
                
                total = int(float(total_str)) if total_str and total_str != '' else 0
                submitted = int(float(submitted_str)) if submitted_str and submitted_str != '' else 0
                
                if not psa_type or psa_type == '' or 'Name of PSA' in psa_type:
                    continue
                
                # Skip "Others" without data
                if 'Others' in psa_type and total == 0:
                    continue
                
                pending = total - submitted
                percentage = (submitted / total * 100) if total > 0 else 0
                
                record = (
                    bank_name,
                    psa_type,
                    total,
                    submitted,
                    pending,
                    round(percentage, 2),
                    '2024-25'
                )
                records.append(record)
                
                print(f"   ✅ {psa_type}: {submitted}/{total} ({round(percentage, 2)}%)")
                
            except Exception as e:
                if idx < 5:
                    print(f"   ⚠️  Error at row {idx}: {e}")
        
        # Insert with REPLACE to handle duplicates
        cursor.executemany('''
            INSERT OR REPLACE INTO dlc_bank_summary 
            (bank_name, psa_type, total_pensioners, manual_lc_submitted, 
             manual_lc_pending, completion_percentage, fiscal_year)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        self.conn.commit()
        print(f"\n   ✅ Inserted {len(records)} records for {bank_name}")
        return len(records)
    
    def show_summary(self, bank_name=None):
        """Show summary statistics"""
        cursor = self.conn.cursor()
        
        print("\n" + "="*80)
        print("📊 BANK DLC SUMMARY STATISTICS")
        print("="*80)
        
        if bank_name:
            # Specific bank summary
            cursor.execute('''
                SELECT 
                    psa_type,
                    total_pensioners,
                    manual_lc_submitted,
                    manual_lc_pending,
                    completion_percentage
                FROM dlc_bank_summary
                WHERE bank_name = ?
                ORDER BY total_pensioners DESC
            ''', (bank_name,))
            
            print(f"\n📍 {bank_name.upper()} SUMMARY:")
            total_pensioners = 0
            total_submitted = 0
            
            for row in cursor.fetchall():
                print(f"   {row[0]}:")
                print(f"      Total: {row[1]:,}")
                print(f"      Submitted: {row[2]:,}")
                print(f"      Pending: {row[3]:,}")
                print(f"      Completion: {row[4]}%")
                total_pensioners += row[1]
                total_submitted += row[2]
            
            print(f"\n   OVERALL:")
            print(f"      Total Pensioners: {total_pensioners:,}")
            print(f"      Total Submitted: {total_submitted:,}")
            print(f"      Total Pending: {total_pensioners - total_submitted:,}")
            print(f"      Overall Completion: {round(total_submitted/total_pensioners*100, 2) if total_pensioners > 0 else 0}%")
        
        # All banks summary
        cursor.execute('''
            SELECT 
                bank_name,
                SUM(total_pensioners) as total,
                SUM(manual_lc_submitted) as submitted,
                SUM(manual_lc_pending) as pending,
                ROUND(AVG(completion_percentage), 2) as avg_completion
            FROM dlc_bank_summary
            GROUP BY bank_name
            ORDER BY total DESC
        ''')
        
        print(f"\n📍 ALL BANKS SUMMARY:")
        for row in cursor.fetchall():
            print(f"   {row[0]}: {row[2]:,}/{row[1]:,} ({row[4]}%)")
        
        print("="*80)
    
    def process_file(self, excel_file, bank_name):
        print(f"\n📂 Processing {bank_name} DLC file: {excel_file}")
        print("="*80)
        
        # Connect to database
        self.conn = sqlite3.connect(self.db_path)
        
        # Create table
        self.create_table()
        
        # Process file
        count = self.process_bank_file(excel_file, bank_name)
        
        # Show summary
        self.show_summary(bank_name)
        
        print("\n✅ Processing Complete!")
        print(f"   Records processed: {count}")
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python3 process_bank_dlc.py <excel_file> <bank_name>")
        print("Example: python3 process_bank_dlc.py 'Bank of Baroda.xlsx' 'Bank of Baroda'")
        sys.exit(1)
    
    processor = BankDLCProcessor()
    processor.process_file(sys.argv[1], sys.argv[2])
