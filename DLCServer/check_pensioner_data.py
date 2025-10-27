#!/usr/bin/env python3
"""
Check DOPPW and PSA Pensioner Data
"""

import sqlite3
import pandas as pd

# Connect to database
conn = sqlite3.connect('database.db')

print("DOPPW PENSIONER DATA")
print("="*50)

# Check DOPPW table structure
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(doppw_pensioner_data)")
columns = cursor.fetchall()
print("Table Structure:")
for col in columns:
    print(f"  {col[1]} ({col[2]})")

# Get sample data from DOPPW
print("\nSample Data (first 5 rows):")
df_doppw = pd.read_sql_query("SELECT * FROM doppw_pensioner_data LIMIT 5", conn)
print(df_doppw.to_string())

# Get count
cursor.execute("SELECT COUNT(*) FROM doppw_pensioner_data")
doppw_count = cursor.fetchone()[0]
print(f"\nTotal DOPPW Records: {doppw_count:,}")

print("\n" + "="*50)
print("PSA PENSIONER DATA")
print("="*50)

# Check PSA table structure
cursor.execute("PRAGMA table_info(psa_pensioner_data)")
columns = cursor.fetchall()
print("Table Structure:")
for col in columns:
    print(f"  {col[1]} ({col[2]})")

# Get sample data from PSA
print("\nSample Data (first 5 rows):")
df_psa = pd.read_sql_query("SELECT * FROM psa_pensioner_data LIMIT 5", conn)
print(df_psa.to_string())

# Get total pensioners from PSA (sum of total_pensioners column)
cursor.execute("SELECT SUM(total_pensioners) FROM psa_pensioner_data")
psa_total = cursor.fetchone()[0] or 0
print(f"\nTotal PSA Pensioners: {psa_total:,}")

# Get number of records in PSA table
cursor.execute("SELECT COUNT(*) FROM psa_pensioner_data")
psa_records = cursor.fetchone()[0]
print(f"PSA Records (locations): {psa_records:,}")

conn.close()