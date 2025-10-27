#!/usr/bin/env python3
"""
NE (North East) DLC Portal Data Processor
Handles multiple sheets with different formats
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime, timedelta
import json

class NEProcessor:
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
            epoch = datetime(1899, 12, 30)
            return epoch + timedelta(days=float(excel_date))
        except:
            return None
    
    def calculate_age(self, dob_input):
        if pd.isna(dob_input):
            return None
        try:
            # Try as Excel date first
            if isinstance(dob_input, (int, float)):
                dob_date = self.excel_date_to_datetime(dob_input)
                if dob_date:
                    age = (datetime.now() - dob_date).days // 365
                    return age
            
            # Try as string date
            dob_str = str(dob_input)
            for fmt in ['%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y']:
                try:
                    dob = datetime.strptime(dob_str, fmt)
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
        
        print(f"\n   📄 Processing sheet: {sheet_name}")
        print(f"      Rows: {len(df)}")
        
        # Detect column positions based on sheet format
        # Most sheets have: PPO, Year of Birth, PSA, Branch Pincode, Pensioner Pincode
        
        for idx, row in df.iterrows():
            try:
                # Try to find PPO column (usually column 1 or 2)
                ppo = None
                dob = None
                psa = None
                branch_pincode = None
                pensioner_pincode = None
                
                # Try different column positions
                for col_idx in range(min(10, len(row))):
                    val = str(row.iloc[col_idx]).strip() if not pd.isna(row.iloc[col_idx]) else ''
                    
                    # PPO detection (contains NE- or POSTAL or numbers)
                    if not ppo and val and ('NE-' in val or 'POSTAL' in val or (val.replace('-','').replace('/','').isalnum() and len(val) > 3)):
                        if 'PPO' not in val.upper() and val not in ['', 'Sl.', 'S.', 'No', 'No.']:
                            ppo = val
                
                # Get DOB (usually column 2 or 3)
                if len(row) > 2:
                    dob = row.iloc[2] if not pd.isna(row.iloc[2]) else (row.iloc[3] if len(row) > 3 else None)
                
                # Get PSA (usually column 3 or 4)
                if len(row) > 3:
                    psa = str(row.iloc[3]).strip() if not pd.isna(row.iloc[3]) else (str(row.iloc[4]).strip() if len(row) > 4 else '')
                
                # Get pincodes from last few columns
                for col_idx in range(len(row)-1, max(0, len(row)-5), -1):
                    val = row.iloc[col_idx]
                    if not pd.isna(val):
                        extracted = self.extract_pincode(str(val))
                        if extracted:
                            if not pensioner_pincode:
                                pensioner_pincode = extracted
                            elif not branch_pincode:
                                branch_pincode = extracted
                
                # Also try to extract from address columns
                for col_idx in range(4, min(len(row), 8)):
                    val = row.iloc[col_idx]
                    if not pd.isna(val):
                        extracted = self.extract_pincode(str(val))
                        if extracted:
                            if not branch_pincode:
                                branch_pincode = extracted
                            if not pensioner_pincode:
                                pensioner_pincode = extracted
                
                if not ppo or not ppo.strip():
                    continue
                
                ppo = ppo.strip()
                
                if ppo in existing_ppos:
                    duplicates += 1
                    continue
                
                existing_ppos.add(ppo)
                
                # Calculate age
                age = self.calculate_age(dob)
                age_category = self.get_age_category(age)
                
                # Get state from pincode
                state = self.get_state_from_pincode(pensioner_pincode)
                
                # Format DOB
                dob_str = None
                if isinstance(dob, (int, float)):
                    dob_date = self.excel_date_to_datetime(dob)
                    dob_str = dob_date.strftime('%d-%m-%Y') if dob_date else str(dob)
                else:
                    dob_str = str(dob) if not pd.isna(dob) else None
                
                # Create record
                record = (
                    ppo,
                    dob_str,
                    dob_str,
                    age,
                    age_category,
                    psa if psa else 'DA(P), Shillong',
                    sheet_name,  # Use sheet name as district
                    branch_pincode,
                    f"{sheet_name}, Pincode: {branch_pincode}",
                    branch_pincode,
                    f"{sheet_name}, Pincode: {pensioner_pincode}",
                    pensioner_pincode,
                    state,
                    sheet_name  # Use sheet name as district
                )
                records.append(record)
                
            except Exception as e:
                errors += 1
                if errors < 5:
                    print(f"      ⚠️  Error at row {idx}: {e}")
        
        print(f"      ✅ Extracted: {len(records)} records")
        print(f"      ⏭️  Duplicates: {duplicates}")
        print(f"      ❌ Errors: {errors}")
        
        return records, duplicates, errors
    
    def process_file(self, excel_file):
        print(f"\n📂 Processing NE (North East) file: {excel_file}")
        print("="*80)
        
        # Read all sheets
        print("📖 Reading Excel file (multiple sheets)...")
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
        
        for sheet_name in excel_data.sheet_names:
            try:
                # Read sheet - try different header rows
                df = None
                for header_row in [1, 0, 2]:
                    try:
                        df = pd.read_excel(excel_file, sheet_name=sheet_name, header=header_row)
                        if len(df) > 0:
                            break
                    except:
                        continue
                
                if df is None or len(df) == 0:
                    print(f"\n   ⚠️  Skipping empty sheet: {sheet_name}")
                    continue
                
                records, dups, errs = self.process_sheet(df, sheet_name, existing_ppos)
                all_records.extend(records)
                total_duplicates += dups
                total_errors += errs
                
            except Exception as e:
                print(f"\n   ❌ Error processing sheet {sheet_name}: {e}")
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
        print(f"   Total Sheets: {len(excel_data.sheet_names)}")
        print(f"   ✅ Inserted: {len(all_records)}")
        print(f"   ⏭️  Duplicates: {total_duplicates}")
        print(f"   ❌ Errors: {total_errors}")
        print("="*80)
        
        self.conn.close()

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python3 process_ne_multisheet.py <excel_file>")
        sys.exit(1)
    
    processor = NEProcessor()
    processor.process_file(sys.argv[1])
