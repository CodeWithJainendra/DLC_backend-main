#!/usr/bin/env python3

"""
Script to import Manual LCs summary data into pensioner_bank_master table
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime
import glob

def import_manual_lcs_summary(db_path, data_directory):
    """Import Manual LCs summary data from bank Excel files"""
    print("📥 MANUAL LCs SUMMARY DATA IMPORT")
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
                
                # Process the appropriate sheet (usually 'Sheet2' or first sheet)
                sheet_name = None
                for sheet in xl.sheet_names:
                    if 'sheet2' in sheet.lower():
                        sheet_name = sheet
                        break
                
                if sheet_name is None:
                    sheet_name = xl.sheet_names[0]  # fallback to first sheet
                
                print(f"   📥 Reading sheet: {sheet_name}")
                
                # Read the Excel file
                df = pd.read_excel(file_path, sheet_name=sheet_name, header=None)
                print(f"   ✅ Successfully read {len(df)} rows from Excel file")
                
                # Display column names for verification
                print(f"   📋 Columns: {list(df.columns)}")
                
                # Special handling for AXIS.xls which has different structure
                if 'AXIS.xls' in filename:
                    # Process AXIS file with its specific structure
                    imported_count = process_axis_file(df, cursor, bank_name, sheet_name)
                    print(f"   📊 Results for {filename}:")
                    print(f"      Successfully imported: {imported_count:,} records")
                    total_imported += imported_count
                    continue
                
                # Process other files with the standard structure
                imported_count = process_standard_file(df, cursor, bank_name, sheet_name)
                print(f"   📊 Results for {filename}:")
                print(f"      Successfully imported: {imported_count:,} records")
                total_imported += imported_count
                
            except Exception as e:
                print(f"   ❌ Error reading {filename}: {e}")
                continue
        
        # Commit all changes
        conn.commit()
        
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
        print(f"\n📝 MANUAL LCs DISTRIBUTION BY PSA:")
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
        print("✅ Manual LCs summary data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during Manual LCs data import: {e}")
        if 'conn' in locals():
            conn.close()

def process_standard_file(df, cursor, bank_name, sheet_name):
    """Process standard format Excel files"""
    imported_count = 0
    
    # Look for PSA categories and their LC counts in the data
    for index, row in df.iterrows():
        try:
            # Check if this row contains PSA category information
            psa_name = None
            lc_count = 0
            
            # Look for PSA categories in the row
            for i, cell in enumerate(row):
                if pd.notna(cell):
                    cell_str = str(cell).strip().lower()
                    if 'state government' in cell_str:
                        psa_name = 'State Government'
                        # Look for the LC count in the same row
                        if i + 2 < len(row):
                            lc_value = row.iloc[i + 2]
                            if pd.notna(lc_value):
                                try:
                                    lc_count = int(float(str(lc_value).replace(',', '')))
                                except:
                                    pass
                        break
                    elif 'central government' in cell_str:
                        psa_name = 'Central Government'
                        # Look for the LC count in the same row
                        if i + 2 < len(row):
                            lc_value = row.iloc[i + 2]
                            if pd.notna(lc_value):
                                try:
                                    lc_count = int(float(str(lc_value).replace(',', '')))
                                except:
                                    pass
                        break
                    elif 'others' in cell_str and cell_str != 'others':
                        psa_name = 'Others'
                        # Look for the LC count in the same row
                        if i + 2 < len(row):
                            lc_value = row.iloc[i + 2]
                            if pd.notna(lc_value):
                                try:
                                    lc_count = int(float(str(lc_value).replace(',', '')))
                                except:
                                    pass
                        break
            
            # If we found a PSA category and LC count, import the records
            if psa_name and lc_count > 0:
                print(f"   Found {psa_name}: {lc_count} LC submissions")
                for i in range(lc_count):
                    # Generate a unique PPO-like identifier
                    ppo_number = f"LC_{bank_name[:3].upper()}{index+1:03d}{i+1:03d}"
                    
                    # Insert into pensioner_bank_master table
                    cursor.execute("""
                        INSERT INTO pensioner_bank_master (
                            ppo_number, bank_name, PSA, PDA,
                            data_source, sheet_name
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    """, (
                        ppo_number,  # ppo_number
                        bank_name,   # bank_name
                        psa_name,    # PSA (category)
                        'MANUAL_LC', # PDA
                        'MANUAL_LCS',  # data_source
                        sheet_name   # sheet_name
                    ))
                    
                    imported_count += 1
                    
        except Exception as e:
            continue
    
    return imported_count

def process_axis_file(df, cursor, bank_name, sheet_name):
    """Process AXIS.xls file with its specific structure"""
    imported_count = 0
    
    # For AXIS file, look for rows with numeric LC counts
    for index, row in df.iterrows():
        try:
            # Skip header rows
            if index < 3:
                continue
                
            # Look for rows with data
            if len(row) >= 4:
                # Check if this row has LC data (column 4 should have the count)
                lc_value = row.iloc[3]
                if pd.notna(lc_value):
                    try:
                        lc_count = int(float(str(lc_value).replace(',', '')))
                        if lc_count > 0:
                            # Get the PSA name from column 1
                            psa_value = row.iloc[1] if pd.notna(row.iloc[1]) else ''
                            if pd.notna(psa_value):
                                psa_name = str(psa_value).strip()
                                # Determine PSA category based on the name
                                if 'state' in psa_name.lower():
                                    psa_category = 'State Government'
                                elif 'central' in psa_name.lower():
                                    psa_category = 'Central Government'
                                else:
                                    psa_category = 'Others'
                                
                                print(f"   Found {psa_category}: {lc_count} LC submissions")
                                for i in range(lc_count):
                                    # Generate a unique PPO-like identifier
                                    ppo_number = f"LC_{bank_name[:3].upper()}{index+1:03d}{i+1:03d}"
                                    
                                    # Insert into pensioner_bank_master table
                                    cursor.execute("""
                                        INSERT INTO pensioner_bank_master (
                                            ppo_number, bank_name, PSA, PDA,
                                            data_source, sheet_name
                                        ) VALUES (?, ?, ?, ?, ?, ?)
                                    """, (
                                        ppo_number,  # ppo_number
                                        bank_name,   # bank_name
                                        psa_category,    # PSA (category)
                                        'MANUAL_LC', # PDA
                                        'MANUAL_LCS',  # data_source
                                        sheet_name   # sheet_name
                                    ))
                                    
                                    imported_count += 1
                    except:
                        continue
        except Exception as e:
            continue
    
    return imported_count

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Data directory
    data_directory = "/data1/jainendra/DLC_backend-main/manual_lcs_data"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Check if data directory exists
    if not os.path.exists(data_directory):
        print(f"❌ Data directory not found: {data_directory}")
        return
    
    # Check if directory is empty
    if not os.listdir(data_directory):
        print(f"⚠️  Data directory is empty: {data_directory}")
        print("Please transfer the Excel files to this directory and run the script again")
        return
    
    # Import the data
    import_manual_lcs_summary(db_path, data_directory)

if __name__ == "__main__":
    main()