#!/usr/bin/env python3

import pandas as pd
import os

def debug_bob_file():
    file_path = '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx'
    
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
    
    print(f"File exists: {file_path}")
    print(f"File size: {os.path.getsize(file_path)} bytes")
    
    try:
        print("Attempting to read file...")
        df = pd.read_excel(file_path, engine='openpyxl')
        print(f"SUCCESS: Loaded {len(df)} rows and {len(df.columns)} columns")
        
        print("Column names:")
        for i, col in enumerate(df.columns):
            print(f"  {i+1}. {col}")
            
        print("\nFirst 5 rows:")
        print(df.head())
        
    except Exception as e:
        print(f"ERROR reading file: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_bob_file()