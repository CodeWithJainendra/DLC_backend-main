#\!/usr/bin/env python3
"""
IDBI Bank Pensioner Data Processor
Simple format - Year as number, Pincode in separate column
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime
import json

class IDBIProcessor:
    def __init__(self, db_path='../DLC_Database.db'):
        self.db_path = db_path
        self.conn = None
        self.pincode_mapping = self.load_pincode_mapping()
        
    def load_pincode_mapping(self):
        try:
            with open('pincode_state_mapping.json', 'r') as f:
                return json.load(f)
        except:
            return {'pincodeRanges': {}, 'specialCases': {}}
    
    def get_state_from_pincode(self, pincode):
        if not pincode or len(str(pincode)) != 6:
            return 'Unknown'
        
        pincode_str = str(pincode)
        prefix = pincode_str[:2]
        
        for state, ranges in self.pincode_mapping.get('pincodeRanges', {}).items():
            if prefix in ranges:
                return state
        return 'Unknown'
    
    def calculate_age_from_year(self, year):
        if pd.isna(year):
            return None
        try:
            current_year = datetime.now().year
            age = current_year - int(year)
            return age
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
        print(f"\n📂 Processing IDBI file: {excel_file}")
        print("="*80)
        
        # Read Excel
        print("📖 Reading Excel file...")
        df = pd.read_excel(excel_file, sheet_name=0, header=0)
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
        print("\n⚡ Processing data...")
        records = []
        duplicates = 0
        errors = 0
        
        for idx, row in df.iterrows():
            try:
                # Extract data
                ppo = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else None
                year_of_birth = row.iloc[2]
                psa = str(row.iloc[3]).strip() if not pd.isna(row.iloc[3]) else 'CPAO'
                disbursing_address = str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else ''
                pincode = str(row.iloc[5]).strip() if not pd.isna(row.iloc[5]) else None
                
                if not ppo:
                    errors += 1
                    continue
                    
                if ppo in existing_ppos:
                    duplicates += 1
                    continue
                
                # Add to existing set
                existing_ppos.add(ppo)
                
                # Calculate age from year
                age = self.calculate_age_from_year(year_of_birth)
                age_category = self.get_age_category(age)
                
                # Get state from pincode
                state = self.get_state_from_pincode(pincode)
                
                # Create year string
                year_str = str(int(year_of_birth)) if not pd.isna(year_of_birth) else None
                
                # Create record
                record = (
                    ppo,  # ppo_number
                    year_str,  # year_of_birth
                    year_str,  # date_of_birth
                    age,  # age
                    age_category,  # age_category
                    f"{psa} - IDBI Bank",  # pension_sanctioning_authority
                    'Unknown',  # psa_district
                    pincode,  # psa_pincode
                    disbursing_address[:200],  # disbursing_branch_address
                    pincode,  # disbursing_branch_pincode
                    f"Pincode: {pincode}",  # pensioner_postal_address
                    pincode,  # pensioner_pincode
                    state,  # state
                    'Unknown'  # district
                )
                records.append(record)
                
                # Progress
                if (idx + 1) % 500 == 0:
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
        print("Usage: python3 process_idbi.py <excel_file>")
        sys.exit(1)
    
    processor = IDBIProcessor()
    processor.process_file(sys.argv[1])
