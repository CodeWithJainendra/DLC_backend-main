#!/usr/bin/env python3
"""
Process Union Bank of India Pensioner Data with Validation
Only insert valid records - skip invalid DOB, invalid Pincode, etc.
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime
import re

def validate_date(date_str):
    """Validate date - return True if valid, False otherwise"""
    if pd.isna(date_str) or str(date_str).strip().upper() in ['NA', 'N/A', '', 'NAN', 'NAT']:
        return False
    
    try:
        # Try parsing the date
        if isinstance(date_str, str):
            # Try different date formats
            for fmt in ['%m/%d/%y', '%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%d-%m-%Y']:
                try:
                    parsed_date = datetime.strptime(date_str, fmt)
                    # Check if year is reasonable (between 1930 and 2010)
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
    
    # Check for invalid values
    if pincode_str in ['NA', 'N/A', '', 'NAN', 'NONE', '0']:
        return False
    
    # Remove any non-digit characters
    pincode_digits = re.sub(r'\D', '', pincode_str)
    
    # Check if it's a valid 6-digit pincode
    if len(pincode_digits) != 6:
        return False
    
    # Check for invalid patterns
    if pincode_digits in ['111111', '999999', '000000', '123456']:
        return False
    
    # Check if all digits are same
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
    if pd.isna(psa) or str(psa).strip().upper() in ['NA', 'N/A', '', 'NAN']:
        return False
    return True

def process_ubi_data(file_path):
    """Process Union Bank of India pensioner data"""
    
    print(f"📂 Processing UBI Pensioner file: {file_path}")
    print("=" * 80)
    
    try:
        # Read Excel file - skip first row (header row)
        df = pd.read_excel(file_path, skiprows=1)
        
        # Rename columns properly
        column_mapping = {
            'S. No': 'S_No',
            'PPO No.': 'PPO_No',
            'Date of Birth': 'Date_of_Birth',
            'PSA': 'PSA',
            'PDA': 'PDA',
            'Name of Bank disbursing pension': 'Bank_Name',
            'Name of Bank Branch of pesioner': 'Branch_Name',
            'Unnamed: 7': 'City',
            'Unnamed: 8': 'State',
            'Unnamed: 9': 'Pincode'
        }
        df = df.rename(columns=column_mapping)
        
        # Drop the second header row (City, State, Pincode row)
        df = df[df['S_No'].notna() & (df['S_No'] != 'City')]
        
        print(f"📄 Total records in file: {len(df)}")
        print(f"📋 Columns: {list(df.columns)}")
        
        # Show first few rows
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
            ppo = row.get('PPO_No', '')
            if not validate_ppo(ppo):
                is_valid = False
                invalid_ppo += 1
                reasons.append("Invalid PPO")
            
            # Validate DOB
            dob = row.get('Date_of_Birth', '')
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
            
            # Validate Pincode
            pincode = row.get('Pincode', '')
            if not validate_pincode(pincode):
                is_valid = False
                invalid_pincode += 1
                reasons.append("Invalid Pincode")
            
            if is_valid:
                valid_records += 1
                valid_data.append(row)
            else:
                if idx < 10:  # Show first 10 invalid records
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
        
        # Create table for UBI pensioners
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS ubi_pensioners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ppo_no TEXT NOT NULL,
                date_of_birth TEXT,
                psa TEXT,
                pda TEXT,
                bank_name TEXT,
                branch_name TEXT,
                city TEXT,
                state TEXT,
                pincode TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Clear existing data
        cursor.execute("DELETE FROM ubi_pensioners")
        
        # Insert valid records
        inserted = 0
        for idx, row in valid_df.iterrows():
            try:
                cursor.execute("""
                    INSERT INTO ubi_pensioners 
                    (ppo_no, date_of_birth, psa, pda, bank_name, branch_name, city, state, pincode)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    str(row.get('PPO_No', '')),
                    str(row.get('Date_of_Birth', '')),
                    str(row.get('PSA', '')),
                    str(row.get('PDA', '')),
                    str(row.get('Bank_Name', 'UNION BANK OF INDIA')),
                    str(row.get('Branch_Name', '')),
                    str(row.get('City', '')),
                    str(row.get('State', '')),
                    str(row.get('Pincode', ''))
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
            FROM ubi_pensioners
            GROUP BY state
            ORDER BY count DESC
        """)
        
        print("\n📍 STATE-WISE DISTRIBUTION:")
        for state, count in cursor.fetchall():
            print(f"   {state}: {count:,}")
        
        # PSA-wise summary
        cursor.execute("""
            SELECT psa, COUNT(*) as count
            FROM ubi_pensioners
            GROUP BY psa
            ORDER BY count DESC
            LIMIT 10
        """)
        
        print("\n📋 TOP 10 PSA OFFICES:")
        for psa, count in cursor.fetchall():
            print(f"   {psa}: {count:,}")
        
        # City-wise summary
        cursor.execute("""
            SELECT city, COUNT(*) as count
            FROM ubi_pensioners
            GROUP BY city
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
        file_path = "../EXCEL_DATA/Excel Files/Data from UBI 1.xlsx"
    
    process_ubi_data(file_path)
