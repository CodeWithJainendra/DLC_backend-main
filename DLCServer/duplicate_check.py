#!/usr/bin/env python3
"""
Duplicate Data Checker
Checks for duplicate file imports and pensioner records
"""

import sqlite3
import pandas as pd

# Connect to database
conn = sqlite3.connect('database.db')

print('='*80)
print('DUPLICATE DATA ANALYSIS REPORT')
print('='*80)

# Define our custom pensioner tables
custom_tables = [
    'bank_pensioner_data',
    'psa_pensioner_data',
    'dot_pensioner_data',
    'doppw_pensioner_data',
    'ubi3_pensioner_data',
    'ubi1_pensioner_data'
]

print('\n1. FILE IMPORT SUMMARY PER TABLE:')
print('-'*60)

for table in custom_tables:
    print(f'\n{table.upper()}:')
    
    try:
        # Get distinct file imports
        query = f"""
        SELECT file_name, COUNT(*) as record_count
        FROM {table}
        GROUP BY file_name
        ORDER BY record_count DESC
        """
        df = pd.read_sql_query(query, conn)
        print(df.to_string(index=False))
        
        # Check for duplicate files
        dup_query = f"""
        SELECT file_name, COUNT(*) as import_count
        FROM {table}
        GROUP BY file_name
        HAVING COUNT(*) > 1
        """
        dup_df = pd.read_sql_query(dup_query, conn)
        if not dup_df.empty:
            print('\n  DUPLICATE FILE IMPORTS DETECTED:')
            print(dup_df.to_string(index=False))
    except pd.errors.DatabaseError as e:
        print(f"  Error querying table: {e}")

print('\n2. POTENTIAL DUPLICATE RECORDS ACROSS TABLES:')
print('-'*60)

# Check for PPO duplicates across tables
ppo_tables = ['dot_pensioner_data', 'doppw_pensioner_data', 'ubi3_pensioner_data', 'ubi1_pensioner_data']
for table in ppo_tables:
    print(f'\nChecking {table} for duplicate PPO numbers...')
    try:
        query = f"""
        SELECT ppo_number, COUNT(*) as duplicate_count
        FROM {table}
        GROUP BY ppo_number
        HAVING COUNT(*) > 1
        """
        dup_df = pd.read_sql_query(query, conn)
        if not dup_df.empty:
            print(f'  DUPLICATE PPOS FOUND:')
            print(dup_df.head(10).to_string(index=False))  # Show first 10 duplicates
            print(f'  Total duplicate PPOs: {len(dup_df)}')
        else:
            print('  No duplicate PPO numbers found')
    except pd.errors.DatabaseError as e:
        print(f"  Error querying table: {e}")

conn.close()
