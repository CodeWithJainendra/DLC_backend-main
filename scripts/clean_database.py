#!/usr/bin/env python3

"""
Script to clean and filter data in the pensioner_bank_master table
"""

import sqlite3
import os
from datetime import datetime

def clean_database(db_path):
    """Clean and filter data in the database"""
    print("🧹 DATABASE CLEANING PROCESS")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Cleaning started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get initial record count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        initial_count = cursor.fetchone()[0]
        print(f"📊 Initial record count: {initial_count:,}")
        
        # 1. Remove records with invalid pin codes
        print(f"\n🗑️  REMOVING RECORDS WITH INVALID PIN CODES...")
        invalid_pin_patterns = ['111111', '999999', '000000', '888888', '777777']
        removed_invalid_pins = 0
        
        for pattern in invalid_pin_patterns:
            cursor.execute("""
                DELETE FROM pensioner_bank_master 
                WHERE pensioner_postcode = ? OR branch_postcode = ?
            """, (pattern, pattern))
            count = cursor.rowcount
            removed_invalid_pins += count
            if count > 0:
                print(f"   Removed {count:,} records with pin code {pattern}")
        
        conn.commit()
        print(f"   Total records removed for invalid pins: {removed_invalid_pins:,}")
        
        # 2. Remove records with empty/null PPO numbers (if they're not essential)
        print(f"\n🗑️  REMOVING RECORDS WITH EMPTY PPO NUMBERS...")
        cursor.execute("""
            DELETE FROM pensioner_bank_master 
            WHERE (ppo_number IS NULL OR ppo_number = '' OR ppo_number = 'NA' OR ppo_number = 'null')
            AND data_source LIKE 'DOPPW%'
        """)
        removed_empty_ppo = cursor.rowcount
        conn.commit()
        print(f"   Removed {removed_empty_ppo:,} records with empty PPO numbers (DOPPW data only)")
        
        # 3. Standardize state names
        print(f"\n🔤 STANDARDIZING STATE NAMES...")
        state_corrections = {
            'NCT OF DELHI': 'DELHI',
            'NCTOFDELHI': 'DELHI',
            'GUJRAT': 'GUJARAT',
            'ANDRA PRADESH': 'ANDHRA PRADESH',
            'CTI GUINDY': 'TAMIL NADU',  # This looks like a branch name, not a state
        }
        
        corrected_states = 0
        for old_state, new_state in state_corrections.items():
            cursor.execute("""
                UPDATE pensioner_bank_master 
                SET state = ? 
                WHERE state = ?
            """, (new_state, old_state))
            count = cursor.rowcount
            corrected_states += count
            if count > 0:
                print(f"   Corrected {count:,} records from '{old_state}' to '{new_state}'")
        
        conn.commit()
        print(f"   Total state name corrections: {corrected_states:,}")
        
        # 4. Remove records with invalid birth years
        print(f"\n🎂 CLEANING INVALID BIRTH YEARS...")
        cursor.execute("""
            DELETE FROM pensioner_bank_master 
            WHERE birth_year IS NOT NULL AND birth_year != '' 
            AND (CAST(birth_year AS INTEGER) < 1900 OR CAST(birth_year AS INTEGER) > 2020)
        """)
        removed_invalid_years = cursor.rowcount
        conn.commit()
        print(f"   Removed {removed_invalid_years:,} records with invalid birth years")
        
        # 5. Remove records with completely empty essential fields
        print(f"\n🗑️  REMOVING RECORDS WITH MULTIPLE EMPTY FIELDS...")
        cursor.execute("""
            DELETE FROM pensioner_bank_master 
            WHERE (ppo_number IS NULL OR ppo_number = '') 
            AND (state IS NULL OR state = '') 
            AND (pensioner_postcode IS NULL OR pensioner_postcode = '')
            AND data_source NOT LIKE 'DOPPW%'
        """)
        removed_empty_records = cursor.rowcount
        conn.commit()
        print(f"   Removed {removed_empty_records:,} records with multiple empty fields")
        
        # Get final record count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        final_count = cursor.fetchone()[0]
        records_removed = initial_count - final_count
        
        print(f"\n📊 FINAL RESULTS:")
        print("-" * 40)
        print(f"   Initial records: {initial_count:,}")
        print(f"   Records removed: {records_removed:,}")
        print(f"   Final records: {final_count:,}")
        print(f"   Reduction: {((records_removed/initial_count)*100):.2f}%")
        
        # Show final data source distribution
        print(f"\n📋 FINAL DATA SOURCE DISTRIBUTION:")
        print("-" * 40)
        cursor.execute("""
            SELECT data_source, COUNT(*) as count 
            FROM pensioner_bank_master 
            GROUP BY data_source 
            ORDER BY count DESC
        """)
        sources = cursor.fetchall()
        for source, count in sources:
            percentage = (count / final_count) * 100
            print(f"   {source}: {count:,} ({percentage:.1f}%)")
        
        # Show final state distribution (top 10)
        print(f"\n🗾 FINAL TOP 10 STATES:")
        print("-" * 40)
        cursor.execute("""
            SELECT state, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE state IS NOT NULL AND state != ''
            GROUP BY state 
            ORDER BY count DESC 
            LIMIT 10
        """)
        states = cursor.fetchall()
        for state, count in states:
            percentage = (count / final_count) * 100
            print(f"   {state}: {count:,} ({percentage:.1f}%)")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ Database cleaning completed successfully!")
        print(f"🏁 Cleaning finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during database cleaning: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    clean_database(db_path)

if __name__ == "__main__":
    main()