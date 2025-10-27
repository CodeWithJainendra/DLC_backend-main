#!/usr/bin/env python3
"""
Process All Excel Files and Import Data into Database
This script automatically processes all Excel files in the EXCEL_DATA directory,
detects sheets, analyzes their structure, and imports data into appropriate database tables.
"""

import pandas as pd
import sqlite3
import os
import glob
from datetime import datetime
import re
from pathlib import Path

# Configuration
EXCEL_DATA_DIR = 'EXCEL_DATA'
DATABASE_PATH = 'DLC_Database.db'

def create_generic_data_table(sqlite_conn):
    """Create a generic table for storing Excel data with flexible schema"""
    create_table_query = """
    CREATE TABLE IF NOT EXISTS excel_import_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT,
        sheet_name TEXT,
        bank_name TEXT,
        data_source TEXT,
        row_data TEXT,  -- JSON string of all row data
        import_date DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE INDEX IF NOT EXISTS idx_excel_file ON excel_import_data(file_name);
    CREATE INDEX IF NOT EXISTS idx_excel_sheet ON excel_import_data(sheet_name);
    CREATE INDEX IF NOT EXISTS idx_excel_bank ON excel_import_data(bank_name);
    CREATE INDEX IF NOT EXISTS idx_excel_source ON excel_import_data(data_source);
    """
    
    cursor = sqlite_conn.cursor()
    cursor.executescript(create_table_query)
    sqlite_conn.commit()
    print("✅ Generic Excel data table created/verified")

def get_bank_name_from_filename(filename):
    """Extract bank name from filename"""
    # Remove extension
    filename = Path(filename).stem
    
    # Common bank name patterns
    bank_patterns = {
        'SBI': 'State Bank of India',
        'BOB': 'Bank of Baroda',
        'UBI': 'Union Bank of India',
        'BOI': 'Bank of India',
        'PNB': 'Punjab National Bank',
        'HDFC': 'HDFC Bank',
        'ICICI': 'ICICI Bank',
        'AXIS': 'Axis Bank',
        'CANARA': 'Canara Bank',
        'CENTRAL_BANK': 'Central Bank of India',
        'INDIAN_BANK': 'Indian Bank',
        'INDIAN_OVERSEAS': 'Indian Overseas Bank',
        'KOTAK': 'Kotak Mahindra Bank',
        'IDBI': 'IDBI Bank',
        'UCO': 'UCO Bank',
        'PUNJAB_SIND': 'Punjab & Sind Bank',
        'BANDHAN': 'Bandhan Bank',
        'JK_BANK': 'Jammu & Kashmir Bank',
        'STATE_BANK_OF_INDIA': 'State Bank of India',
        'DASHBORAD_DLC_DATA': 'DLC Dashboard Data',
        'DOT_PENSIONERS': 'Department of Telecommunications',
        'DOOPW_DATA': 'DOPPW Data'
    }
    
    # Check for exact matches
    filename_upper = filename.upper().replace(' ', '_')
    for pattern, bank_name in bank_patterns.items():
        if pattern in filename_upper:
            return bank_name
    
    # If no pattern matches, return the filename as bank name
    return filename.replace('_', ' ').title()

def process_excel_file(file_path, sqlite_conn):
    """Process a single Excel file and import all its sheets"""
    try:
        filename = os.path.basename(file_path)
        print(f"\n📄 Processing file: {filename}")
        
        # Get bank name from filename
        bank_name = get_bank_name_from_filename(filename)
        print(f"🏦 Identified bank: {bank_name}")
        
        # Read Excel file to get sheet names
        try:
            xl = pd.ExcelFile(file_path)
            sheets = xl.sheet_names
            print(f"📋 Found {len(sheets)} sheet(s): {sheets}")
        except Exception as e:
            print(f"❌ Error reading Excel file structure: {str(e)}")
            return 0
        
        total_records = 0
        
        # Process each sheet
        for sheet_name in sheets:
            print(f"  📄 Processing sheet: {sheet_name}")
            
            try:
                # Try different header positions
                df = None
                header_found = False
                
                # Try headers at different positions (0, 1, 2, 3)
                for header_row in range(4):
                    try:
                        temp_df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', header=header_row, nrows=5)
                        if len(temp_df.columns) > 2:  # At least 3 columns to be meaningful
                            df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', header=header_row)
                            header_found = True
                            print(f"    ✅ Header found at row {header_row}")
                            break
                    except:
                        continue
                
                if not header_found:
                    # If no header found, read without header
                    df = pd.read_excel(file_path, sheet_name=sheet_name, engine='openpyxl', header=None)
                    print(f"    ⚠️  No header found, reading without header")
                
                # Clean data
                df = df.dropna(how='all')  # Remove completely empty rows
                df = df.dropna(how='all', axis=1)  # Remove completely empty columns
                
                if df.empty:
                    print(f"    ⚠️  Sheet is empty")
                    continue
                
                print(f"    📊 Found {len(df)} records with {len(df.columns)} columns")
                
                # Convert all data to strings and create JSON representation
                df_str = df.astype(str)
                json_records = df_str.to_json(orient='records')
                
                # Insert into database
                cursor = sqlite_conn.cursor()
                insert_query = """
                INSERT INTO excel_import_data (file_name, sheet_name, bank_name, data_source, row_data)
                VALUES (?, ?, ?, ?, ?)
                """
                
                cursor.execute(insert_query, (filename, sheet_name, bank_name, 'EXCEL_IMPORT', json_records))
                sqlite_conn.commit()
                
                records_inserted = len(df)
                total_records += records_inserted
                print(f"    ✅ Inserted {records_inserted} records")
                
            except Exception as e:
                print(f"    ❌ Error processing sheet '{sheet_name}': {str(e)}")
                continue
        
        print(f"  📈 Total records inserted from {filename}: {total_records}")
        return total_records
        
    except Exception as e:
        print(f"❌ Error processing file {file_path}: {str(e)}")
        return 0

