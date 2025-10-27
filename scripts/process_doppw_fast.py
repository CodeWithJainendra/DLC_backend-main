#!/usr/bin/env python3
"""
Fast DOPPW Data Processing using bulk insert
"""

import pandas as pd
import sqlite3
from datetime import datetime
import sys

def process_doppw_fast(file_path):
    """Process DOPPW data using fast bulk insert"""
    
    print("📂 Fast Processing DOPPW Multi-Sheet Data")
    print("=" * 80)
    
    try:
        db_path = "../DLC_Database.db"
        conn = sqlite3.connect(db_path)
        
        xl_file = pd.ExcelFile(file_path)
        sheet_names = xl_file.sheet_names
        
        print(f"📋 Found {len(sheet_names)} sheets")
        
        total_inserted = 0
        
        for sheet_idx, sheet_name in enumerate(sheet_names, 1):
            print(f"\n{'='*80}")
            print(f"📄 Sheet {sheet_idx}/{len(sheet_names)}: {sheet_name}")
            print('='*80)
            
            # Read sheet
            print(f"   Loading...")
            df = pd.read_excel(file_path, sheet_name=sheet_name)
            print(f"   Loaded: {len(df):,} rows")
            
            # Prepare data
            print(f"   Preparing data...")
            
            # Calculate AGE
            current_year = datetime.now().year
            df['AGE'] = df['BIRTH_YEAR'].apply(
                lambda x: current_year - int(x) if pd.notna(x) and str(x).isdigit() else None
            )
            
            # Rename columns to match database
            df_db = pd.DataFrame({
                'LEVEL1': df['GCODE'].astype(str),
                'ESCROLL_CATEGORY': df['ESCROLL_CAT'].astype(str),
                'GROUP_ID': df['GID'].astype(str),
                'PENSION_TYPE': df['PENSION_TYPE'].astype(str),
                'BRANCH_CODE': df['BRANCH_CODE'].astype(str),
                'BRANCH_NAME': df['BRANCH_NAME'].astype(str),
                'BRANCH_PINCODE': df['BRANCH_PIN'].astype(str),
                'BRANCH_STATE_NAME': df['BRANCH_STATE'].astype(str),
                'YEAR_OF_BIRTH': df['BIRTH_YEAR'],
                'AGE': df['AGE'],
                'SUBMISSION_STATUS': df['SUBMITTED_STATUS'].astype(str),
                'SUBMISSION_MODE': df['SUBMISSION_MODE'].astype(str),
                'WAIVER_TILL': df['WAIVER_UPTO'].astype(str),
                'VERIFICATION_TYPE': df['VERIFICATION_TYPE'].astype(str),
                'PENSIONER_PINCODE': df['PENSIONER_PINCODE'].astype(str),
                'PENSIONER_DISTRICT_NAME': df['PENSIONER_DISTNAME'].astype(str),
                'PENSIONER_STATE_NAME': df['PENSIONER_STATENAME'].astype(str),
                'CERTIFICATE_SUBMISSION_DATE': df['CERTIFICATE_SUBMISSION_DATE'].astype(str),
                'DATA_DATE': datetime.now().date()
            })
            
            # Bulk insert using to_sql
            print(f"   Inserting into database...")
            df_db.to_sql(
                'TBL_DOPPW_DLCDATA_MST',
                conn,
                if_exists='append',
                index=False,
                chunksize=10000
            )
            
            total_inserted += len(df_db)
            print(f"   ✅ Inserted: {len(df_db):,} records")
        
        # Summary
        print("\n" + "=" * 80)
        print("📊 PROCESSING COMPLETE")
        print("=" * 80)
        print(f"Total Records Inserted: {total_inserted:,}")
        
        # Database stats
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM TBL_DOPPW_DLCDATA_MST")
        total_in_db = cursor.fetchone()[0]
        print(f"Total in Database: {total_in_db:,}")
        
        # Summary by GCODE
        print("\n📊 By GCODE:")
        cursor.execute("""
            SELECT LEVEL1, COUNT(*) as count
            FROM TBL_DOPPW_DLCDATA_MST
            GROUP BY LEVEL1
            ORDER BY count DESC
        """)
        for gcode, count in cursor.fetchall():
            print(f"   {gcode}: {count:,}")
        
        # Summary by Status
        print("\n📊 By Status:")
        cursor.execute("""
            SELECT SUBMISSION_STATUS, COUNT(*) as count
            FROM TBL_DOPPW_DLCDATA_MST
            GROUP BY SUBMISSION_STATUS
            ORDER BY count DESC
        """)
        for status, count in cursor.fetchall():
            print(f"   {status}: {count:,}")
        
        conn.close()
        print("\n✅ Done!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    file_path = sys.argv[1] if len(sys.argv) > 1 else "../EXCEL_DATA/Excel Files/doppw_data_03102025.xlsx"
    
    print("⚠️  Processing 4.2M+ records. This will take 20-40 minutes.")
    print("Starting in 3 seconds...")
    
    import time
    time.sleep(3)
    
    process_doppw_fast(file_path)
