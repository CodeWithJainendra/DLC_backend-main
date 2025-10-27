#!/usr/bin/env python3

"""
Script to import SPARSH Defence pensioners data from SBI.xlsx and PNB.xlsx files
into pensioner_bank_master table, organized by state, bank, branch pincode, age groups, and family pincode
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime

def import_sparsh_data(db_path, excel_files):
    """Import SPARSH Defence pensioners data from Excel files"""
    print("📥 SPARSH DEFENCE PENSIONERS DATA IMPORT")
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
        
        total_imported = 0
        total_skipped = 0
        
        # Process each Excel file
        for file_path, bank_name, data_source in excel_files:
            print(f"\n📄 Processing: {os.path.basename(file_path)} ({bank_name} data)")
            
            if not os.path.exists(file_path):
                print(f"   ❌ File not found: {file_path}")
                continue
            
            try:
                # Read Excel file with header at row 1
                xl = pd.ExcelFile(file_path)
                print(f"   📋 Sheets available: {xl.sheet_names}")
                
                # Process the first sheet (Service Pensioners)
                print(f"   📥 Reading sheet: {xl.sheet_names[0]}")
                df = pd.read_excel(file_path, sheet_name=xl.sheet_names[0], header=1)
                print(f"   ✅ Successfully read {len(df)} rows from Excel file")
                
                # Display column names for verification
                print(f"   📋 Columns: {list(df.columns)}")
                
                imported_count = 0
                skipped_count = 0
                
                # Process each row
                for index, row in df.iterrows():
                    try:
                        # Extract data from row
                        bank_state = str(row.get('BANK_STATE', ''))
                        bank_city = str(row.get('BANK_CITY2', ''))
                        bank_name_actual = str(row.get('BANK_NAME', bank_name))
                        bank_ifsc = str(row.get('BANK_IFSC', ''))
                        
                        # Handle pin code
                        branch_pin = row.get('Branch PIN Code', '')
                        if pd.notna(branch_pin):
                            # Remove commas and spaces from pin code
                            branch_pin = str(branch_pin).replace(',', '').replace(' ', '')
                        else:
                            branch_pin = ''
                        
                        # Get counts for each age category
                        age_less_80 = int(row.get('AGE LESS THAN 80', 0) or 0)
                        age_more_80 = int(row.get('AGE MORE THAN 80', 0) or 0)
                        age_not_available = int(row.get('AGE NOT AVAILABLE', 0) or 0)
                        grand_total = int(row.get('Grand Total', 0) or 0)
                        
                        # Create records for each pensioner in this branch
                        # Create individual records for each age category
                        age_categories = [
                            ('LESS_THAN_80', age_less_80, '< 80'),
                            ('MORE_THAN_80', age_more_80, '> 80'),
                            ('AGE_NOT_AVAILABLE', age_not_available, 'Unknown')
                        ]
                        
                        # Create records for each pensioner
                        for age_category, count, age_display in age_categories:
                            if count > 0:
                                for i in range(count):
                                    # Generate a unique PPO-like identifier
                                    ppo_number = f"SPARSH_{bank_name[:3].upper()}{index+1:05d}{age_category[:3]}{i+1:02d}"
                                    
                                    # Insert into pensioner_bank_master table
                                    cursor.execute("""
                                        INSERT INTO pensioner_bank_master (
                                            ppo_number, bank_name, branch_name, branch_postcode,
                                            pensioner_city, state, pensioner_postcode, PSA, PDA,
                                            data_source, sheet_name
                                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                    """, (
                                        ppo_number,  # ppo_number
                                        bank_name_actual,   # bank_name
                                        bank_city,  # branch_name
                                        branch_pin,  # branch_postcode
                                        bank_city,  # pensioner_city
                                        bank_state,  # state
                                        branch_pin,  # pensioner_postcode (same as branch for service pensioners)
                                        f'DEFENCE_{age_display}',  # PSA (category with readable age)
                                        bank_ifsc,  # PDA
                                        data_source,  # data_source
                                        xl.sheet_names[0]  # sheet_name
                                    ))
                                    
                                    imported_count += 1
                        
                        # Print progress every 1000 rows
                        if (index + 1) % 1000 == 0:
                            print(f"   Processed {index + 1} service pensioner rows...")
                            
                    except Exception as e:
                        print(f"   ❌ Error processing service row {index + 1}: {e}")
                        skipped_count += 1
                        continue
                
                # Commit changes for service pensioners
                conn.commit()
                
                print(f"   📊 Results for {os.path.basename(file_path)} Service Pensioners:")
                print(f"      Successfully imported: {imported_count:,} records")
                print(f"      Skipped due to errors: {skipped_count:,} records")
                
                total_imported += imported_count
                total_skipped += skipped_count
                
                # Also process Family Pensioners sheet if it exists
                if len(xl.sheet_names) > 1:
                    print(f"\n   📥 Reading sheet: {xl.sheet_names[1]}")
                    df_family = pd.read_excel(file_path, sheet_name=xl.sheet_names[1], header=1)
                    print(f"   ✅ Successfully read {len(df_family)} rows from Family Pensioners sheet")
                    
                    imported_count_family = 0
                    skipped_count_family = 0
                    
                    # Process each row in family pensioners sheet
                    for index, row in df_family.iterrows():
                        try:
                            # Extract data from row
                            bank_state = str(row.get('BANK_STATE', ''))
                            bank_city = str(row.get('BANK_CITY2', ''))
                            bank_name_actual = str(row.get('BANK_NAME', bank_name))
                            bank_ifsc = str(row.get('BANK_IFSC', ''))
                            
                            # Handle pin code
                            branch_pin = row.get('Branch PIN CODE', '')
                            if pd.notna(branch_pin):
                                # Remove commas and spaces from pin code
                                branch_pin = str(branch_pin).replace(',', '').replace(' ', '')
                            else:
                                branch_pin = ''
                            
                            # Get family pin code
                            family_pin = row.get('Family  PIN CODE', '')
                            if pd.notna(family_pin):
                                family_pin = str(family_pin).replace(',', '').replace(' ', '')
                            else:
                                family_pin = branch_pin  # Use branch pin if family pin not available
                            
                            # Get counts for each age category
                            age_less_80 = int(row.get('AGE LESS THAN 80', 0) or 0)
                            age_more_80 = int(row.get('AGE MORE THAN 80', 0) or 0)
                            age_not_available = int(row.get('AGE NOT AVAILABLE', 0) or 0)
                            grand_total = int(row.get('Grand Total', 0) or 0)
                            
                            # Create records for each pensioner in this branch
                            # Create individual records for each age category
                            age_categories = [
                                ('LESS_THAN_80', age_less_80, '< 80'),
                                ('MORE_THAN_80', age_more_80, '> 80'),
                                ('AGE_NOT_AVAILABLE', age_not_available, 'Unknown')
                            ]
                            
                            # Create records for each pensioner
                            for age_category, count, age_display in age_categories:
                                if count > 0:
                                    for i in range(count):
                                        # Generate a unique PPO-like identifier
                                        ppo_number = f"SPARSH_FAM_{bank_name[:3].upper()}{index+1:05d}{age_category[:3]}{i+1:02d}"
                                        
                                        # Insert into pensioner_bank_master table
                                        cursor.execute("""
                                            INSERT INTO pensioner_bank_master (
                                                ppo_number, bank_name, branch_name, branch_postcode,
                                                pensioner_city, state, pensioner_postcode, PSA, PDA,
                                                data_source, sheet_name
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                        """, (
                                            ppo_number,  # ppo_number
                                            bank_name_actual,   # bank_name
                                            bank_city,  # branch_name
                                            branch_pin,  # branch_postcode
                                            bank_city,  # pensioner_city
                                            bank_state,  # state
                                            family_pin,  # pensioner_postcode (family pin for family pensioners)
                                            f'DEFENCE_FAMILY_{age_display}',  # PSA (category with readable age)
                                            bank_ifsc,  # PDA
                                            data_source + '_FAMILY',  # data_source
                                            xl.sheet_names[1]  # sheet_name
                                        ))
                                        
                                        imported_count_family += 1
                            
                            # Print progress every 1000 rows
                            if (index + 1) % 1000 == 0:
                                print(f"   Processed {index + 1} family pensioner rows...")
                                
                        except Exception as e:
                            print(f"   ❌ Error processing family row {index + 1}: {e}")
                            skipped_count_family += 1
                            continue
                    
                    # Commit changes for family pensioners
                    conn.commit()
                    
                    print(f"   📊 Results for {os.path.basename(file_path)} Family Pensioners:")
                    print(f"      Successfully imported: {imported_count_family:,} records")
                    print(f"      Skipped due to errors: {skipped_count_family:,} records")
                    
                    total_imported += imported_count_family
                    total_skipped += skipped_count_family
                
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
        
        # Show DEFENCE category distribution
        print(f"\n🛡️  DEFENCE PENSIONERS DISTRIBUTION:")
        print("-" * 40)
        cursor.execute("""
            SELECT PSA, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%'
            GROUP BY PSA 
            ORDER BY count DESC
        """)
        defence_categories = cursor.fetchall()
        for category, count in defence_categories:
            print(f"   {category}: {count:,} records")
        
        # Show state-wise distribution for SPARSH data
        print(f"\n🗾 STATE-WISE DISTRIBUTION FOR SPARSH DATA:")
        print("-" * 40)
        cursor.execute("""
            SELECT state, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%'
            GROUP BY state 
            ORDER BY count DESC
            LIMIT 10
        """)
        state_distribution = cursor.fetchall()
        for state, count in state_distribution:
            print(f"   {state}: {count:,} records")
        
        # Show bank-wise distribution for SPARSH data
        print(f"\n🏦 BANK-WISE DISTRIBUTION FOR SPARSH DATA:")
        print("-" * 40)
        cursor.execute("""
            SELECT bank_name, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source LIKE '%SPARSH%'
            GROUP BY bank_name 
            ORDER BY count DESC
        """)
        bank_distribution = cursor.fetchall()
        for bank, count in bank_distribution:
            print(f"   {bank}: {count:,} records")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ SPARSH Defence pensioners data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during SPARSH data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Excel files to process
    excel_files = [
        ("/data1/jainendra/DLC_backend-main/SBI.xlsx", "STATE BANK OF INDIA", "SPARSH_SBI"),
        ("/data1/jainendra/DLC_backend-main/PNB.xlsx", "PUNJAB NATIONAL BANK", "SPARSH_PNB")
    ]
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Check if Excel files exist
    for file_path, bank_name, data_source in excel_files:
        if not os.path.exists(file_path):
            print(f"❌ Excel file not found: {file_path}")
            return
    
    # Import the data
    import_sparsh_data(db_path, excel_files)

if __name__ == "__main__":
    main()