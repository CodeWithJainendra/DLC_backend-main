#!/usr/bin/env python3

"""
Script to import DLC data from Excel file into pensioner_bank_master table
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime

def import_dlc_data_to_pensioner_master(db_path, excel_file_path):
    """Import DLC data from Excel file into pensioner_bank_master table"""
    print("📥 DLC DATA IMPORT TO PENSIONER MASTER TABLE")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Excel file: {excel_file_path}")
    print(f"Import started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        # Connect to database
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Read Excel file
        print("📄 Reading Excel file...")
        df = pd.read_excel(excel_file_path)
        print(f"✅ Successfully read {len(df)} rows from Excel file")
        
        # Display column names for verification
        print(f"\n📋 Excel columns: {list(df.columns)}")
        
        # Map Excel columns to database columns
        # Based on your data sample:
        # GCODE	ESCROLL_CAT	GID	PENSION_TYPE	BRANCH_CODE	BRANCH_NAME	BRANCH_PIN	BRANCH_STATE	BIRTH_YEAR	SUBMITTED_STATUS	WAIVER_UPTO	SUBMISSION_MODE	VERIFICATION_TYPE	CERTIFICATE_SUBMISSION_DATE	PENSIONER PINCODE	PENSIONER DISTNAME	PENSIONER STATENAME
        
        # We'll map to pensioner_bank_master table fields:
        # bank_name, branch_name, branch_postcode, pensioner_city, state, pensioner_postcode, PDA, PSA, ppo_number
        
        # For DLC data, we'll use:
        # bank_name = 'SBI' (assuming all data is for SBI)
        # branch_name = BRANCH_NAME
        # branch_postcode = BRANCH_PIN
        # pensioner_city = PENSIONER DISTNAME
        # state = PENSIONER STATENAME (corrected for standardization)
        # pensioner_postcode = PENSIONER PINCODE
        # PSA = GCODE (RAILWAY/CIVIL/etc.)
        # ppo_number = We'll generate a unique identifier since it's not in the data
        
        imported_count = 0
        skipped_count = 0
        
        print(f"\n💾 Importing data...")
        
        for index, row in df.iterrows():
            try:
                # Extract data from row
                gcode = row.get('GCODE', '')
                branch_name = row.get('BRANCH_NAME', '')
                branch_pin = row.get('BRANCH_PIN', '')
                pensioner_distname = row.get('PENSIONER DISTNAME', '')
                
                # Handle state name corrections
                pensioner_statename = row.get('PENSIONER STATENAME', '')
                if pensioner_statename == 'GUJRAT':
                    pensioner_statename = 'GUJARAT'
                
                pensioner_pincode = row.get('PENSIONER PINCODE', '')
                submitted_status = row.get('SUBMITTED_STATUS', '')
                
                # Generate a unique PPO-like identifier
                ppo_number = f"DLC{index+1:06d}"
                
                # Insert into pensioner_bank_master table
                cursor.execute("""
                    INSERT INTO pensioner_bank_master (
                        bank_name, branch_name, branch_postcode, 
                        pensioner_city, state, pensioner_postcode, 
                        PSA, ppo_number, data_source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    'SBI',  # bank_name
                    branch_name,  # branch_name
                    str(branch_pin).replace(',', '') if pd.notna(branch_pin) else '',  # branch_postcode
                    pensioner_distname,  # pensioner_city
                    pensioner_statename,  # state
                    str(pensioner_pincode).replace(',', '') if pd.notna(pensioner_pincode) else '',  # pensioner_postcode
                    gcode,  # PSA (category)
                    ppo_number,  # ppo_number
                    'DLC_IMPORT'  # data_source
                ))
                
                imported_count += 1
                
                # Print progress every 100 rows
                if (index + 1) % 100 == 0:
                    print(f"   Processed {index + 1} rows...")
                    
            except Exception as e:
                print(f"   ❌ Error processing row {index + 1}: {e}")
                skipped_count += 1
                continue
        
        # Commit changes
        conn.commit()
        
        print(f"\n📊 IMPORT RESULTS:")
        print("-" * 40)
        print(f"   Successfully imported: {imported_count:,} records")
        print(f"   Skipped due to errors: {skipped_count:,} records")
        print(f"   Total rows processed: {len(df):,} records")
        
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
        
        # Show PSA (category) distribution for imported data
        print(f"\n📂 DLC DATA CATEGORY DISTRIBUTION:")
        print("-" * 40)
        cursor.execute("""
            SELECT PSA, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source = 'DLC_IMPORT'
            GROUP BY PSA 
            ORDER BY count DESC
        """)
        categories = cursor.fetchall()
        for category, count in categories:
            print(f"   {category}: {count:,} records")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ DLC data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during DLC data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Excel file path - using the Dashborad_DLC_Data_.xlsx file
    excel_file_path = "/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx"
    
    # Check if files exist
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    if not os.path.exists(excel_file_path):
        print(f"❌ Excel file not found: {excel_file_path}")
        return
    
    # Import the data
    import_dlc_data_to_pensioner_master(db_path, excel_file_path)

if __name__ == "__main__":
    main()