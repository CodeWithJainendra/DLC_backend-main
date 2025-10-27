#!/usr/bin/env python3
"""
Process DOPPW Multi-Sheet Data
Insert 4.2M+ pensioner records into TBL_DOPPW_DLCDATA_MST
"""

import pandas as pd
import sqlite3
import sys
from datetime import datetime

def map_columns(df):
    """Map Excel columns to database columns"""
    column_mapping = {
        'GCODE': 'LEVEL1',
        'ESCROLL_CAT': 'ESCROLL_CATEGORY',
        'GID': 'GROUP_ID',
        'PENSION_TYPE': 'PENSION_TYPE',
        'BRANCH_CODE': 'BRANCH_CODE',
        'BRANCH_NAME': 'BRANCH_NAME',
        'BRANCH_PIN': 'BRANCH_PINCODE',
        'BRANCH_STATE': 'BRANCH_STATE_NAME',
        'BIRTH_YEAR': 'YEAR_OF_BIRTH',
        'SUBMITTED_STATUS': 'SUBMISSION_STATUS',
        'WAIVER_UPTO': 'WAIVER_TILL',
        'SUBMISSION_MODE': 'SUBMISSION_MODE',
        'VERIFICATION_TYPE': 'VERIFICATION_TYPE',
        'CERTIFICATE_SUBMISSION_DATE': 'CERTIFICATE_SUBMISSION_DATE',
        'PENSIONER_PINCODE': 'PENSIONER_PINCODE',
        'PENSIONER_DISTNAME': 'PENSIONER_DISTRICT_NAME',
        'PENSIONER_STATENAME': 'PENSIONER_STATE_NAME'
    }
    
    # Rename columns
    df_mapped = df.rename(columns=column_mapping)
    
    # Calculate AGE from YEAR_OF_BIRTH
    current_year = datetime.now().year
    if 'YEAR_OF_BIRTH' in df_mapped.columns:
        df_mapped['AGE'] = df_mapped['YEAR_OF_BIRTH'].apply(
            lambda x: current_year - int(x) if pd.notna(x) and str(x).isdigit() else None
        )
    
    return df_mapped

