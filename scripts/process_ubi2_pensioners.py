#!/usr/bin/env python3
"""
Process Union Bank of India 2 Pensioner Data with Validation
Multi-state data with proper validation
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime
import re

def validate_date(date_str):
    """Validate date - return True if valid, False otherwise"""
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
    """Validate pincode - return True if valid, False otherwise"""
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

def process_ubi2_data(file_path):
    """Process Union Bank of India 2 pensioner data"""
    
    print(f"📂 Processing UBI 2 Pensioner file: {file_path}")
    print("=" * 80)
    
    try:
        # Read Excel file
        df = pd.read_excel(file_path)
        
        # Remove first row if it's empty/invalid
        if df.iloc[0].isna().all() or df.iloc[0]['PPO No.'] != df.iloc[0]['PPO No.']:
            df = df.iloc[1:].reset_index(drop=True)
        
        print(f"📄 Total records in file: {len(df)}")
        print(f"📋 Columns: {list(df.columns)}")
        
        # Show sample
        print("\n📊 Sample data:")
        print(df.head(3).to_string())
        
        # Validation counters
        total_records = len(df)
        valid_records = 0
        invalid_dob = 0
        invalid_pincode = 0
        invalid_ppo = 0
        invalid_psa = 0
        
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
            
            # Validate Pensioner Pincode (use this instead of branch pincode)
            pincode = row.get('Pensioner Pincode', '')
            if not validate_pincode(pincode):
                is_valid = False
                invalid_pincode += 1
                reasons.append("Invalid Pincode")
            
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
        print(f"   - Invalid Pincode: {invalid_pincode}")
        print(f"   - Invalid PPO: {invalid_ppo}")
        print(f"   - Invalid PSA: {invalid_psa}")
        
        if valid_records == 0:
            print("\n❌ No valid records to insert!")
            return
        
        # Create DataFrame with valid records
        valid_df = pd.DataFrame(valid_data)
        
        # Connect to database
        db_path = "../DLC_Database.db"
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Create table for UBI 2 pensioners
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ubi2_pensioners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ppo_no TEXT NOT NULL,
                date_of_birth TEXT,
                psa TEXT,
                pda TEXT,
                bank_name TEXT,
                branch_name TEXT,
                branch_pincode TEXT,
                pensioner_city TEXT,
                state TEXT,
                pensioner_pincode TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Clear existing data
        cursor.execute("DELETE FROM ubi2_pensioners")
        
        # Insert valid records
        inserted = 0
        for idx, row in valid_df.iterrows():
            try:
                cursor.execute("""
                    INSERT INTO ubi2_pensioners 
                    (ppo_no, date_of_birth, psa, pda, bank_name, branch_name, 
                     branch_pincode, pensioner_city, state, pensioner_pincode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(row.get('PPO No.', '')),
                    str(row.get('Date of Birth', '')),
                    str(row.get('PSA', '')),
                    str(row.get('PDA', '')),
                    str(row.get('Name of Bank disbursing pension', 'CENTRAL PENSION PROCESSING CENT')),
                    str(row.get('Name of Bank Branch of pesioner', '')),
                    str(row.get('Pincode', '')),
                    str(row.get('Pensioner City', '')),
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
            FROM ubi2_pensioners
            GROUP BY state
            ORDER BY count DESC
        """)
        
        print("\n📍 STATE-WISE DISTRIBUTION:")
        for state, count in cursor.fetchall():
            print(f"   {state}: {count:,}")
        
        # PSA-wise summary
        cursor.execute("""
            SELECT psa, COUNT(*) as count
            FROM ubi2_pensioners
            GROUP BY psa
            ORDER BY count DESC
            LIMIT 10
        """)
        
        print("\n📋 TOP 10 PSA TYPES:")
        for psa, count in cursor.fetchall():
            print(f"   {psa}: {count:,}")
        
        # PDA-wise summary
        cursor.execute("""
            SELECT pda, COUNT(*) as count
            FROM ubi2_pensioners
            GROUP BY pda
            ORDER BY count DESC
            LIMIT 10
        """)
        
        print("\n🏢 TOP 10 PDA OFFICES:")
        for pda, count in cursor.fetchall():
            print(f"   {pda}: {count:,}")
        
        # City-wise summary
        cursor.execute("""
            SELECT pensioner_city, COUNT(*) as count
            FROM ubi2_pensioners
            GROUP BY pensioner_city
            ORDER BY count DESC
            LIMIT 10
        """)
        
        print("\n🏙️  TOP 10 CITIES:")
        for city, count in cursor.fetchall():
            print(f"   {city}: {count:,}")
        
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
        file_path = "../EXCEL_DATA/Excel Files/Data from UBI 2.xlsx"
    
    process_ubi2_data(file_path)
