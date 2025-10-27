#!/usr/bin/env python3

"""
Script to import manually provided pensioner data into pensioner_bank_master table
"""

import sqlite3
import os
from datetime import datetime

def import_manual_pensioners(db_path):
    """Import manually provided pensioner data into pensioner_bank_master table"""
    print("📥 MANUAL PENSIONER DATA IMPORT")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Import started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get initial count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        initial_count = cursor.fetchone()[0]
        print(f"📊 Initial record count: {initial_count:,}")
        
        # Manual pensioner data
        pensioners = [
            # (ppo_number, dob, psa, pda, bank_name, branch_name, city, state, pincode)
            ('108532RPR', '6/1/1949', 'GADAG TREASURY OFFICE', 'UNION BANK OF INDIA', 'UNION BANK OF INDIA', 'GADAG-MAIN', 'GADAG', 'KARNATAKA', 'NA'),
            ('1119KCS33275', '5/11/1959', 'BENGALURU TREASURY OFFICE', 'UNION BANK OF INDIA', 'UNION BANK OF INDIA', 'BANGALORE-CITY', 'BENGALURU', 'KARNATAKA', '560,050'),
            ('1416KCS53003', 'NA', 'MYSORE TREASURY OFFICE', 'UNION BANK OF INDIA', 'UNION BANK OF INDIA', 'MYSORE-SIDDHARTHA LAYOUT', 'MYSORE', 'KARNATAKA', 'NA'),
            ('1412KCS08448', '8/14/1963', 'BANGALORE TREASURY OFFICE', 'UNION BANK OF INDIA', 'UNION BANK OF INDIA', 'BASAVESHWARNAGAR MAIN, BENGALORE', 'BANGALORE', 'KARNATAKA', '560,079'),
            ('145275RPR', '7/13/1939', 'BELAGAVI TREASURY OFFICE', 'UNION BANK OF INDIA', 'UNION BANK OF INDIA', 'NIPPANI', 'BELAGAVI', 'KARNATAKA', 'NA')
        ]
        
        imported_count = 0
        skipped_count = 0
        
        print(f"\n💾 Importing {len(pensioners)} pensioner records...")
        
        for pensioner in pensioners:
            try:
                ppo_number, dob, psa, pda, bank_name, branch_name, city, state, pincode = pensioner
                
                # Clean pincode (remove commas)
                if pincode != 'NA':
                    pincode = pincode.replace(',', '')
                
                # Insert into pensioner_bank_master table
                cursor.execute("""
                    INSERT INTO pensioner_bank_master (
                        ppo_number, pensioner_dob, PSA, PDA, 
                        bank_name, branch_name, pensioner_city, 
                        state, pensioner_postcode, data_source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    ppo_number,      # ppo_number
                    dob,             # pensioner_dob
                    psa,             # PSA
                    pda,             # PDA
                    bank_name,       # bank_name
                    branch_name,     # branch_name
                    city,            # pensioner_city
                    state,           # state
                    pincode,         # pensioner_postcode
                    'MANUAL_IMPORT'  # data_source
                ))
                
                imported_count += 1
                print(f"   ✅ Imported: {ppo_number}")
                
            except Exception as e:
                print(f"   ❌ Error importing {pensioner[0]}: {e}")
                skipped_count += 1
                continue
        
        # Commit changes
        conn.commit()
        
        # Get final count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        final_count = cursor.fetchone()[0]
        
        print(f"\n📊 IMPORT RESULTS:")
        print("-" * 40)
        print(f"   Initial records: {initial_count:,}")
        print(f"   Successfully imported: {imported_count:,} records")
        print(f"   Skipped due to errors: {skipped_count:,} records")
        print(f"   Final record count: {final_count:,}")
        print(f"   Net increase: {final_count - initial_count:,} records")
        
        # Show data source distribution after import
        print(f"\n📋 DATA SOURCE DISTRIBUTION AFTER IMPORT:")
        print("-" * 40)
        cursor.execute("""
            SELECT data_source, COUNT(*) as count 
            FROM pensioner_bank_master 
            GROUP BY data_source 
            ORDER BY count DESC
        """)
        sources = cursor.fetchall()
        for source, count in sources:
            print(f"   {source}: {count:,} records")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ Manual pensioner data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during manual pensioner data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Check if file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Import the data
    import_manual_pensioners(db_path)

if __name__ == "__main__":
    main()