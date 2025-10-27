#!/usr/bin/env python3
"""
Test DOPPW processing with single sheet (Sheet4 - smallest)
"""

import pandas as pd
import sqlite3
from datetime import datetime

file_path = "../EXCEL_DATA/Excel Files/doppw_data_03102025.xlsx"
db_path = "../DLC_Database.db"

print("📂 Testing DOPPW Data Processing (Sheet4 only)")
print("=" * 80)

try:
    conn = sqlite3.connect(db_path)
    
    # Read smallest sheet (Sheet4 - 28K records)
    print("Loading Sheet4 (28,461 records)...")
    df = pd.read_excel(file_path, sheet_name='Sheet4')
    print(f"✅ Loaded: {len(df):,} rows")
    
    # Calculate AGE
    current_year = datetime.now().year
    df['AGE'] = df['BIRTH_YEAR'].apply(
        lambda x: current_year - int(x) if pd.notna(x) and str(x).isdigit() else None
    )
    
    # Prepare data
    print("Preparing data...")
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
    
    print("Inserting into database...")
    df_db.to_sql(
        'TBL_DOPPW_DLCDATA_MST',
        conn,
        if_exists='append',
        index=False,
        chunksize=5000
    )
    
    print(f"✅ Inserted: {len(df_db):,} records")
    
    # Verify
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) FROM TBL_DOPPW_DLCDATA_MST")
    total = cursor.fetchone()[0]
    print(f"\nTotal in database: {total:,}")
    
    # Sample data
    print("\nSample records:")
    cursor.execute("SELECT LEVEL1, ESCROLL_CATEGORY, BRANCH_STATE_NAME, SUBMISSION_STATUS FROM TBL_DOPPW_DLCDATA_MST LIMIT 5")
    for row in cursor.fetchall():
        print(f"  {row}")
    
    conn.close()
    print("\n✅ Test successful!")
    
except Exception as e:
    print(f"❌ Error: {e}")
    import traceback
    traceback.print_exc()
