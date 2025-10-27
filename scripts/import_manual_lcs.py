#!/usr/bin/env python3

"""
Script to import Manual LCs data from various bank Excel files
into pensioner_bank_master table
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime
import glob

def import_manual_lcs_data(db_path, data_directory):
    """Import Manual LCs data from bank Excel files"""
    print("📥 MANUAL LCs DATA IMPORT")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Data Directory: {data_directory}")
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
        
        # Find all Excel files in the directory
        excel_files = []
        for ext in ['*.xlsx', '*.xls']:
            excel_files.extend(glob.glob(os.path.join(data_directory, ext)))
        
        print(f"📁 Found {len(excel_files)} Excel files to process")
        
        total_imported = 0
        total_skipped = 0
        
        # Process each Excel file
        for file_path in excel_files:
            filename = os.path.basename(file_path)
            bank_name = filename.replace('.xlsx', '').replace('.xls', '')
            
            print(f"\n📄 Processing: {filename} ({bank_name})")
            
            if not os.path.exists(file_path):
                print(f"   ❌ File not found: {file_path}")
                continue
            
            try:
                # Read Excel file
                xl = pd.ExcelFile(file_path)
                print(f"   📋 Sheets available: {xl.sheet_names}")
                
                # Process each sheet in the file
                for sheet_name in xl.sheet_names:
                    print(f"   📥 Reading sheet: {sheet_name}")
                    try:
                        df = pd.read_excel(file_path, sheet_name=sheet_name)
                        print(f"   ✅ Successfully read {len(df)} rows from Excel file")
                        
                        # Display column names for verification
                        print(f"   📋 Columns: {list(df.columns)}")
                        
                        imported_count = 0
                        skipped_count = 0
                        
                        # Process each row
                        for index, row in df.iterrows():
                            try:
                                # Extract data from row
                                # Try to identify relevant columns
                                state = ''
                                city = ''
                                branch_name = ''
                                branch_pincode = ''
                                pensioner_pincode = ''
                                ppo_number = ''
                                lc_count = 0
                                
                                # Look for common column names
                                for col in df.columns:
                                    col_lower = str(col).lower()
                                    if 'state' in col_lower:
                                        state = str(row[col]) if pd.notna(row[col]) else ''
                                    elif 'city' in col_lower or 'district' in col_lower:
                                        city = str(row[col]) if pd.notna(row[col]) else ''
                                    elif 'branch' in col_lower and 'name' in col_lower:
                                        branch_name = str(row[col]) if pd.notna(row[col]) else ''
                                    elif 'pin' in col_lower or 'postcode' in col_lower:
                                        if 'branch' in col_lower:
                                            branch_pincode = str(row[col]).replace(',', '').replace(' ', '') if pd.notna(row[col]) else ''
                                        else:
                                            pensioner_pincode = str(row[col]).replace(',', '').replace(' ', '') if pd.notna(row[col]) else ''
                                    elif 'ppo' in col_lower or 'pension' in col_lower:
                                        ppo_number = str(row[col]) if pd.notna(row[col]) else ''
                                    elif 'lc' in col_lower or 'count' in col_lower or 'number' in col_lower:
                                        try:
                                            lc_count = int(row[col]) if pd.notna(row[col]) else 0
                                        except:
                                            lc_count = 0
                                
                                # If we couldn't find specific columns, try to infer from the data
                                if not any([state, city, branch_name, branch_pincode, pensioner_pincode]):
                                    # Use first few columns as general data
                                    if len(df.columns) >= 3:
                                        state = str(row[df.columns[0]]) if pd.notna(row[df.columns[0]]) else ''
                                        city = str(row[df.columns[1]]) if pd.notna(row[df.columns[1]]) else ''
                                        branch_name = str(row[df.columns[2]]) if pd.notna(row[df.columns[2]]) else ''
                                
                                # Generate a unique identifier if we don't have a PPO number
                                if not ppo_number:
                                    ppo_number = f"LC_{bank_name[:3].upper()}{index+1:05d}"
                                
                                # Insert into pensioner_bank_master table
                                cursor.execute("""
                                    INSERT INTO pensioner_bank_master (
                                        ppo_number, bank_name, branch_name, branch_postcode,
                                        pensioner_city, state, pensioner_postcode, PSA, PDA,
                                        data_source, sheet_name
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """, (
                                    ppo_number,  # ppo_number
                                    bank_name,   # bank_name
                                    branch_name,  # branch_name
                                    branch_pincode,  # branch_postcode
                                    city,  # pensioner_city
                                    state,  # state
                                    pensioner_pincode,  # pensioner_postcode
                                    f'MANUAL_LC_{lc_count}',  # PSA (category with LC count)
                                    'MANUAL_LC',  # PDA
                                    'MANUAL_LCS',  # data_source
                                    sheet_name  # sheet_name
                                ))
                                
                                imported_count += 1
                                
                                # Print progress every 100 rows
                                if (index + 1) % 100 == 0:
                                    print(f"   Processed {index + 1} rows...")
                                    
                            except Exception as e:
                                print(f"   ❌ Error processing row {index + 1}: {e}")
                                skipped_count += 1
                                continue
                        
                        # Commit changes for this sheet
                        conn.commit()
                        
                        print(f"   📊 Results for {filename} - {sheet_name}:")
                        print(f"      Successfully imported: {imported_count:,} records")
                        print(f"      Skipped due to errors: {skipped_count:,} records")
                        
                        total_imported += imported_count
                        total_skipped += skipped_count
                        
                    except Exception as e:
                        print(f"   ❌ Error reading sheet {sheet_name}: {e}")
                        continue
                
            except Exception as e:
                print(f"   ❌ Error reading {filename}: {e}")
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
        
        # Show Manual LCs category distribution
        print(f"\n📝 MANUAL LCs DISTRIBUTION:")
        print("-" * 40)
        cursor.execute("""
            SELECT PSA, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source = 'MANUAL_LCS'
            GROUP BY PSA 
            ORDER BY count DESC
        """)
        lc_categories = cursor.fetchall()
        for category, count in lc_categories:
            print(f"   {category}: {count:,} records")
        
        # Show bank-wise distribution for Manual LCs
        print(f"\n🏦 BANK-WISE DISTRIBUTION FOR MANUAL LCs:")
        print("-" * 40)
        cursor.execute("""
            SELECT bank_name, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source = 'MANUAL_LCS'
            GROUP BY bank_name 
            ORDER BY count DESC
        """)
        bank_distribution = cursor.fetchall()
        for bank, count in bank_distribution:
            print(f"   {bank}: {count:,} records")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ Manual LCs data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during Manual LCs data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Data directory (you'll need to adjust this path to where your files are located)
    data_directory = "/data1/jainendra/DLC_backend-main/manual_lcs_data"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Check if data directory exists
    if not os.path.exists(data_directory):
        print(f"❌ Data directory not found: {data_directory}")
        print("Please create the directory and place the Excel files there")
        return
    
    # Import the data
    import_manual_lcs_data(db_path, data_directory)

if __name__ == "__main__":
    main()