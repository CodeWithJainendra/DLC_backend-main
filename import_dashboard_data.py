#!/usr/bin/env python3
"""
Import Dashboard Data into TBL_DOPPW_DLCDATA_MST table
This script processes the dashboard Excel file and inserts data into the 
TBL_DOPPW_DLCDATA_MST table with proper mapping of columns.
"""

import pandas as pd
import sqlite3
import os
from datetime import datetime
import re

def clean_column_names(df):
    """Clean and standardize column names"""
    # Convert to string and clean
    df.columns = df.columns.astype(str)
    
    # Clean column names - remove extra spaces and special characters
    new_columns = []
    for col in df.columns:
        # Remove extra spaces and special characters
        clean_col = re.sub(r'[^\w\s]', ' ', col)
        clean_col = re.sub(r'\s+', ' ', clean_col).strip()
        new_columns.append(clean_col)
    
    df.columns = new_columns
    return df

def calculate_age(birth_year):
    """Calculate age from birth year"""
    if pd.isna(birth_year) or birth_year == '':
        return None
    try:
        current_year = datetime.now().year
        birth_year = int(birth_year)
        return current_year - birth_year
    except:
        return None

def process_dashboard_file(file_path):
    """Process the dashboard Excel file"""
    try:
        print(f"📄 Reading file: {file_path}")
        
        # Read Excel file
        df = pd.read_excel(file_path, engine='openpyxl')
        print(f"📊 Found {len(df)} records in the file")
        
        # Clean column names
        df = clean_column_names(df)
        print(f"📋 Columns: {df.columns.tolist()}")
        
        # Skip empty dataframes
        if df.empty:
            print("⚠️  File is empty")
            return None
            
        return df
        
    except Exception as e:
        print(f"❌ Error processing {file_path}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def map_columns_and_insert(df, sqlite_conn):
    """Map columns and insert data into TBL_DOPPW_DLCDATA_MST table"""
    try:
        # Create a copy for mapping
        insert_df = df.copy()
        
        # Column mapping from your data structure to database table
        column_mapping = {
            'LEVEL1': 'GCODE',  # GCODE maps to LEVEL1
            'ESCROLL_CATEGORY': 'ESCROLL_CAT',
            'GROUP_ID': 'GID',
            'PENSION_TYPE': 'PENSION_TYPE',
            'BRANCH_CODE': 'BRANCH_CODE',
            'BRANCH_NAME': 'BRANCH_NAME',
            'BRANCH_PINCODE': 'BRANCH_PIN',  # BRANCH_PIN maps to BRANCH_PINCODE
            'BRANCH_STATE_NAME': 'BRANCH_STATE',  # BRANCH_STATE maps to BRANCH_STATE_NAME
            'YEAR_OF_BIRTH': 'BIRTH_YEAR',  # BIRTH_YEAR maps to YEAR_OF_BIRTH
            'SUBMISSION_STATUS': 'SUBMITTED_STATUS',  # SUBMITTED_STATUS maps to SUBMISSION_STATUS
            'WAIVER_TILL': 'WAIVER_UPTO',  # WAIVER_UPTO maps to WAIVER_TILL
            'SUBMISSION_MODE': 'SUBMISSION_MODE',
            'VERIFICATION_TYPE': 'VERIFICATION_TYPE',
            'CERTIFICATE_SUBMISSION_DATE': 'CERTIFICATE_SUBMISSION_DATE',
            'PENSIONER_PINCODE': 'PENSIONER PINCODE',  # PENSIONER PINCODE maps to PENSIONER_PINCODE
            'PENSIONER_DISTRICT_NAME': 'PENSIONER DISTNAME',  # PENSIONER DISTNAME maps to PENSIONER_DISTRICT_NAME
            'PENSIONER_STATE_NAME': 'PENSIONER STATENAME'  # PENSIONER STATENAME maps to PENSIONER_STATE_NAME
        }
        
        # Rename columns to match database schema
        for db_col, file_col in column_mapping.items():
            if file_col in insert_df.columns:
                insert_df = insert_df.rename(columns={file_col: db_col})
        
        # Add missing columns with None values
        required_columns = [
            'LEVEL1', 'ESCROLL_CATEGORY', 'GROUP_ID', 'PENSION_TYPE', 'BRANCH_CODE',
            'BRANCH_NAME', 'BRANCH_PINCODE', 'BRANCH_STATE_CODE', 'BRANCH_STATE_NAME',
            'BRANCH_DISTRICT_CODE', 'BRANCH_DISTRICT_NAME', 'CPPC_CODE', 'CPPC_NAME',
            'YEAR_OF_BIRTH', 'AGE', 'SUBMISSION_STATUS', 'SUBMISSION_MODE', 'WAIVER_TILL',
            'VERIFICATION_TYPE', 'PENSIONER_PINCODE', 'PENSIONER_DISTRICT_CODE',
            'PENSIONER_DISTRICT_NAME', 'PENSIONER_STATE_CODE', 'PENSIONER_STATE_NAME',
            'CERTIFICATE_SUBMISSION_DATE', 'CERTIFICATE_AUTHORIZATION_DATE', 'ACCOUNT_NUMBER',
            'CIF_NUMBER', 'PPO_UNIQUE_ID', 'DATA_DATE', 'BATCH_ID'
        ]
        
        for col in required_columns:
            if col not in insert_df.columns:
                insert_df[col] = None
        
        # Calculate age from birth year
        if 'YEAR_OF_BIRTH' in insert_df.columns:
            insert_df['AGE'] = insert_df['YEAR_OF_BIRTH'].apply(calculate_age)
        
        # Add data date and batch ID
        insert_df['DATA_DATE'] = datetime.now().strftime('%Y-%m-%d')
        insert_df['BATCH_ID'] = 1  # Default batch ID
        
        # Select only the columns we need for insertion (only those that exist)
        existing_columns = [col for col in required_columns if col in insert_df.columns]
        insert_df = insert_df[existing_columns]
        
        # Insert into database
        print("💾 Inserting data into TBL_DOPPW_DLCDATA_MST...")
        insert_df.to_sql('TBL_DOPPW_DLCDATA_MST', sqlite_conn, if_exists='append', index=False)
        print(f"✅ Successfully inserted {len(insert_df)} records into TBL_DOPPW_DLCDATA_MST")
        
        # Print summary statistics
        print("\n📈 Summary:")
        print(f"   Total records inserted: {len(insert_df)}")
        if 'LEVEL1' in insert_df.columns:
            gcode_counts = insert_df['LEVEL1'].value_counts()
            print(f"   GCODE distribution:")
            for gcode, count in gcode_counts.items():
                print(f"     {gcode}: {count} records")
        if 'SUBMISSION_STATUS' in insert_df.columns:
            status_counts = insert_df['SUBMISSION_STATUS'].value_counts()
            print(f"   Submission status distribution:")
            for status, count in status_counts.items():
                print(f"     {status}: {count} records")
        if 'SUBMISSION_MODE' in insert_df.columns:
            mode_counts = insert_df['SUBMISSION_MODE'].value_counts()
            print(f"   Submission mode distribution:")
            for mode, count in mode_counts.items():
                print(f"     {mode}: {count} records")
        
        return len(insert_df)
        
    except Exception as e:
        print(f"❌ Error inserting into database: {str(e)}")
        import traceback
        traceback.print_exc()
        return 0

def main():
    """Main function to process dashboard data"""
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect('DLC_Database.db')
    
    # Check if dashboard data file exists
    dashboard_file = 'EXCEL_DATA/Dashborad_DLC_Data_.xlsx'
    
    if not os.path.exists(dashboard_file):
        print(f"❌ Dashboard file not found: {dashboard_file}")
        return
    
    print(f"📁 Processing dashboard data file: {dashboard_file}")
    
    # Process the dashboard file
    df = process_dashboard_file(dashboard_file)
    if df is not None and not df.empty:
        # Insert into database
        records_inserted = map_columns_and_insert(df, sqlite_conn)
    
    # Close database connection
    sqlite_conn.close()
    
    print(f"\n🎉 Dashboard data import complete!")

if __name__ == "__main__":
    main()