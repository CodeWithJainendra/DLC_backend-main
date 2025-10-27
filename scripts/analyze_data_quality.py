#!/usr/bin/env python3

"""
Script to analyze data quality and identify issues in the pensioner_bank_master table
"""

import sqlite3
import os
from datetime import datetime

def analyze_data_quality(db_path):
    """Analyze data quality issues in the database"""
    print("🔍 DATA QUALITY ANALYSIS")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Analysis time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get total record count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        total_records = cursor.fetchone()[0]
        print(f"📈 Total records: {total_records:,}")
        
        # Check for invalid pin codes (111111, 999999, etc.)
        print(f"\n📍 INVALID PIN CODE ANALYSIS:")
        print("-" * 40)
        
        invalid_pin_patterns = ['111111', '999999', '000000', '888888', '777777']
        total_invalid_pins = 0
        
        for pattern in invalid_pin_patterns:
            cursor.execute("""
                SELECT COUNT(*) FROM pensioner_bank_master 
                WHERE pensioner_postcode = ? OR branch_postcode = ?
            """, (pattern, pattern))
            count = cursor.fetchone()[0]
            if count > 0:
                print(f"   {pattern}: {count:,} records")
                total_invalid_pins += count
        
        print(f"   Total records with invalid pin codes: {total_invalid_pins:,} ({(total_invalid_pins/total_records)*100:.2f}%)")
        
        # Check for empty or null important fields
        print(f"\nEmptyEntries ANALYSIS:")
        print("-" * 40)
        
        fields_to_check = ['ppo_number', 'state', 'pensioner_postcode']
        for field in fields_to_check:
            cursor.execute(f"""
                SELECT COUNT(*) FROM pensioner_bank_master 
                WHERE {field} IS NULL OR {field} = '' OR {field} = 'NA' OR {field} = 'null'
            """)
            count = cursor.fetchone()[0]
            print(f"   {field}: {count:,} empty/null records ({(count/total_records)*100:.2f}%)")
        
        # Check state name variations
        print(f"\n🗾 STATE NAME ANALYSIS:")
        print("-" * 40)
        
        cursor.execute("""
            SELECT state, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE state IS NOT NULL AND state != ''
            GROUP BY state 
            ORDER BY count DESC 
            LIMIT 20
        """)
        states = cursor.fetchall()
        print("   Top 20 states by record count:")
        for state, count in states[:20]:
            print(f"      {state}: {count:,}")
        
        # Check for duplicate records
        print(f"\n🔄 DUPLICATE RECORD ANALYSIS:")
        print("-" * 40)
        
        cursor.execute("""
            SELECT ppo_number, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE ppo_number IS NOT NULL AND ppo_number != ''
            GROUP BY ppo_number 
            HAVING COUNT(*) > 1
        """)
        duplicates = cursor.fetchall()
        print(f"   Duplicate PPO numbers: {len(duplicates):,}")
        
        # Check age/birth year data
        print(f"\n🎂 AGE/BIRTH YEAR ANALYSIS:")
        print("-" * 40)
        
        cursor.execute("""
            SELECT birth_year, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE birth_year IS NOT NULL AND birth_year != ''
            GROUP BY birth_year 
            ORDER BY birth_year 
            LIMIT 10
        """)
        birth_years = cursor.fetchall()
        print("   Sample birth years:")
        for year, count in birth_years:
            print(f"      {year}: {count:,}")
        
        # Check for very old or very young birth years
        cursor.execute("""
            SELECT COUNT(*) FROM pensioner_bank_master 
            WHERE birth_year IS NOT NULL AND birth_year != '' 
            AND (CAST(birth_year AS INTEGER) < 1900 OR CAST(birth_year AS INTEGER) > 2020)
        """)
        invalid_years = cursor.fetchone()[0]
        print(f"   Records with invalid birth years (<1900 or >2020): {invalid_years:,}")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ Data quality analysis completed!")
        
    except Exception as e:
        print(f"❌ Error during data quality analysis: {e}")

def main():
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    analyze_data_quality(db_path)

if __name__ == "__main__":
    main()