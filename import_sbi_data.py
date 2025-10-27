#!/usr/bin/env python3
"""
Import SBI Data into Database
This script processes the SBI Excel file and inserts aggregated pensioner data
from both Service Pensioners and Family Pensioners sheets into a dedicated table in the database.
"""

import pandas as pd
import sqlite3
import os
from datetime import datetime
import re

def create_sbi_table(sqlite_conn):
    """Create table for SBI branch data if it doesn't exist"""
    # Drop existing table and recreate with new schema
    drop_table_query = "DROP TABLE IF EXISTS sbi_branch_pensioners;"
    
    create_table_query = """
    CREATE TABLE sbi_branch_pensioners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bank_state TEXT,
        bank_city TEXT,
        bank_name TEXT,
        bank_ifsc TEXT,
        branch_pincode TEXT,
        age_less_than_80 INTEGER,
        age_more_than_80 INTEGER,
        age_not_available INTEGER,
        grand_total INTEGER,
        pensioner_type TEXT,  -- Service Pensioners or Family Pensioners
        data_source TEXT DEFAULT 'SBI',
        import_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX idx_sbi_state ON sbi_branch_pensioners(bank_state);
    CREATE INDEX idx_sbi_city ON sbi_branch_pensioners(bank_city);
    CREATE INDEX idx_sbi_pincode ON sbi_branch_pensioners(branch_pincode);
    CREATE INDEX idx_sbi_ifsc ON sbi_branch_pensioners(bank_ifsc);
    CREATE INDEX idx_sbi_pensioner_type ON sbi_branch_pensioners(pensioner_type);
    """
    
    cursor = sqlite_conn.cursor()
    cursor.execute(drop_table_query)
    cursor.executescript(create_table_query)
    sqlite_conn.commit()
    print("✅ SBI branch pensioners table created with new schema")

