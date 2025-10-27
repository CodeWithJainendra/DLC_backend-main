#!/usr/bin/env python3

"""
Script to import DoT pensioners details data into pensioner_bank_master table
"""

import sqlite3
import pandas as pd
import os
from datetime import datetime
import numpy as np

def import_dot_pensioners_data(db_path, excel_file_path):
    """Import DoT pensioners data from Excel file"""
    print("📥 DOTr pensioners DATA IMPORT")
    print("="*80)
    print(f"Database: {db_path}")
    print(f"Excel File: {excel_file_path}")
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
        
        # Read both sheets from the Excel file
        print("📄 Reading Excel file sheets...")
        xl = pd.ExcelFile(excel_file_path)
        print(f"   📋 Sheets available: {xl.sheet_names}")
        
        total_imported = 0
        
        # Process each sheet
        for sheet_index, sheet_name in enumerate(xl.sheet_names):
            print(f"\n📄 Processing sheet {sheet_index + 1}: {sheet_name}")
            
            try:
                # Read the sheet
                df = pd.read_excel(excel_file_path, sheet_name=sheet_index, header=None)
                print(f"   ✅ Successfully read {len(df)} rows from sheet")
                
                # Find the header row (row with column names)
                header_row_index = -1
                for i, row in df.iterrows():
                    if 'PPO NUMBER' in str(row.iloc[0]) and ('Year of Birth' in str(row.iloc[1]) or 'Pin code' in str(row.iloc[1])):
                        header_row_index = i
                        break
                
                if header_row_index == -1:
                    print(f"   ⚠️  Could not find header row, skipping sheet")
                    continue
                
                print(f"   📋 Header found at row {header_row_index}")
                
                # Read the data with proper headers
                df_data = pd.read_excel(excel_file_path, sheet_name=sheet_index, header=header_row_index)
                print(f"   📊 Data shape: {df_data.shape}")
                
                # Clean column names
                df_data.columns = df_data.columns.str.strip()
                
                # Display column names
                print(f"   📋 Columns: {list(df_data.columns)}")
                
                # Determine data source based on sheet name
                if 'Nov-25' in sheet_name:
                    data_source = 'DOT_LC_NOV2025'
                    category = 'LC Expiring Nov 2025'
                else:
                    data_source = 'DOT_LC_AUG2025_JUL2026'
                    category = 'LC Aug 2025-Jul 2026'
                
                print(f"   📦 Data source: {data_source}")
                print(f"   📦 Category: {category}")
                
                imported_count = 0
                
                # Process each row
                for index, row in df_data.iterrows():
                    try:
                        # Extract data from row
                        ppo_number = str(row['PPO NUMBER']).strip() if pd.notna(row['PPO NUMBER']) else None
                        
                        # Skip if PPO number is missing
                        if not ppo_number or ppo_number.lower() in ['nan', 'none']:
                            continue
                        
                        # Extract year of birth
                        birth_year = None
                        if 'Year of Birth' in df_data.columns:
                            birth_year_val = row['Year of Birth']
                            if pd.notna(birth_year_val):
                                try:
                                    birth_year = str(int(birth_year_val))
                                except:
                                    birth_year = str(birth_year_val)
                        
                        # Extract pensioner pin code
                        pensioner_pincode = None
                        if 'Pin code of Pensioner address' in df_data.columns:
                            pincode_val = row['Pin code of Pensioner address']
                            if pd.notna(pincode_val):
                                try:
                                    # Remove commas and convert to integer
                                    pensioner_pincode = str(int(str(pincode_val).replace(',', '')))
                                except:
                                    pensioner_pincode = str(pincode_val).replace(',', '')
                        
                        # Extract PDA pin code
                        pda_pincode = None
                        if 'Pin code of PDA address' in df_data.columns:
                            pda_pincode_val = row['Pin code of PDA address']
                            if pd.notna(pda_pincode_val):
                                try:
                                    # Remove commas and convert to integer
                                    pda_pincode = str(int(str(pda_pincode_val).replace(',', '')))
                                except:
                                    pda_pincode = str(pda_pincode_val).replace(',', '')
                        elif 'Pin code of PDA\'s address' in df_data.columns:
                            pda_pincode_val = row['Pin code of PDA\'s address']
                            if pd.notna(pda_pincode_val):
                                try:
                                    # Remove commas and convert to integer
                                    pda_pincode = str(int(str(pda_pincode_val).replace(',', '')))
                                except:
                                    pda_pincode = str(pda_pincode_val).replace(',', '')
                        
                        # Generate a bank name based on the data source
                        bank_name = 'DoT Pensioners'
                        
                        # Insert into pensioner_bank_master table
                        cursor.execute("""
                            INSERT INTO pensioner_bank_master (
                                ppo_number, bank_name, psa, pda,
                                data_source, sheet_name,
                                pensioner_postcode, branch_postcode,
                                birth_year
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            ppo_number,           # ppo_number
                            bank_name,            # bank_name
                            category,             # psa (category)
                            'PDA',                # pda
                            data_source,          # data_source
                            sheet_name,           # sheet_name
                            pensioner_pincode,    # pensioner_postcode
                            pda_pincode,          # branch_postcode
                            birth_year            # birth_year
                        ))
                        
                        imported_count += 1
                        
                        # Print progress every 1000 rows
                        if (imported_count) % 1000 == 0:
                            print(f"   Processed {imported_count:,} records...")
                            
                    except Exception as e:
                        print(f"   ❌ Error processing row {index + 1}: {e}")
                        continue
                
                # Commit changes for this sheet
                conn.commit()
                
                print(f"   📊 Results for sheet '{sheet_name}':")
                print(f"      Successfully imported: {imported_count:,} records")
                
                total_imported += imported_count
                
            except Exception as e:
                print(f"   ❌ Error reading sheet '{sheet_name}': {e}")
                continue
        
        # Get final count
        cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
        final_count = cursor.fetchone()[0]
        
        print(f"\n📊 OVERALL IMPORT RESULTS:")
        print("-" * 40)
        print(f"   Initial records: {initial_count:,}")
        print(f"   Successfully imported: {total_imported:,} records")
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
        
        # Show DoT categories distribution
        print(f"\n📝 DoT DATA DISTRIBUTION:")
        print("-" * 40)
        cursor.execute("""
            SELECT psa, COUNT(*) as count 
            FROM pensioner_bank_master 
            WHERE data_source LIKE 'DOT_%'
            GROUP BY psa 
            ORDER BY count DESC
        """)
        dot_categories = cursor.fetchall()
        for category, count in dot_categories:
            print(f"   {category}: {count:,} records")
        
        conn.close()
        
        print(f"\n{'='*80}")
        print("✅ DoT pensioners data import completed successfully!")
        print(f"🏁 Import finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
    except Exception as e:
        print(f"❌ Error during DoT pensioners data import: {e}")
        if 'conn' in locals():
            conn.close()

def main():
    # Database path
    db_path = "/data1/jainendra/DLC_backend-main/DLC_Database.db"
    
    # Excel file path
    excel_file_path = "/data1/jainendra/DLC_backend-main/DoT pensioners details data updated.xlsx"
    
    # Check if database file exists
    if not os.path.exists(db_path):
        print(f"❌ Database file not found: {db_path}")
        return
    
    # Check if Excel file exists
    if not os.path.exists(excel_file_path):
        print(f"❌ Excel file not found: {excel_file_path}")
        return
    
    # Import the data
    import_dot_pensioners_data(db_path, excel_file_path)

if __name__ == "__main__":
    main()