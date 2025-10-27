#!/usr/bin/env python3
"""
Analyze Excel files in 21Oct directory to understand data structure
"""

import pandas as pd
import os
import sys
from pathlib import Path

def analyze_excel_file(file_path):
    """Analyze a single Excel file"""
    print(f"\n{'='*60}")
    print(f"Analyzing: {os.path.basename(file_path)}")
    print(f"{'='*60}")
    
    try:
        # Get all sheet names
        excel_file = pd.ExcelFile(file_path)
        sheet_names = excel_file.sheet_names
        print(f"📋 Sheets found: {len(sheet_names)}")
        
        for i, sheet_name in enumerate(sheet_names[:3]):  # Analyze first 3 sheets
            print(f"\n📄 Sheet {i+1}: '{sheet_name}'")
            print("-" * 40)
            
            try:
                # Read the sheet
                df = pd.read_excel(file_path, sheet_name=sheet_name, nrows=10)
                
                print(f"   Rows: {len(df)}")
                print(f"   Columns: {len(df.columns)}")
                print(f"   Column names: {list(df.columns)}")
                
                # Show first few rows
                if not df.empty:
                    print(f"\n   First 3 rows:")
                    for idx, row in df.head(3).iterrows():
                        print(f"   Row {idx}: {dict(row)}")
                        
            except Exception as e:
                print(f"   ❌ Error reading sheet: {e}")
                
        if len(sheet_names) > 3:
            print(f"\n... and {len(sheet_names) - 3} more sheets")
            
    except Exception as e:
        print(f"❌ Error analyzing file: {e}")

def main():
    excel_dir = Path("Excel Files/21Oct")
    
    if not excel_dir.exists():
        print(f"❌ Directory not found: {excel_dir}")
        return
    
    excel_files = list(excel_dir.glob("*.xlsx"))
    print(f"📁 Found {len(excel_files)} Excel files")
    
    # Analyze a few representative files
    sample_files = [
        "ASSAM DLC PORTAL DATA.xlsx",
        "BIHAR DLC PORTAL DATA.xlsx", 
        "HDFC.xlsx",
        "Bank of Maharashtra.xlsx"
    ]
    
    for sample_file in sample_files:
        file_path = excel_dir / sample_file
        if file_path.exists():
            analyze_excel_file(file_path)
        else:
            print(f"⚠️  Sample file not found: {sample_file}")

if __name__ == "__main__":
    main()