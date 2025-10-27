#!/usr/bin/env python3
import sqlite3
import sys

try:
    conn = sqlite3.connect('database.db', timeout=10)
    cursor = conn.cursor()
    
    # Get all tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    tables = cursor.fetchall()
    
    print("📊 DATABASE TABLES:")
    print("=" * 60)
    for table in tables:
        table_name = table[0]
        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
        count = cursor.fetchone()[0]
        print(f"  {table_name}: {count} records")
    
    print("\n📋 TABLE SCHEMAS:")
    print("=" * 60)
    for table in tables:
        table_name = table[0]
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        print(f"\n{table_name}:")
        for col in columns:
            print(f"  - {col[1]} ({col[2]})")
    
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
