#!/usr/bin/env python3
"""
Calculate Total Pensioners
"""

import sqlite3

# Connect to database
conn = sqlite3.connect('database.db')
cursor = conn.cursor()

# Get counts from all pensioner tables
tables = [
    'bank_pensioner_data',
    'psa_pensioner_data',
    'dot_pensioner_data',
    'doppw_pensioner_data',
    'ubi3_pensioner_data',
    'ubi1_pensioner_data'
]

total = 0

print("PENSIONER COUNT REPORT")
print("="*60)

for table in tables:
    if table == 'psa_pensioner_data':
        # PSA table stores pensioner counts in the 'total_pensioners' column
        cursor.execute(f"SELECT SUM(total_pensioners) FROM {table}")
        count = cursor.fetchone()[0] or 0
    else:
        # Other tables store individual records
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
    
    print(f"{table.upper()}: {count:,} pensioners")
    total += count

print(f"\nTOTAL PENSIONERS: {total:,}")
conn.close()
