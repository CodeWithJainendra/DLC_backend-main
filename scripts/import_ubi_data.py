#!/usr/bin/env python3

"""
Script to import UBI data from all Excel files (UBI 1, 2, and 3) into pensioner_bank_master table
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime

def import_ubi_data(db_path):
    """Import UBI data from all Excel files into pensioner_bank_master table"""
    print("📥 UBI DATA IMPORT FROM ALL EXCEL FILES")
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
        
        # UBI Excel files
        ubi_files = [
            ("/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx", "UBI_FILE_1"),
            ("/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx", "UBI_FILE_2"),
            ("/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx", "UBI_FILE_3")
        ]
        
        total_imported = 0
        total_skipped = 0
        
        for file_path, data_source in ubi_files:
            print(f"\n📄 Processing: {os.path.basename(file_path)}")
            
            if not os.path.exists(file_path):
                print(f"   ❌ File not found: {file_path}")
                continue
            
            try:
                # Read Excel file
                df = pd.read_excel(file_path)
                print(f"   ✅ Successfully read {len(df)} rows from Excel file")
                
                # Display column names for verification
                print(f"   📋 Columns: {list(df.columns)}")
                
                imported_count = 0
                skipped_count = 0
                
                # Process each row
                for index, row in df.iterrows():
                    try:
                        # Extract data from row (adjust column names as needed)
                        # Common column mappings - you may need to adjust these based on actual column names
                        ppo_number = str(row.get('PPO Number', row.get('PPO No', row.get('PPO_NO', ''))))
                        bank_name = str(row.get('Bank Name', row.get('Bank', row.get('BANK_NAME', 'UNITED BANK OF INDIA'))))
                        branch_name = str(row.get('Branch Name', row.get('Branch', row.get('BRANCH_NAME', ''))))
                        branch_postcode = str(row.get('Branch Postcode', row.get('Branch Pin', row.get('BRANCH_PINCODE', ''))))
                        pensioner_city = str(row.get('Pensioner City', row.get('City', row.get('PENSIONER_CITY', ''))))
                        state = str(row.get('State', row.get('STATE', '')))
                        pensioner_postcode = str(row.get('Pensioner Postcode', row.get('Pensioner Pin', row.get('PENSIONER_PINCODE', ''))))
                        psa = str(row.get('PSA', row.get('Category', row.get('CATEGORY', ''))))
                        pda = str(row.get('PDA', row.get('PDA', '')))
                        dob = str(row.get('Date of Birth', row.get('DOB', row.get('DATE_OF_BIRTH', ''))))
                        
                        # Clean data
                        if branch_postcode != 'nan':
                            branch_postcode = str(branch_postcode).replace(',', '')
                        else:
                            branch_postcode = ''
                            
                        if pensioner_postcode != 'nan':
                            pensioner_postcode = str(pensioner_postcode).replace(',', '')
                        else:
                            pensioner_postcode = ''
                        
                        # Handle state name corrections
                        if state == 'GUJRAT':
                            state = 'GUJARAT'
                        
                        # Insert into pensioner_bank_master table
                        cursor.execute("""
                            INSERT INTO pensioner_bank_master (
                                ppo_number, bank_name, branch_name, branch_postcode,
                                pensioner_city, state, pensioner_postcode, PSA, PDA,
                                pensioner_dob, data_source
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            ppo_number if ppo_number != 'nan' else f"UBI{index+1:06d}",
                            bank_name if bank_name != 'nan' else 'UNITED BANK OF INDIA',
                            branch_name if branch_name != 'nan' else '',
                            branch_postcode,
                            pensioner_city if pensioner_city != 'nan' else '',
                            state if state != 'nan' else '',
                            pensioner_postcode,
                            psa if psa != 'nan' else '',
                            pda if pda != 'nan' else '',
                            dob if dob != 'nan' else '',
                            data_source
                        ))
                        
                        imported_count += 1
                        
                        # Print progress every 1000 rows
                        if (index + 1) % 1000 == 0:
                            print(f"   Processed {index + 1} rows...")
                            
                    except Exception as e:
                        print(f"   ❌ Error processing row {index + 1}: {e}")
                        skipped_count += 1
                        continue
                
                # Commit changes for this file
                conn.commit()
                
                print(f"   📊 Results for {os.path.basename(file_path)}:")
                print(f"      Successfully imported: {imported_count:,} records")
                print(f"      Skipped due to errors: {skipped_count:,} records")
                
                total_imported += imported_count
                total_skipped += skipped_count
                
            except Exception as e:
                print(f"   ❌ Error reading {file_path}: {e}")
                continue
        
        # Get final count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        final_count = cursor.fetchone()[0]
        
        print(f"\n📊 OVERALL IMPORT RESULTS:")
        print("-" * 40)
        print(f"   Initial records: {initial_count:,}")
        print(f"   Successfully imported: {total_imported:,} records")
        print(f"   Skipped due to errors: {total_skipped:,} records")
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
        print("✅ UBI data import from all Excel files completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during UBI data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Import the data
    import_ubi_data(db_path)

if __name__ == "__main__":
    main()