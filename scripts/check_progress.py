#!/usr/bin/env python3

import sqlite3
import os
from datetime import datetime

# Check database connection and record count
db_path = os.path.join(os.path.dirname(__file__), '..', 'DLC_Database.db')

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Get record count
    cursor.execute("SELECT COUNT(*) FROM pensioner_bank_master")
    count = cursor.fetchone()[0]
    
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Database record count: {count:,}")
    
    conn.close()
    
except Exception as e:
    print(f"Error checking database: {e}")