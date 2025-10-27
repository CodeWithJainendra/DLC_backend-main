#!/usr/bin/env python3
"""
Process Union Bank of India 3 Pensioner Data
Madhya Pradesh focused with multi-state coverage
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime
import re

def validate_date(date_str):
    """Validate date"""
    if pd.isna(date_str) or str(date_str).strip().upper() in ['NA', 'N/A', '', 'NAN', 'NAT', 'NULL']:
        return False
    
    try:
        if isinstance(date_str, str):
            for fmt in ['%m/%d/%y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y']:
                try:
                    parsed_date = datetime.strptime(date_str, fmt)
                    if 1930 <= parsed_date.year <= 2010:
                        return True
                except:
                    continue
        elif isinstance(date_str, datetime):
            if 1930 <= date_str.year <= 2010:
                return True
    except:
        pass
    
    return False

def validate_pincode(pincode):
    """Validate pincode"""
    if pd.isna(pincode):
        return False
    
    pincode_str = str(pincode).strip().upper()
    
    if pincode_str in ['NA', 'N/A', '', 'NAN', 'NONE', '0', 'NULL']:
        return False
    
    pincode_digits = re.sub(r'\D', '', pincode_str)
    
    if len(pincode_digits) != 6:
        return False
    
    if pincode_digits in ['111111', '999999', '000000', '123456']:
        return False
    
    if len(set(pincode_digits)) == 1:
        return False
    
    return True

def validate_ppo(ppo):
    """Validate PPO number"""
    if pd.isna(ppo) or str(ppo).strip() == '':
        return False
    return True

def validate_psa(psa):
    """Validate PSA name"""
    if pd.isna(psa) or str(psa).strip().upper() in ['NA', 'N/A', '', 'NAN', 'NULL']:
        return False
    return True

def validate_state(state):
    """Validate state name"""
    if pd.isna(state) or str(state).strip().upper() in ['NA', 'N/A', '', 'NAN', 'NULL']:
        return False
    return True

def process_ubi3_data(file_path):
    """Process UBI 3 pensioner data"""
    
    print(f"📂 Processing UBI 3 Pensioner file: {file_path}")
    print("=" * 80)
    
    try:
        # Read Excel file
        df = pd.read_excel(file_path)
        
        # Remove first row if it's empty
        if df.iloc[0].isna().all():
            df = df.iloc[1:].reset_index(drop=True)
        
        print(f"📄 Total records in file: {len(df)}")
        print(f"📋 Columns: {list(df.columns)}")
        
        # Validation counters
        total_records = len(df)
        valid_records = 0
        invalid_dob = 0
        invalid_pincode = 0
        invalid_ppo = 0
        invalid_psa = 0
        invalid_state = 0
        
        valid_data = []
        
        print("\n" + "=" * 80)
        print("🔍 VALIDATING RECORDS...")
        print("=" * 80)
        
        for idx, row in df.iterrows():
            is_valid = True
            reasons = []
            
            # Validate PPO
            ppo = row.get('PPO No.', '')
            if not validate_ppo(ppo):
                is_valid = False
                invalid_ppo += 1
                reasons.append("Invalid PPO")
            
            # Validate DOB
            dob = row.get('Date of Birth', '')
            if not validate_date(dob):
                is_valid = False
                invalid_dob += 1
                reasons.append("Invalid DOB")
            
            # Validate PSA
            psa = row.get('PSA', '')
            if not validate_psa(psa):
                is_valid = False
                invalid_psa += 1
                reasons.append("Invalid PSA")
            
            # Validate State
            state = row.get('State', '')
            if not validate_state(state):
                is_valid = False
                invalid_state += 1
                reasons.append("Invalid State")
            
            # Validate Pensioner Pincode (optional - many records don't have it)
            pincode = row.get('Pensioner Pincode', '')
            # Don't reject if pincode is missing, just note it
            has_valid_pincode = validate_pincode(pincode)
            if not has_valid_pincode:
                invalid_pincode += 1
            
            if is_valid:
                valid_records += 1
                valid_data.append(row)
            else:
                if idx < 10:
                    print(f"   ⚠️  Row {idx+1}: {', '.join(reasons)} - PPO: {ppo}")
        
        print("\n" + "=" * 80)
        print("📊 VALIDATION SUMMARY")
        print("=" * 80)
        print(f"✅ Valid Records: {valid_records} ({valid_records/total_records*100:.2f}%)")
        print(f"❌ Invalid Records: {total_records - valid_records} ({(total_records-valid_records)/total_records*100:.2f}%)")
        print(f"\nInvalid Reasons:")
        print(f"   - Invalid DOB: {invalid_dob}")
        print(f"   - Invalid State: {invalid_state}")
        print(f"   - Invalid PPO: {invalid_ppo}")
        print(f"   - Invalid PSA: {invalid_psa}")
        print(f"   - Missing/Invalid Pincode: {invalid_pincode} (not rejected)")
        
        if valid_records == 0:
            print("\n❌ No valid records to insert!")
            return
        
        # Create DataFrame with valid records
        valid_df = pd.DataFrame(valid_data)
        
        # Connect to database
        db_path = "../DLC_Database.db"
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ubi3_pensioners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ppo_no TEXT NOT NULL,
                date_of_birth TEXT,
                psa TEXT,
                pda TEXT,
                bank_name TEXT,
                branch_name TEXT,
                branch_pincode TEXT,
                pensioners_city TEXT,
                state TEXT,
                pensioner_pincode TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Clear existing data
        cursor.execute("DELETE FROM ubi3_pensioners")
        
        # Insert valid records
        inserted = 0
        for idx, row in valid_df.iterrows():
            try:
                cursor.execute("""
                    INSERT INTO ubi3_pensioners 
                    (ppo_no, date_of_birth, psa, pda, bank_name, branch_name, 
                     branch_pincode, pensioners_city, state, pensioner_pincode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(row.get('PPO No.', '')),
                    str(row.get('Date of Birth', '')),
                    str(row.get('PSA', '')),
                    str(row.get('PDA', '')),
                    str(row.get('Name of Bank disbursing pension', '')),
                    str(row.get('Name of Bank Branch of pesioner', '')),
                    str(row.get('Branch Pincode', '')),
                    str(row.get('Pensioners City', '')),
                    str(row.get('State', '')),
                    str(row.get('Pensioner Pincode', ''))
                ))
                inserted += 1
            except Exception as e:
                print(f"   ⚠️  Error inserting row {idx}: {e}")
        
        conn.commit()
        
        # Show summary statistics
        print("\n" + "=" * 80)
        print("📊 DATABASE STATISTICS")
        print("=" * 80)
        
        # State-wise summary
        cursor.execute("""
            SELECT state, COUNT(*) as count
            FROM ubi3_pensioners
            WHERE state != 'nan'
            GROUP BY state
            ORDER BY count DESC
            LIMIT 15
        """)
        
        print("\n📍 TOP 15 STATES:")
        for state, count in cursor.fetchall():
            print(f"   {state}: {count:,}")
        
        # PSA-wise summary
        cursor.execute("""
            SELECT psa, COUNT(*) as count
            FROM ubi3_pensioners
            GROUP BY psa
            ORDER BY count DESC
            LIMIT 10
        """)
        
        print("\n📋 TOP 10 PSA TYPES:")
        for psa, count in cursor.fetchall():
            print(f"   {psa}: {count:,}")
        
        conn.close()
        
        print("\n" + "=" * 80)
        print("✅ Processing Complete!")
        print(f"   Total Records: {total_records:,}")
        print(f"   Valid Records Inserted: {inserted:,}")
        print(f"   Invalid Records Skipped: {total_records - inserted:,}")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ Error processing file: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = "../EXCEL_DATA/Excel Files/Data from UBI 3.xlsx"
    
    process_ubi3_data(file_path)
