#!/usr/bin/env python3
"""
PSB (Punjab & Sind Bank) Pensioner Data Processor
Large file - 31K+ rows with State, City, Pincode columns
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime

class PSBProcessor:
    def __init__(self, db_path='../DLC_Database.db'):
        self.db_path = db_path
        self.conn = None
    
    def calculate_age(self, dob_str):
        if pd.isna(dob_str):
            return None
        try:
            dob_str = str(dob_str).strip()
            # Try DD-MMM-YY format (01-JUN-42)
            for fmt in ['%d-%b-%y', '%d-%B-%y', '%d-%b-%Y', '%d-%B-%Y', '%d/%m/%Y', '%d-%m-%Y']:
                try:
                    dob = datetime.strptime(dob_str, fmt)
                    # Handle 2-digit year (42 could be 1942 or 2042)
                    if dob.year > datetime.now().year:
                        dob = dob.replace(year=dob.year - 100)
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
        print(f"\n📂 Processing PSB file: {excel_file}")
        print("="*80)
        
        # Read Excel - skip first row, use rows 1-2 as headers
        print("📖 Reading Excel file (large file - please wait)...")
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
                branch_address = str(row.iloc[4]).strip() if not pd.isna(row.iloc[4]) else ''
                branch_pincode = str(row.iloc[5]).strip() if not pd.isna(row.iloc[5]) else None
                customer_state = str(row.iloc[6]).strip() if not pd.isna(row.iloc[6]) else 'Unknown'
                customer_city = str(row.iloc[7]).strip() if not pd.isna(row.iloc[7]) else ''
                customer_pincode = str(row.iloc[8]).strip() if not pd.isna(row.iloc[8]) else None
                
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
                
                # Normalize state name
                if customer_state and customer_state != 'Unknown':
                    customer_state = customer_state.title()
                
                # Create full address
                full_address = f"{customer_city}, {customer_state}, Pincode: {customer_pincode}" if customer_city else f"{customer_state}, Pincode: {customer_pincode}"
                
                # Create record
                record = (
                    ppo,
                    dob_str,
                    dob_str,
                    age,
                    age_category,
                    f"{psa} - Punjab & Sind Bank",
                    customer_city if customer_city else 'Unknown',
                    branch_pincode,
                    f"Punjab & Sind Bank, {branch_address}, Pincode: {branch_pincode}"[:200],
                    branch_pincode,
                    full_address[:200],
                    customer_pincode,
                    customer_state,
                    customer_city if customer_city else 'Unknown'
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
        print("Usage: python3 process_psb.py <excel_file>")
        sys.exit(1)
    
    processor = PSBProcessor()
    processor.process_file(sys.argv[1])
