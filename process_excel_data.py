#!/usr/bin/env python3
"""
Process Excel files and insert data into SQLite database using DuckDB + Pandas
This script processes pensioner data from various bank Excel files and organizes
the data by state, district, pincode, age categories, and PSA/PDA categories.
"""

import pandas as pd
import duckdb
import sqlite3
import os
import glob
from pathlib import Path
import re

# Bank name mapping for consistent naming
BANK_NAME_MAPPING = {
    'BOB': 'Bank of Baroda',
    'SBI': 'State Bank of India',
    'UBI': 'Union Bank of India',
    'BOI': 'Bank of India',
    'PNB': 'Punjab National Bank',
    'HDFC': 'HDFC Bank',
    'ICICI': 'ICICI Bank',
    'AXIS': 'Axis Bank',
    # Add more mappings as needed
}

def get_bank_name_from_file(filename):
    """Extract bank name from filename"""
    filename = Path(filename).stem.lower()
    
    # Check for specific bank names in filename
    for key, bank_name in BANK_NAME_MAPPING.items():
        if key.lower() in filename:
            return bank_name
    
    # If not in mapping, try to extract bank name from filename
    if 'bank' in filename:
        # Try to extract bank name (words before/after 'bank')
        parts = filename.split('bank')
        if len(parts) > 1:
            return parts[0].strip().title() + ' Bank'
        else:
            return filename.replace('bank', 'Bank').title()
    
    # Default to just the filename as bank name
    return filename.replace('_', ' ').title()

def clean_column_names(df):
    """Clean and standardize column names"""
    # Convert to string and clean
    df.columns = df.columns.astype(str)
    
    # Remove unnamed columns
    df = df.loc[:, ~df.columns.str.contains('Unnamed', case=False)]
    
    # Clean column names
    new_columns = []
    for col in df.columns:
        # Remove extra spaces and special characters
        clean_col = re.sub(r'[^\w\s]', ' ', col)
        clean_col = re.sub(r'\s+', ' ', clean_col).strip()
        new_columns.append(clean_col)
    
    df.columns = new_columns
    return df

def process_excel_file(file_path):
    """Process a single Excel file and return a cleaned DataFrame"""
    try:
        # Read Excel file
        df = pd.read_excel(file_path, engine='openpyxl')
        
        # Clean column names
        df = clean_column_names(df)
        
        # Skip empty dataframes
        if df.empty:
            print(f"⚠️  Skipping empty file: {file_path}")
            return None
            
        # Add data source column
        bank_name = get_bank_name_from_file(file_path)
        df['data_source'] = bank_name
        
        print(f"✅ Processed {file_path} - {len(df)} records")
        return df
        
    except Exception as e:
        print(f"❌ Error processing {file_path}: {str(e)}")
        return None

def create_duckdb_analysis(df, bank_name):
    """Create analysis tables using DuckDB"""
    # Connect to DuckDB in-memory
    con = duckdb.connect()
    
    # Register the dataframe
    con.register('pensioner_data', df)
    
    # Create analysis tables
    analysis_queries = {
        'by_state': """
            SELECT 
                data_source,
                state,
                COUNT(*) as pensioner_count
            FROM pensioner_data 
            WHERE state IS NOT NULL
            GROUP BY data_source, state
            ORDER BY data_source, pensioner_count DESC
        """,
        
        'by_psa': """
            SELECT 
                data_source,
                PSA,
                COUNT(*) as pensioner_count
            FROM pensioner_data 
            WHERE PSA IS NOT NULL
            GROUP BY data_source, PSA
            ORDER BY data_source, pensioner_count DESC
        """,
        
        'by_pda': """
            SELECT 
                data_source,
                PDA,
                COUNT(*) as pensioner_count
            FROM pensioner_data 
            WHERE PDA IS NOT NULL
            GROUP BY data_source, PDA
            ORDER BY data_source, pensioner_count DESC
        """,
        
        'by_postcode': """
            SELECT 
                data_source,
                pensioner_postcode,
                COUNT(*) as pensioner_count
            FROM pensioner_data 
            WHERE pensioner_postcode IS NOT NULL
            GROUP BY data_source, pensioner_postcode
            ORDER BY data_source, pensioner_count DESC
        """,
        
        'summary': """
            SELECT 
                data_source,
                COUNT(*) as total_pensioners,
                COUNT(DISTINCT state) as states_covered,
                COUNT(DISTINCT PSA) as psa_categories,
                COUNT(DISTINCT PDA) as pda_categories
            FROM pensioner_data
            GROUP BY data_source
        """
    }
    
    results = {}
    for name, query in analysis_queries.items():
        try:
            result = con.execute(query).fetchdf()
            results[name] = result
        except Exception as e:
            print(f"❌ Error in {name} analysis for {bank_name}: {str(e)}")
            results[name] = pd.DataFrame()
    
    con.close()
    return results

