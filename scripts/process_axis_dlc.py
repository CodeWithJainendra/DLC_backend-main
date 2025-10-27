#!/usr/bin/env python3
"""
AXIS Bank DLC (Digital Life Certificate) Data Processor
Processes both District-wise and State-wise DLC information
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime

class AxisDLCProcessor:
    def __init__(self, db_path='../DLC_Database.db'):
        self.db_path = db_path
        self.conn = None
    
    def create_tables(self):
        """Create DLC tracking tables"""
        cursor = self.conn.cursor()
        
        # State-wise DLC summary table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dlc_state_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                state TEXT NOT NULL,
                psa TEXT,
                total_pensioners INTEGER DEFAULT 0,
                manual_lc_submitted INTEGER DEFAULT 0,
                manual_lc_pending INTEGER DEFAULT 0,
                completion_percentage REAL DEFAULT 0,
                fiscal_year TEXT DEFAULT '2024-25',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(state, psa, fiscal_year)
            )
        ''')
        
        # District-wise DLC summary table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dlc_district_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                state TEXT,
                district TEXT NOT NULL,
                psa TEXT,
                total_pensioners INTEGER DEFAULT 0,
                manual_lc_submitted INTEGER DEFAULT 0,
                manual_lc_pending INTEGER DEFAULT 0,
                completion_percentage REAL DEFAULT 0,
                fiscal_year TEXT DEFAULT '2024-25',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(district, psa, fiscal_year)
            )
        ''')
        
        self.conn.commit()
        print("✅ DLC tables created successfully")
    
    def process_statewise(self, excel_file):
        """Process state-wise DLC data"""
        print("\n📄 Processing State-wise DLC data...")
        
        df = pd.read_excel(excel_file, sheet_name='Statewise', header=3)
        print(f"   Found {len(df)} states")
        
        cursor = self.conn.cursor()
        records = []
        
        for idx, row in df.iterrows():
            try:
                state = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else None
                psa = str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else 'CGOV'
                total = int(row.iloc[3]) if not pd.isna(row.iloc[3]) else 0
                submitted = int(row.iloc[4]) if not pd.isna(row.iloc[4]) else 0
                
                if not state or state == '' or 'Name of State' in state:
                    continue
                
                pending = total - submitted
                percentage = (submitted / total * 100) if total > 0 else 0
                
                record = (
                    state,
                    psa,
                    total,
                    submitted,
                    pending,
                    round(percentage, 2),
                    '2024-25'
                )
                records.append(record)
                
            except Exception as e:
                print(f"   ⚠️  Error at row {idx}: {e}")
        
        # Insert with REPLACE to handle duplicates
        cursor.executemany('''
            INSERT OR REPLACE INTO dlc_state_summary 
            (state, psa, total_pensioners, manual_lc_submitted, manual_lc_pending, 
             completion_percentage, fiscal_year)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        self.conn.commit()
        print(f"   ✅ Inserted {len(records)} state records")
        return len(records)
    
    def process_districtwise(self, excel_file, sheet_name='Districtwise'):
        """Process district-wise DLC data"""
        print(f"\n📄 Processing District-wise DLC data from sheet: {sheet_name}...")
        
        try:
            df = pd.read_excel(excel_file, sheet_name=sheet_name, header=3)
        except:
            # Try first sheet if named sheet doesn't exist
            df = pd.read_excel(excel_file, sheet_name=0, header=3)
        
        print(f"   Found {len(df)} rows")
        
        cursor = self.conn.cursor()
        records = []
        current_state = None
        
        for idx, row in df.iterrows():
            try:
                # Check if this is a state header row
                col0 = str(row.iloc[0]).strip() if not pd.isna(row.iloc[0]) else ''
                col1 = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else ''
                
                # If col0 is empty and col1 looks like a state name (long text, no numbers)
                if col0 == '' and col1 != '' and not col1.isdigit():
                    # Check if it's a state name (not a district)
                    if len(col1) > 3 and 'Name of District' not in col1:
                        current_state = col1
                        continue
                
                district = col1
                psa = str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else 'CGOV'
                
                # Handle NA values
                total_str = str(row.iloc[3]).strip() if not pd.isna(row.iloc[3]) else '0'
                submitted_str = str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else '0'
                
                if total_str.upper() == 'NA' or total_str == '':
                    continue
                if submitted_str.upper() == 'NA':
                    submitted_str = '0'
                
                total = int(float(total_str))
                submitted = int(float(submitted_str))
                
                if not district or district == '' or 'Name of District' in district:
                    continue
                
                # Skip summary rows
                if 'Concerned State' in psa or 'Others' in psa:
                    continue
                
                pending = total - submitted
                percentage = (submitted / total * 100) if total > 0 else 0
                
                record = (
                    current_state,
                    district,
                    psa,
                    total,
                    submitted,
                    pending,
                    round(percentage, 2),
                    '2024-25'
                )
                records.append(record)
                
            except Exception as e:
                if idx < 10:  # Only show first few errors
                    print(f"   ⚠️  Error at row {idx}: {e}")
        
        # Insert with REPLACE to handle duplicates
        cursor.executemany('''
            INSERT OR REPLACE INTO dlc_district_summary 
            (state, district, psa, total_pensioners, manual_lc_submitted, 
             manual_lc_pending, completion_percentage, fiscal_year)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        self.conn.commit()
        print(f"   ✅ Inserted {len(records)} district records")
        return len(records)
    
    def show_summary(self):
        """Show summary statistics"""
        cursor = self.conn.cursor()
        
        print("\n" + "="*80)
        print("📊 DLC SUMMARY STATISTICS")
        print("="*80)
        
        # State-wise summary
        cursor.execute('''
            SELECT 
                COUNT(*) as total_states,
                SUM(total_pensioners) as total_pensioners,
                SUM(manual_lc_submitted) as total_submitted,
                SUM(manual_lc_pending) as total_pending,
                ROUND(AVG(completion_percentage), 2) as avg_completion
            FROM dlc_state_summary
        ''')
        row = cursor.fetchone()
        print(f"\n📍 STATE-WISE SUMMARY:")
        print(f"   Total States: {row[0]}")
        print(f"   Total Pensioners: {row[1]}")
        print(f"   Manual LC Submitted: {row[2]}")
        print(f"   Manual LC Pending: {row[3]}")
        print(f"   Average Completion: {row[4]}%")
        
        # District-wise summary
        cursor.execute('''
            SELECT 
                COUNT(*) as total_districts,
                SUM(total_pensioners) as total_pensioners,
                SUM(manual_lc_submitted) as total_submitted,
                SUM(manual_lc_pending) as total_pending
            FROM dlc_district_summary
        ''')
        row = cursor.fetchone()
        print(f"\n📍 DISTRICT-WISE SUMMARY:")
        print(f"   Total Districts: {row[0]}")
        print(f"   Total Pensioners: {row[1]}")
        print(f"   Manual LC Submitted: {row[2]}")
        print(f"   Manual LC Pending: {row[3]}")
        
        # Top 5 states by completion
        print(f"\n📍 TOP 5 STATES BY COMPLETION:")
        cursor.execute('''
            SELECT state, total_pensioners, manual_lc_submitted, completion_percentage
            FROM dlc_state_summary
            WHERE total_pensioners > 0
            ORDER BY completion_percentage DESC
            LIMIT 5
        ''')
        for row in cursor.fetchall():
            print(f"   {row[0]}: {row[2]}/{row[1]} ({row[3]}%)")
        
        print("="*80)
    
    def process_file(self, excel_file, bank_name='AXIS'):
        print(f"\n📂 Processing {bank_name} DLC file: {excel_file}")
        print("="*80)
        
        # Connect to database
        self.conn = sqlite3.connect(self.db_path)
        
        # Create tables
        self.create_tables()
        
        # Check which sheets exist
        excel_data = pd.ExcelFile(excel_file)
        print(f"   Available sheets: {excel_data.sheet_names}")
        
        state_count = 0
        district_count = 0
        
        # Process state-wise if exists
        if 'Statewise' in excel_data.sheet_names:
            state_count = self.process_statewise(excel_file)
        else:
            print("   ⏭️  No Statewise sheet found, skipping...")
        
        # Process district-wise (try different sheet names)
        if 'Districtwise' in excel_data.sheet_names:
            district_count = self.process_districtwise(excel_file, 'Districtwise')
        else:
            # Try first sheet
            district_count = self.process_districtwise(excel_file, excel_data.sheet_names[0])
        
        # Show summary
        self.show_summary()
        
        print("\n✅ Processing Complete!")
        print(f"   States processed: {state_count}")
        print(f"   Districts processed: {district_count}")
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_axis_dlc.py <excel_file> [bank_name]")
        sys.exit(1)
    
    bank_name = sys.argv[2] if len(sys.argv) > 2 else 'AXIS'
    processor = AxisDLCProcessor()
    processor.process_file(sys.argv[1], bank_name)
