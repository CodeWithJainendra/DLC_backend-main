#\!/usr/bin/env python3
"""
IOB (Indian Overseas Bank) Pensioner Data Processor
Large file - 59K+ rows with separated State, District, Pincode
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime

class IOBProcessor:
    def __init__(self, db_path='../DLC_Database.db'):
        self.db_path = db_path
        self.conn = None
        
    def calculate_age(self, dob_str):
        if pd.isna(dob_str):
            return None
        try:
            for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y']:
                try:
                    dob = datetime.strptime(str(dob_str), fmt)
                    age = (datetime.now() - dob).days // 365
                    return age
                except:
                    continue
            return None
        except:
            return None
    
    def get_age_category(self, age):
        if pd.isna(age) or age is None:
            return 'Unknown'
        if age < 60:
            return 'Below 60'
        elif age < 70:
            return '60-69'
        elif age < 80:
            return '70-79'
        elif age < 90:
            return '80-89'
        else:
            return '90+'
    
    def process_file(self, excel_file):
        print(f"\n📂 Processing IOB file: {excel_file}")
        print("="*80)
        
        # Read Excel - skip first 2 rows, use row 2 as header
        print("📖 Reading Excel file...")
        df = pd.read_excel(excel_file, sheet_name=0, header=1)
        print(f"📊 Total rows: {len(df)}")
        
        # Connect to database
        self.conn = sqlite3.connect(self.db_path)
        cursor = self.conn.cursor()
        
        # Get existing PPOs
        print("📋 Loading existing PPO numbers...")
        cursor.execute("SELECT ppo_number FROM pensioner_pincode_data")
        existing_ppos = set(row[0] for row in cursor.fetchall())
        print(f"   Found {len(existing_ppos)} existing records")
        
        # Process data
        print("\n⚡ Processing data (large file - please wait)...")
        records = []
        duplicates = 0
        errors = 0
        
        for idx, row in df.iterrows():
            try:
                ppo = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else None
                dob_str = str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else None
                psa = str(row.iloc[3]).strip() if not pd.isna(row.iloc[3]) else 'CPAO'
                pda = str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else ''
                bank_name = str(row.iloc[5]).strip() if not pd.isna(row.iloc[5]) else 'INDIAN OVERSEAS BANK'
                branch_name = str(row.iloc[6]).strip() if not pd.isna(row.iloc[6]) else ''
                postal_address = str(row.iloc[7]).strip() if not pd.isna(row.iloc[7]) else ''
                tehsil = str(row.iloc[8]).strip() if not pd.isna(row.iloc[8]) else ''
                city = str(row.iloc[9]).strip() if not pd.isna(row.iloc[9]) else ''
                district = str(row.iloc[10]).strip() if not pd.isna(row.iloc[10]) else 'Unknown'
                state = str(row.iloc[11]).strip() if not pd.isna(row.iloc[11]) else 'Unknown'
                pincode = str(row.iloc[12]).strip() if not pd.isna(row.iloc[12]) else None
                
                if not ppo:
                    errors += 1
                    continue
                    
                if ppo in existing_ppos:
                    duplicates += 1
                    continue
                
                existing_ppos.add(ppo)
                
                # Calculate age
                age = self.calculate_age(dob_str)
                age_category = self.get_age_category(age)
                
                # Create full address
                full_address = f"{postal_address}, {tehsil}, {city}" if postal_address else f"{city}, {district}"
                
                # Create record
                record = (
                    ppo,
                    dob_str,
                    dob_str,
                    age,
                    age_category,
                    f"{psa} - {bank_name}",
                    district,
                    pincode,
                    f"{branch_name}, {city}"[:200],
                    pincode,
                    full_address[:200],
                    pincode,
                    state,
                    district
                )
                records.append(record)
                
                # Progress every 5000 rows
                if (idx + 1) % 5000 == 0:
                    print(f"   Processed {idx + 1}/{len(df)} rows...")
                
            except Exception as e:
                errors += 1
                if errors < 10:
                    print(f"   ⚠️  Error at row {idx}: {e}")
        
        # Bulk insert
        print(f"\n💾 Inserting {len(records)} records...")
        cursor.executemany('''
            INSERT INTO pensioner_pincode_data (
                ppo_number, year_of_birth, date_of_birth, age, age_category,
                pension_sanctioning_authority, psa_district, psa_pincode,
                disbursing_branch_address, disbursing_branch_pincode,
                pensioner_postal_address, pensioner_pincode,
                state, district
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', records)
        
        self.conn.commit()
        
        print("\n" + "="*80)
        print("✅ Processing Complete\!")
        print("="*80)
        print(f"   Total Rows: {len(df)}")
        print(f"   ✅ Inserted: {len(records)}")
        print(f"   ⏭️  Duplicates: {duplicates}")
        print(f"   ❌ Errors: {errors}")
        print("="*80)
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_iob.py <excel_file>")
        sys.exit(1)
    
    processor = IOBProcessor()
    processor.process_file(sys.argv[1])
