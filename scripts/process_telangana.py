#!/usr/bin/env python3
"""
Telangana DLC Portal Data Processor
Pincode in column 7 (different from standard format)
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime
import json

class TelanganaProcessor:
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
    
    def extract_pincode(self, text):
        if pd.isna(text):
            return None
        import re
        text_str = str(text)
        match = re.search(r'\b(\d{6})\b', text_str)
        return match.group(1) if match else None
    
    def process_sheet(self, df, sheet_name, existing_ppos):
        """Process a single sheet and return records"""
        records = []
        duplicates = 0
        errors = 0
        
        print(f"   📄 Processing sheet: {sheet_name} ({len(df)} rows)")
        
        for idx, row in df.iterrows():
            try:
                ppo = str(row.iloc[1]).strip() if not pd.isna(row.iloc[1]) else None
                dob_str = str(row.iloc[2]).strip() if not pd.isna(row.iloc[2]) else None
                psa = str(row.iloc[3]).strip() if not pd.isna(row.iloc[3]) else ''
                branch_address = str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else ''
                # Column 7 has pensioner pincode
                pensioner_pincode = str(row.iloc[7]).strip() if not pd.isna(row.iloc[7]) else None
                
                if not ppo:
                    errors += 1
                    continue
                
                if ppo in existing_ppos:
                    duplicates += 1
                    continue
                
                existing_ppos.add(ppo)
                
                # Extract branch pincode from address
                branch_pincode = self.extract_pincode(branch_address)
                
                # Calculate age
                age = self.calculate_age(dob_str)
                age_category = self.get_age_category(age)
                
                # Get state from pincode
                state = self.get_state_from_pincode(pensioner_pincode)
                
                # Extract district from PSA (e.g., "Adilabad Dn" -> "Adilabad")
                district = psa.replace(' Dn', '').replace(' Division', '').strip() if psa else 'Unknown'
                
                # Create record
                record = (
                    ppo,
                    dob_str,
                    dob_str,
                    age,
                    age_category,
                    psa,
                    district,
                    branch_pincode,
                    branch_address[:200],
                    branch_pincode,
                    f"{district}, Pincode: {pensioner_pincode}",
                    pensioner_pincode,
                    state,
                    district
                )
                records.append(record)
                
                
            except Exception as e:
                errors += 1
                if errors < 5:
                    print(f"      ⚠️  Error at row {idx}: {e}")
        
        print(f"      ✅ Extracted: {len(records)} records (Duplicates: {duplicates}, Errors: {errors})")
        return records, duplicates, errors
    
    def process_file(self, excel_file):
        print(f"\n📂 Processing Telangana file: {excel_file}")
        print("="*80)
        
        # Read all sheets
        print("📖 Reading Excel file (checking for multiple sheets)...")
        excel_data = pd.ExcelFile(excel_file)
        print(f"📊 Found {len(excel_data.sheet_names)} sheets: {excel_data.sheet_names}")
        
        # Connect to database
        self.conn = sqlite3.connect(self.db_path)
        cursor = self.conn.cursor()
        
        # Get existing PPOs
        print("\n📋 Loading existing PPO numbers...")
        cursor.execute("SELECT ppo_number FROM pensioner_pincode_data")
        existing_ppos = set(row[0] for row in cursor.fetchall())
        print(f"   Found {len(existing_ppos)} existing records")
        
        # Process each sheet
        print("\n⚡ Processing all sheets...")
        all_records = []
        total_duplicates = 0
        total_errors = 0
        sheet_count = 0
        
        for sheet_name in excel_data.sheet_names:
            try:
                # Read sheet
                df = pd.read_excel(excel_file, sheet_name=sheet_name, header=0)
                
                # Skip empty sheets or summary sheets
                if len(df) == 0:
                    print(f"   ⏭️  Skipping empty sheet: {sheet_name}")
                    continue
                
                # Check if it's a data sheet (has PPO No. column)
                if 'PPO No.' not in df.columns and 'PPO' not in str(df.columns):
                    print(f"   ⏭️  Skipping summary sheet: {sheet_name}")
                    continue
                
                sheet_count += 1
                records, dups, errs = self.process_sheet(df, sheet_name, existing_ppos)
                all_records.extend(records)
                total_duplicates += dups
                total_errors += errs
                
            except Exception as e:
                print(f"   ❌ Error processing sheet {sheet_name}: {e}")
                total_errors += 1
        
        # Bulk insert
        print(f"\n💾 Inserting {len(all_records)} total records...")
        cursor.executemany('''
            INSERT INTO pensioner_pincode_data (
                ppo_number, year_of_birth, date_of_birth, age, age_category,
                pension_sanctioning_authority, psa_district, psa_pincode,
                disbursing_branch_address, disbursing_branch_pincode,
                pensioner_postal_address, pensioner_pincode,
                state, district
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', all_records)
        
        self.conn.commit()
        
        print("\n" + "="*80)
        print("✅ Processing Complete!")
        print("="*80)
        print(f"   Total Sheets Processed: {sheet_count}")
        print(f"   ✅ Inserted: {len(all_records)}")
        print(f"   ⏭️  Duplicates: {total_duplicates}")
        print(f"   ❌ Errors: {total_errors}")
        print("="*80)
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_telangana.py <excel_file>")
        sys.exit(1)
    
    processor = TelanganaProcessor()
    processor.process_file(sys.argv[1])