def insert_into_sqlite(df, sqlite_conn):
    """Insert processed data into SQLite database"""
    try:
        # Map columns to match database schema
        column_mapping = {
            'bank_name': 'data_source',
            'branch_name': 'BRANCH_NAME',  # Adjust based on actual column names
            'branch_postcode': 'Branch POST_CODE',  # Adjust based on actual column names
            'pensioner_city': 'Pensioner CITY',  # Adjust based on actual column names
            'state': 'STATE',
            'pensioner_postcode': 'Pensioner POST_CODE',
            'PDA': 'PDA',
            'PSA': 'PSA',
            'ppo_number': 'PPO NUMBER'  # Adjust based on actual column names
        }
        
        # Create a copy of the dataframe for insertion
        insert_df = df.copy()
        
        # Rename columns to match database schema (if they exist)
        for db_col, df_col in column_mapping.items():
            if df_col in insert_df.columns:
                insert_df = insert_df.rename(columns={df_col: db_col})
        
        # Add missing columns with None values
        for col in ['bank_name', 'branch_name', 'branch_postcode', 'pensioner_city', 
                   'state', 'pensioner_postcode', 'PDA', 'PSA', 'ppo_number']:
            if col not in insert_df.columns:
                insert_df[col] = None
        
        # Select only the columns we need for insertion
        insert_columns = ['bank_name', 'branch_name', 'branch_postcode', 'pensioner_city', 
                         'state', 'pensioner_postcode', 'PDA', 'PSA', 'ppo_number']
        insert_df = insert_df[insert_columns]
        
        # Insert into database
        insert_df.to_sql('pensioner_bank_master', sqlite_conn, if_exists='append', index=False)
        print(f"✅ Inserted {len(insert_df)} records into pensioner_bank_master")
        
    except Exception as e:
        print(f"❌ Error inserting into database: {str(e)}")

def main():
    """Main function to process all Excel files"""
    # Connect to SQLite database
    sqlite_conn = sqlite3.connect('DLC_Database.db')
    
    # Get all Excel files
    excel_files = glob.glob('EXCEL_DATA/*.xlsx') + glob.glob('EXCEL_DATA/*.xls')
    
    print(f"📁 Found {len(excel_files)} Excel files to process")
    
    # Process each file
    all_data = []
    analysis_results = {}
    
    for file_path in excel_files:
        print(f"\n📄 Processing: {os.path.basename(file_path)}")
        
        # Process the Excel file
        df = process_excel_file(file_path)
        if df is not None and not df.empty:
            # Store for later insertion
            all_data.append(df)
            
            # Create analysis using DuckDB
            bank_name = df['data_source'].iloc[0] if 'data_source' in df.columns else 'Unknown'
            analysis = create_duckdb_analysis(df, bank_name)
            analysis_results[bank_name] = analysis
            
            # Insert into SQLite database
            insert_into_sqlite(df, sqlite_conn)
    
    # Combine all data for overall analysis
    if all_data:
        print("\n📊 Creating overall analysis...")
        combined_df = pd.concat(all_data, ignore_index=True)
        overall_analysis = create_duckdb_analysis(combined_df, 'ALL_BANKS')
        analysis_results['ALL_BANKS'] = overall_analysis
        
        # Save analysis results
        print("\n💾 Saving analysis results...")
        with pd.ExcelWriter('pensioner_data_analysis.xlsx') as writer:
            for bank_name, analyses in analysis_results.items():
                for analysis_name, df in analyses.items():
                    if not df.empty:
                        sheet_name = f"{bank_name}_{analysis_name}"[:31]  # Excel sheet name limit
                        df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        print("✅ Analysis saved to pensioner_data_analysis.xlsx")
    
    # Close database connection
    sqlite_conn.close()
    
    print(f"\n🎉 Processing complete!")
    print(f"   Processed {len(excel_files)} files")
    print(f"   Generated analysis for {len(analysis_results)} banks")
    print(f"   Data inserted into pensioner_bank_master table")

if __name__ == "__main__":
    main()