def process_doppw_data(file_path, batch_size=10000):
    """Process DOPPW multi-sheet data"""
    
    print("📂 Processing DOPPW Multi-Sheet file")
    print("=" * 80)
    
    try:
        # Connect to database
        db_path = "../DLC_Database.db"
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all sheet names
        xl_file = pd.ExcelFile(file_path)
        sheet_names = xl_file.sheet_names
        
        print(f"📋 Found {len(sheet_names)} sheets")
        print(f"Sheets: {sheet_names}")
        
        total_inserted = 0
        total_skipped = 0
        
        # Process each sheet
        for sheet_idx, sheet_name in enumerate(sheet_names, 1):
            print(f"\n{'='*80}")
            print(f"📄 Processing Sheet {sheet_idx}/{len(sheet_names)}: {sheet_name}")
            print('='*80)
            
            # Read entire sheet
            print(f"   Loading sheet data...")
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            print(f"   Loaded {len(df):,} rows")
            
            # Map columns
            df_mapped = map_columns(df)
            
            sheet_inserted = 0
            sheet_skipped = 0
            
            # Insert records in batches
            print(f"   Inserting records...")
            for idx, row in df_mapped.iterrows():
                try:
                    # Skip if essential fields are missing
                    if pd.isna(row.get('LEVEL1')) or pd.isna(row.get('ESCROLL_CATEGORY')):
                        sheet_skipped += 1
                        continue
                    
                    cursor.execute("""
                        INSERT INTO TBL_DOPPW_DLCDATA_MST (
                            LEVEL1, ESCROLL_CATEGORY, GROUP_ID, PENSION_TYPE,
                            BRANCH_CODE, BRANCH_NAME, BRANCH_PINCODE, 
                            BRANCH_STATE_NAME, YEAR_OF_BIRTH, AGE,
                            SUBMISSION_STATUS, SUBMISSION_MODE, WAIVER_TILL,
                            VERIFICATION_TYPE, PENSIONER_PINCODE,
                            PENSIONER_DISTRICT_NAME, PENSIONER_STATE_NAME,
                            CERTIFICATE_SUBMISSION_DATE, DATA_DATE
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        str(row.get('LEVEL1', '')),
                        str(row.get('ESCROLL_CATEGORY', '')),
                        str(row.get('GROUP_ID', '')),
                        str(row.get('PENSION_TYPE', '')),
                        str(row.get('BRANCH_CODE', '')),
                        str(row.get('BRANCH_NAME', '')),
                        str(row.get('BRANCH_PINCODE', '')),
                        str(row.get('BRANCH_STATE_NAME', '')),
                        int(row.get('YEAR_OF_BIRTH')) if pd.notna(row.get('YEAR_OF_BIRTH')) else None,
                        int(row.get('AGE')) if pd.notna(row.get('AGE')) else None,
                        str(row.get('SUBMISSION_STATUS', '')),
                        str(row.get('SUBMISSION_MODE', '')),
                        str(row.get('WAIVER_TILL', '')),
                        str(row.get('VERIFICATION_TYPE', '')),
                        str(row.get('PENSIONER_PINCODE', '')),
                        str(row.get('PENSIONER_DISTRICT_NAME', '')),
                        str(row.get('PENSIONER_STATE_NAME', '')),
                        str(row.get('CERTIFICATE_SUBMISSION_DATE', '')),
                        datetime.now().date()
                    ))
                    sheet_inserted += 1
                    
                    # Progress update every 10000 records
                    if sheet_inserted % 10000 == 0:
                        conn.commit()
                        print(f"   Inserted {sheet_inserted:,} records...")
                    
                except Exception as e:
                    sheet_skipped += 1
                    if sheet_skipped <= 5:  # Show first 5 errors only
                        print(f"   ⚠️  Error at row {idx}: {e}")
            
            # Final commit for this sheet
            conn.commit()
            
            total_inserted += sheet_inserted
            total_skipped += sheet_skipped
            
            print(f"\n✅ Sheet '{sheet_name}' Complete:")
            print(f"   Inserted: {sheet_inserted:,}")
            print(f"   Skipped: {sheet_skipped:,}")
        
        # Final summary
        print("\n" + "=" * 80)
        print("📊 FINAL SUMMARY")
        print("=" * 80)
        print(f"Total Sheets Processed: {len(sheet_names)}")
        print(f"Total Records Inserted: {total_inserted:,}")
        print(f"Total Records Skipped: {total_skipped:,}")
        
        # Database statistics
        cursor.execute("SELECT COUNT(*) FROM TBL_DOPPW_DLCDATA_MST")
        total_in_db = cursor.fetchone()[0]
        print(f"\nTotal Records in Database: {total_in_db:,}")
        
        # Summary by GCODE
        print("\n📊 Summary by GCODE:")
        cursor.execute("""
            SELECT LEVEL1, COUNT(*) as count
            FROM TBL_DOPPW_DLCDATA_MST
            GROUP BY LEVEL1
            ORDER BY count DESC
        """)
        for gcode, count in cursor.fetchall():
            print(f"   {gcode}: {count:,}")
        
        # Summary by Status
        print("\n📊 Summary by Status:")
        cursor.execute("""
            SELECT SUBMISSION_STATUS, COUNT(*) as count
            FROM TBL_DOPPW_DLCDATA_MST
            GROUP BY SUBMISSION_STATUS
            ORDER BY count DESC
        """)
        for status, count in cursor.fetchall():
            print(f"   {status}: {count:,}")
        
        # Summary by State (Top 10)
        print("\n📊 Top 10 States:")
        cursor.execute("""
            SELECT BRANCH_STATE_NAME, COUNT(*) as count
            FROM TBL_DOPPW_DLCDATA_MST
            WHERE BRANCH_STATE_NAME != 'nan'
            GROUP BY BRANCH_STATE_NAME
            ORDER BY count DESC
            LIMIT 10
        """)
        for state, count in cursor.fetchall():
            print(f"   {state}: {count:,}")
        
        conn.close()
        
        print("\n" + "=" * 80)
        print("✅ DOPPW Data Processing Complete!")
        print("=" * 80)
        
    except Exception as e:
        print(f"❌ Error processing file: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
    else:
        file_path = "../EXCEL_DATA/Excel Files/doppw_data_03102025.xlsx"
    
    print("⚠️  WARNING: This will process 4.2M+ records. This may take 30-60 minutes.")
    print("Press Ctrl+C to cancel, or wait 5 seconds to continue...")
    
    import time
    time.sleep(5)
    
    process_doppw_data(file_path)