def create_analysis_view(sqlite_conn):
    """Create a view for easier data analysis"""
    create_view_query = """
    CREATE VIEW IF NOT EXISTS excel_data_summary AS
    SELECT 
        file_name,
        sheet_name,
        bank_name,
        data_source,
        LENGTH(row_data) as data_size,
        import_date
    FROM excel_import_data
    ORDER BY import_date DESC, file_name, sheet_name;
    """
    
    try:
        cursor = sqlite_conn.cursor()
        cursor.execute(create_view_query)
        sqlite_conn.commit()
        print("✅ Analysis view created/verified")
    except Exception as e:
        print(f"❌ Error creating analysis view: {str(e)}")

def generate_summary_report(sqlite_conn):
    """Generate a summary report of all imported data"""
    try:
        print("\n" + "="*80)
        print("📊 EXCEL DATA IMPORT SUMMARY REPORT")
        print("="*80)
        
        cursor = sqlite_conn.cursor()
        
        # Total files processed
        cursor.execute("SELECT COUNT(DISTINCT file_name) FROM excel_import_data")
        total_files = cursor.fetchone()[0]
        print(f"\n📁 TOTAL FILES PROCESSED: {total_files}")
        
        # Total sheets
        cursor.execute("SELECT COUNT(DISTINCT file_name || '|' || sheet_name) FROM excel_import_data")
        total_sheets = cursor.fetchone()[0]
        print(f"📄 TOTAL SHEETS PROCESSED: {total_sheets}")
        
        # Total banks
        cursor.execute("SELECT COUNT(DISTINCT bank_name) FROM excel_import_data")
        total_banks = cursor.fetchone()[0]
        print(f"🏦 TOTAL BANKS/ORGANIZATIONS: {total_banks}")
        
        # Top banks by file count
        cursor.execute("""
            SELECT bank_name, COUNT(DISTINCT file_name) as file_count
            FROM excel_import_data
            GROUP BY bank_name
            ORDER BY file_count DESC
            LIMIT 10
        """)
        top_banks = cursor.fetchall()
        print(f"\n🏆 TOP 10 BANKS BY FILE COUNT:")
        for i, (bank, count) in enumerate(top_banks):
            print(f"   {i+1}. {bank}: {count} files")
        
        # Files with most sheets
        cursor.execute("""
            SELECT file_name, COUNT(DISTINCT sheet_name) as sheet_count
            FROM excel_import_data
            GROUP BY file_name
            ORDER BY sheet_count DESC
            LIMIT 10
        """)
        top_files = cursor.fetchall()
        print(f"\n📚 FILES WITH MOST SHEETS:")
        for i, (file, count) in enumerate(top_files):
            print(f"   {i+1}. {file}: {count} sheets")
        
        # Recent imports
        cursor.execute("""
            SELECT file_name, sheet_name, bank_name, import_date
            FROM excel_import_data
            ORDER BY import_date DESC
            LIMIT 10
        """)
        recent_imports = cursor.fetchall()
        print(f"\n⏱️  RECENTLY PROCESSED FILES:")
        for file, sheet, bank, date in recent_imports:
            print(f"   {file} [{sheet}] - {bank} ({date})")
        
        print("\n" + "="*80)
        
    except Exception as e:
        print(f"❌ Error generating summary report: {str(e)}")

def main():
    """Main function to process all Excel files"""
    print("🚀 Starting Excel data import process...")
    print(f"📂 Looking for Excel files in: {EXCEL_DATA_DIR}")
    
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect(DATABASE_PATH)
    
    # Create generic data table
    create_generic_data_table(sqlite_conn)
    
    # Create analysis view
    create_analysis_view(sqlite_conn)
    
    # Get all Excel files
    excel_patterns = ['*.xlsx', '*.xls']
    excel_files = []
    
    for pattern in excel_patterns:
        excel_files.extend(glob.glob(os.path.join(EXCEL_DATA_DIR, pattern)))
    
    print(f"📁 Found {len(excel_files)} Excel files to process")
    
    # Sort files for consistent processing order
    excel_files.sort()
    
    # Process each file
    total_records = 0
    processed_files = 0
    
    for file_path in excel_files:
        records_inserted = process_excel_file(file_path, sqlite_conn)
        if records_inserted > 0:
            total_records += records_inserted
            processed_files += 1
    
    # Generate summary report
    generate_summary_report(sqlite_conn)
    
    # Close database connection
    sqlite_conn.close()
    
    print(f"\n🎉 Excel data import complete!")
    print(f"   Processed {processed_files} files")
    print(f"   Total records imported: {total_records:,}")

if __name__ == "__main__":
    main()