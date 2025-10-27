#!/usr/bin/env python3
"""
Complete Database Analysis
"""

import sqlite3
import pandas as pd

# Connect to database
conn = sqlite3.connect('database.db')
cursor = conn.cursor()

print("DATABASE ANALYSIS REPORT")
print("="*80)

# Get all tables
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()

print(f"Total Tables: {len(tables)}")
print("\nTABLES:")
for table in tables:
    print(f"  - {table[0]}")

print("\n" + "="*80)

# Analyze each table
for table_name in [t[0] for t in tables]:
    print(f"\nTABLE: {table_name.upper()}")
    print("-" * 60)
    
    # Get table structure
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()
    print("Columns:")
    for col in columns:
        print(f"  {col[1]} ({col[2]})")
    
    # Get row count
    cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
    count = cursor.fetchone()[0]
    print(f"Total Records: {count:,}")
    
    # Show sample data
    if count > 0:
        print("Sample Data (first 3 rows):")
        try:
            df = pd.read_sql_query(f"SELECT * FROM {table_name} LIMIT 3", conn)
            print(df.to_string(index=False))
        except Exception as e:
            print(f"Error reading sample data: {e}")
    
    print()

# Look for bank-related data specifically
print("\n" + "="*80)
print("BANK DATA ANALYSIS")
print("="*80)

# Check for bank columns in all tables
bank_related_tables = []
for table_name in [t[0] for t in tables]:
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [col[1].lower() for col in cursor.fetchall()]
    
    bank_columns = [col for col in columns if 'bank' in col or 'ifsc' in col or 'branch' in col]
    if bank_columns:
        bank_related_tables.append((table_name, bank_columns))

print("Tables with Bank-related columns:")
for table, cols in bank_related_tables:
    print(f"  {table}: {', '.join(cols)}")

conn.close()