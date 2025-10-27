#!/usr/bin/env python3
"""
Gujarat DLC Portal Data Processor
Handles Excel date format for Year of Birth
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime, timedelta
import json
import os

class GujaratProcessor:
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
    
    def excel_date_to_datetime(self, excel_date):
        if pd.isna(excel_date):
            return None
        try:
            # Excel epoch starts at 1899-12-30
            epoch = datetime(1899, 12, 30)
            return epoch + timedelta(days=float(excel_date))
        except:
            return None
    
    def calculate_age(self, dob_date):
        if not dob_date:
            return None
        try:
            age = (datetime.now() - dob_date).days // 365
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
        print(f"\n📂 Processing Gujarat file: {excel_file}")
        print("="*80)
        
        # Read Excel
        print("📖 Reading Excel file...")
        df = pd.read_excel(excel_file, sheet_name='HOS', header=1)
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
                ho = str(row.iloc[1]) if not pd.isna(row.iloc[1]) else ''
                ppo = str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else None
                excel_yob = row.iloc[3]
                psa = str(row.iloc[4]) if not pd.isna(row.iloc[4]) else 'G.M. FINANCE'
                disbursing_pincode = str(row.iloc[5]) if not pd.isna(row.iloc[5]) else None
                pensioner_pincode = str(row.iloc[6]) if not pd.isna(row.iloc[6]) else None
                
                if not ppo:
                    errors += 1
                    continue
                    
                if ppo in existing_ppos:
                    duplicates += 1
                    continue
                
                # Add to existing set
                existing_ppos.add(ppo)
                
                # Convert Excel date to DOB
                dob_date = self.excel_date_to_datetime(excel_yob)
                dob_str = dob_date.strftime('%d-%m-%Y') if dob_date else None
                
                # Calculate age
                age = self.calculate_age(dob_date) if dob_date else None
                age_category = self.get_age_category(age)
                
                # Get state
                state = self.get_state_from_pincode(pensioner_pincode)
                if state == 'Unknown':
                    state = self.get_state_from_pincode(disbursing_pincode)
                
                # Create PSA text
                psa_text = f"{psa} - {ho}" if ho else psa
                
                # Create record
                record = (
                    ppo,  # ppo_number
                    dob_str,  # year_of_birth
                    dob_str,  # date_of_birth
                    age,  # age
                    age_category,  # age_category
                    psa_text,  # pension_sanctioning_authority
                    'Unknown',  # psa_district
                    disbursing_pincode,  # psa_pincode
                    f"{ho} - {disbursing_pincode}",  # disbursing_branch_address
                    disbursing_pincode,  # disbursing_branch_pincode
                    f"Pincode: {pensioner_pincode}",  # pensioner_postal_address
                    pensioner_pincode,  # pensioner_pincode
                    state,  # state
                    'Unknown'  # district
                )
                records.append(record)
                
                # Progress
                if (idx + 1) % 2000 == 0:
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
        print("✅ Processing Complete!")
        print("="*80)
        print(f"   Total Rows: {len(df)}")
        print(f"   ✅ Inserted: {len(records)}")
        print(f"   ⏭️  Duplicates: {duplicates}")
        print(f"   ❌ Errors: {errors}")
        print("="*80)
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_gujarat.py <excel_file>")
        sys.exit(1)
    
    processor = GujaratProcessor()
    processor.process_file(sys.argv[1])