def process_sbi_sheet(file_path, sheet_name):
    """Process a specific sheet from the SBI Excel file"""
    try:
        print(f"📄 Reading SBI sheet '{sheet_name}' from file: {file_path}")
        
        # Read Excel file with header row at index 1
        df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', header=1)
        print(f"📊 Found {len(df)} records in the '{sheet_name}' sheet")
        
        # Clean column names
        df.columns = df.columns.astype(str)
        
        # Clean data
        df = df.dropna(how='all')  # Remove completely empty rows
        
        # Skip empty dataframes
        if df.empty:
            print("⚠️  Sheet is empty")
            return None
            
        print(f"📋 Columns: {df.columns.tolist()}")
        
        # Add pensioner type column
        df['pensioner_type'] = sheet_name
        
        return df
        
    except Exception as e:
        print(f"❌ Error processing sheet '{sheet_name}' from {file_path}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

def insert_sbi_data(df, sqlite_conn):
    """Insert SBI data into database"""
    try:
        # Create a copy for processing
        insert_df = df.copy()
        
        # Column mapping (handle slight differences in column names)
        column_mapping = {
            'bank_state': 'BANK_STATE',
            'bank_city': 'BANK_CITY2',
            'bank_name': 'BANK_NAME',
            'bank_ifsc': 'BANK_IFSC',
            'branch_pincode': 'Branch PIN Code',  # Try this first
            'branch_pincode': 'Branch PIN CODE',  # Alternative name
            'age_less_than_80': 'AGE LESS THAN 80',
            'age_more_than_80': 'AGE MORE THAN 80',
            'age_not_available': 'AGE NOT AVAILABLE',
            'grand_total': 'Grand Total'
        }
        
        # Rename columns to match our schema
        for db_col, file_col in column_mapping.items():
            if file_col in insert_df.columns:
                insert_df = insert_df.rename(columns={file_col: db_col})
        
        # Make sure branch_pincode column exists with the correct name
        if 'branch_pincode' not in insert_df.columns:
            # Check for alternative names
            if 'Branch PIN CODE' in insert_df.columns:
                insert_df = insert_df.rename(columns={'Branch PIN CODE': 'branch_pincode'})
            elif 'Branch PIN Code' in insert_df.columns:
                insert_df = insert_df.rename(columns={'Branch PIN Code': 'branch_pincode'})
            else:
                insert_df['branch_pincode'] = None
        
        # Add data source and import date
        insert_df['data_source'] = 'SBI'
        insert_df['import_date'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        
        # Select only the columns we need for insertion
        required_columns = [
            'bank_state', 'bank_city', 'bank_name', 'bank_ifsc', 'branch_pincode',
            'age_less_than_80', 'age_more_than_80', 'age_not_available', 'grand_total',
            'pensioner_type', 'data_source', 'import_date'
        ]
        
        # Filter to only required columns that exist in the dataframe
        existing_columns = [col for col in required_columns if col in insert_df.columns]
        insert_df = insert_df[existing_columns]
        
        # Insert into database
        print("💾 Inserting SBI data into database...")
        insert_df.to_sql('sbi_branch_pensioners', sqlite_conn, if_exists='append', index=False)
        print(f"✅ Successfully inserted {len(insert_df)} SBI branch records")
        
        return len(insert_df)
        
    except Exception as e:
        print(f"❌ Error inserting SBI data into database: {str(e)}")
        import traceback
        traceback.print_exc()
        return 0

def generate_summary_report(sqlite_conn):
    """Generate a summary report of the imported data"""
    try:
        print("\n" + "="*60)
        print("📊 SBI PENSIONER DATA SUMMARY REPORT")
        print("="*60)
        
        # Overall statistics
        cursor = sqlite_conn.cursor()
        
        # Total records
        cursor.execute("SELECT COUNT(*) FROM sbi_branch_pensioners")
        total_records = cursor.fetchone()[0]
        print(f"\n📈 TOTAL BRANCH RECORDS: {total_records:,}")
        
        # By pensioner type
        cursor.execute("""
            SELECT pensioner_type, COUNT(*) as count, 
                   SUM(age_less_than_80) as less_than_80,
                   SUM(age_more_than_80) as more_than_80,
                   SUM(age_not_available) as not_available,
                   SUM(grand_total) as total_pensioners
            FROM sbi_branch_pensioners 
            GROUP BY pensioner_type
        """)
        type_results = cursor.fetchall()
        
        print(f"\n👥 BY PENSIONER TYPE:")
        for row in type_results:
            print(f"   {row[0]}: {row[1]:,} branches")
            print(f"     - Less than 80 years: {row[2]:,} pensioners")
            print(f"     - More than 80 years: {row[3]:,} pensioners")
            print(f"     - Age not available: {row[4]:,} pensioners")
            print(f"     - Total: {row[5]:,} pensioners")
        
        # Top states by branch count
        cursor.execute("""
            SELECT bank_state, COUNT(*) as branch_count, SUM(grand_total) as total_pensioners
            FROM sbi_branch_pensioners 
            GROUP BY bank_state
            ORDER BY branch_count DESC
            LIMIT 10
        """)
        state_results = cursor.fetchall()
        
        print(f"\n🌍 TOP 10 STATES BY BRANCH COUNT:")
        for i, row in enumerate(state_results):
            print(f"   {i+1}. {row[0]}: {row[1]:,} branches ({row[2]:,} pensioners)")
        
        # Age distribution summary
        cursor.execute("""
            SELECT 
                SUM(age_less_than_80) as less_than_80,
                SUM(age_more_than_80) as more_than_80,
                SUM(age_not_available) as not_available,
                SUM(grand_total) as total_pensioners
            FROM sbi_branch_pensioners
        """)
        age_results = cursor.fetchone()
        
        print(f"\n🎂 OVERALL AGE DISTRIBUTION:")
        print(f"   Less than 80 years: {age_results[0]:,} pensioners ({age_results[0]/age_results[3]*100:.1f}%)")
        print(f"   More than 80 years: {age_results[1]:,} pensioners ({age_results[1]/age_results[3]*100:.1f}%)")
        print(f"   Age not available: {age_results[2]:,} pensioners ({age_results[2]/age_results[3]*100:.1f}%)")
        print(f"   Total pensioners: {age_results[3]:,}")
        
        print("\n" + "="*60)
        
    except Exception as e:
        print(f"❌ Error generating summary report: {str(e)}")

def main():
    """Main function to process SBI data"""
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect('DLC_Database.db')
    
    # Create SBI table if it doesn't exist
    create_sbi_table(sqlite_conn)
    
    # Check if SBI data file exists
    sbi_file = 'EXCEL_DATA/SBI.xlsx'
    
    if not os.path.exists(sbi_file):
        print(f"❌ SBI file not found: {sbi_file}")
        return
    
    print(f"📁 Processing SBI data file: {sbi_file}")
    
    # Get list of sheets
    try:
        xl = pd.ExcelFile(sbi_file)
        sheets = xl.sheet_names
        print(f"📋 Found sheets: {sheets}")
    except Exception as e:
        print(f"❌ Error reading Excel file: {str(e)}")
        return
    
    total_inserted = 0
    
    # Process each sheet
    for sheet_name in sheets:
        print(f"\n📄 Processing sheet: {sheet_name}")
        
        # Process the sheet
        df = process_sbi_sheet(sbi_file, sheet_name)
        if df is not None and not df.empty:
            # Insert into database
            records_inserted = insert_sbi_data(df, sqlite_conn)
            total_inserted += records_inserted
    
    # Generate summary report
    generate_summary_report(sqlite_conn)
    
    # Close database connection
    sqlite_conn.close()
    
    print(f"\n🎉 SBI data import complete! Total records inserted: {total_inserted:,}")

if __name__ == "__main__":
    main()