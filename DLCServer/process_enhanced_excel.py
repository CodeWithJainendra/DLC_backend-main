#!/usr/bin/env python3
"""
Process Excel files with enhanced pensioner data format
Handles the new detailed format with complete addresses
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime
import re
import numpy as np

class EnhancedExcelProcessor:
    def __init__(self, db_path="database.db"):
        self.db_path = db_path
        self.processed_files = []
        self.total_records = 0
        self.errors = []
        
    def connect_db(self):
        """Connect to SQLite database"""
        return sqlite3.connect(self.db_path)
    
    def extract_detailed_address_info(self, address_text):
        """Extract detailed information from address"""
        if pd.isna(address_text):
            return {
                'pincode': None,
                'district': None,
                'state': None,
                'full_address': None
            }
        
        try:
            address_str = str(address_text).strip()
            
            # Extract pincode (6 digits)
            pincode_patterns = [
                r'Pin-?\s*(\d{6})',
                r'PIN-?\s*(\d{6})',
                r'Pincode-?\s*(\d{6})',
                r'(\d{6})$',
                r'-\s*(\d{6})',
                r'\b(\d{6})\b'
            ]
            
            pincode = None
            for pattern in pincode_patterns:
                match = re.search(pattern, address_str)
                if match:
                    pincode = match.group(1)
                    break
            
            # Extract state (common Indian states)
            states = [
                'HARYANA', 'PUNJAB', 'UTTAR PRADESH', 'BIHAR', 'WEST BENGAL',
                'ODISHA', 'JHARKHAND', 'CHHATTISGARH', 'MADHYA PRADESH',
                'RAJASTHAN', 'GUJARAT', 'MAHARASHTRA', 'KARNATAKA', 'KERALA',
                'TAMIL NADU', 'ANDHRA PRADESH', 'TELANGANA', 'ASSAM',
                'MEGHALAYA', 'MANIPUR', 'MIZORAM', 'NAGALAND', 'TRIPURA',
                'ARUNACHAL PRADESH', 'SIKKIM', 'HIMACHAL PRADESH',
                'UTTARAKHAND', 'JAMMU AND KASHMIR', 'DELHI', 'GOA'
            ]
            
            state = None
            address_upper = address_str.upper()
            for state_name in states:
                if state_name in address_upper:
                    state = state_name
                    break
            
            # Extract district (words before state and after comma)
            district = None
            if state:
                # Look for pattern: ..., District, State
                pattern = r',\s*([^,]+),\s*' + re.escape(state)
                match = re.search(pattern, address_upper)
                if match:
                    district = match.group(1).strip()
            
            return {
                'pincode': pincode,
                'district': district,
                'state': state,
                'full_address': address_str
            }
            
        except Exception as e:
            return {
                'pincode': None,
                'district': None,
                'state': None,
                'full_address': str(address_text) if not pd.isna(address_text) else None
            }
    
    def calculate_age(self, birth_year):
        """Calculate age from birth year"""
        if birth_year is None:
            return None
        try:
            current_year = datetime.now().year
            return current_year - int(birth_year)
        except:
            return None
    
    def identify_pension_type(self, ppo_no, psa):
        """Identify pension type from PPO number and PSA"""
        if pd.isna(ppo_no):
            return 'UNKNOWN'
        
        ppo_str = str(ppo_no).upper()
        psa_str = str(psa).upper() if not pd.isna(psa) else ''
        
        if 'POSTAL' in ppo_str:
            return 'POSTAL'
        elif 'RAILWAY' in ppo_str or 'RAIL' in psa_str:
            return 'RAILWAY'
        elif 'DEFENCE' in psa_str or 'MILITARY' in psa_str:
            return 'DEFENCE'
        elif 'CPAO' in psa_str:
            return 'CENTRAL_GOVT'
        elif 'STATE' in psa_str:
            return 'STATE_GOVT'
        else:
            return 'PENSION'
    
    def process_excel_file(self, file_path):
        """Process a single Excel file with enhanced format"""
        filename = os.path.basename(file_path)
        print(f"\n📄 Processing Enhanced Excel: {filename}")
        print("-" * 50)
        
        try:
            # Read the Excel file
            excel_file = pd.ExcelFile(file_path)
            sheet_names = excel_file.sheet_names
            
            file_records = 0
            
            for sheet_name in sheet_names:
                try:
                    # Read the sheet
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    
                    if df.empty:
                        print(f"   📋 Sheet '{sheet_name}': Empty, skipping")
                        continue
                    
                    print(f"   📋 Sheet '{sheet_name}': {len(df)} rows")
                    
                    # Process the sheet data
                    sheet_records = self.process_enhanced_sheet(df, filename, sheet_name)
                    file_records += sheet_records
                    
                except Exception as e:
                    error_msg = f"Error processing sheet '{sheet_name}' in {filename}: {e}"
                    print(f"   ❌ {error_msg}")
                    self.errors.append(error_msg)
            
            print(f"   ✅ Processed {file_records} records from {filename}")
            self.processed_files.append(filename)
            self.total_records += file_records
            
        except Exception as e:
            error_msg = f"Error processing file {filename}: {e}"
            print(f"❌ {error_msg}")
            self.errors.append(error_msg)
    
    def process_enhanced_sheet(self, df, filename, sheet_name):
        """Process enhanced format sheet data"""
        records_inserted = 0
        
        try:
            # Find the header row
            header_row = 0
            for idx, row in df.head(5).iterrows():
                row_str = ' '.join([str(val) for val in row.values if pd.notna(val)]).upper()
                if 'PPO' in row_str and ('BIRTH' in row_str or 'YEAR' in row_str):
                    header_row = idx
                    break
            
            # Skip to data rows
            data_df = df.iloc[header_row + 1:].copy()
            
            if data_df.empty:
                return 0
            
            # Identify columns
            columns = df.columns.tolist()
            
            # Expected columns for enhanced format:
            # S.No, PPO No., Year of Birth, Pension Sanctioning Authority, 
            # Address PinCode of Pension Disbursing Branch, Postal Address PinCode of pensioner
            
            print(f"      📊 Available columns: {len(columns)}")
            print(f"      📊 Column headers from row {header_row}:")
            
            # Map columns based on position and content
            col_mapping = {}
            
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                print(f"         Col {i}: {header_text}")
                
                if 'S.' in header_text and 'NO' in header_text:
                    col_mapping['s_no'] = col
                elif 'PPO' in header_text:
                    col_mapping['ppo_no'] = col
                elif 'BIRTH' in header_text or 'YEAR' in header_text:
                    col_mapping['birth_year'] = col
                elif 'SANCTION' in header_text or 'AUTHORITY' in header_text:
                    col_mapping['psa'] = col
                elif 'DISBURSING' in header_text or 'BRANCH' in header_text:
                    col_mapping['branch_address'] = col
                elif 'POSTAL' in header_text or 'PENSIONER' in header_text:
                    col_mapping['pensioner_address'] = col
            
            # If not found by header, use positional mapping
            if len(col_mapping) < 4:
                print(f"      📊 Using positional mapping...")
                if len(columns) >= 6:
                    col_mapping = {
                        's_no': columns[0],
                        'ppo_no': columns[1],
                        'birth_year': columns[2],
                        'psa': columns[3],
                        'branch_address': columns[4],
                        'pensioner_address': columns[5]
                    }
            
            print(f"      📊 Final column mapping: {col_mapping}")
            
            # Connect to database
            conn = self.connect_db()
            cursor = conn.cursor()
            
            # Process each row
            for idx, row in data_df.iterrows():
                try:
                    # Skip empty rows
                    if row.isna().all():
                        continue
                    
                    # Extract data
                    ppo_no = str(row[col_mapping.get('ppo_no', columns[1])]).strip() if col_mapping.get('ppo_no') and pd.notna(row[col_mapping.get('ppo_no', columns[1])]) else None
                    
                    # Skip if no PPO number
                    if not ppo_no or ppo_no == 'nan':
                        continue
                    
                    birth_year_val = row[col_mapping.get('birth_year', columns[2])] if col_mapping.get('birth_year') else None
                    birth_year = int(birth_year_val) if pd.notna(birth_year_val) else None
                    age = self.calculate_age(birth_year)
                    
                    psa = str(row[col_mapping.get('psa', columns[3])]).strip() if col_mapping.get('psa') and pd.notna(row[col_mapping.get('psa', columns[3])]) else None
                    
                    branch_address = str(row[col_mapping.get('branch_address', columns[4])]).strip() if col_mapping.get('branch_address') and pd.notna(row[col_mapping.get('branch_address', columns[4])]) else None
                    
                    pensioner_address = str(row[col_mapping.get('pensioner_address', columns[5])]).strip() if col_mapping.get('pensioner_address') and pd.notna(row[col_mapping.get('pensioner_address', columns[5])]) else None
                    
                    # Extract address details
                    branch_info = self.extract_detailed_address_info(branch_address)
                    pensioner_info = self.extract_detailed_address_info(pensioner_address)
                    
                    # Identify pension type
                    pension_type = self.identify_pension_type(ppo_no, psa)
                    
                    # Insert into database
                    cursor.execute("""
                        INSERT INTO doppw_pensioner_data (
                            file_name, sheet_name, gcode, pension_type,
                            branch_pincode, branch_state,
                            birth_year, age,
                            pensioner_pincode, pensioner_district, pensioner_state,
                            created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        filename,
                        sheet_name,
                        ppo_no,
                        pension_type,
                        branch_info['pincode'],
                        branch_info['state'],
                        birth_year,
                        age,
                        pensioner_info['pincode'],
                        pensioner_info['district'],
                        pensioner_info['state'],
                        datetime.now()
                    ))
                    
                    records_inserted += 1
                    
                except Exception as e:
                    print(f"      ⚠️  Error processing row {idx}: {e}")
                    continue
            
            # Commit changes
            conn.commit()
            conn.close()
            
            print(f"      ✅ Inserted {records_inserted} records")
            
        except Exception as e:
            print(f"      ❌ Error processing sheet data: {e}")
            
        return records_inserted
    
    def process_directory(self, directory_path):
        """Process all Excel files in a directory"""
        dir_path = Path(directory_path)
        
        if not dir_path.exists():
            print(f"❌ Directory not found: {dir_path}")
            return
        
        excel_files = list(dir_path.glob("*.xlsx")) + list(dir_path.glob("*.xls"))
        print(f"📁 Found {len(excel_files)} Excel files in {directory_path}")
        
        if len(excel_files) == 0:
            print("⚠️  No Excel files found")
            return
        
        print("=" * 60)
        
        for file_path in excel_files:
            self.process_excel_file(file_path)
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 ENHANCED PROCESSING SUMMARY")
        print("=" * 60)
        print(f"✅ Files processed: {len(self.processed_files)}")
        print(f"📝 Total records inserted: {self.total_records}")
        
        if self.errors:
            print(f"⚠️  Errors encountered: {len(self.errors)}")
            for error in self.errors[:3]:
                print(f"   - {error}")
            if len(self.errors) > 3:
                print(f"   ... and {len(self.errors) - 3} more errors")

def main():
    processor = EnhancedExcelProcessor()
    
    print("🚀 ENHANCED EXCEL PROCESSOR")
    print("=" * 50)
    print("This processor handles the new detailed format with:")
    print("- Complete addresses")
    print("- Detailed pincode extraction")
    print("- State and district parsing")
    print("- Enhanced pension type identification")
    print("")
    
    # Check if there are any new Excel files to process
    excel_dirs = [
        "Excel Files/21Oct",
        "Excel Files",
        "."
    ]
    
    for excel_dir in excel_dirs:
        if Path(excel_dir).exists():
            excel_files = list(Path(excel_dir).glob("*.xlsx")) + list(Path(excel_dir).glob("*.xls"))
            if excel_files:
                print(f"📁 Found Excel files in: {excel_dir}")
                choice = input(f"Process files in {excel_dir}? (y/n): ").lower().strip()
                if choice == 'y':
                    processor.process_directory(excel_dir)
                    break
    
    if processor.total_records == 0:
        print("📝 No files processed. To process Excel files:")
        print("   1. Place Excel files in 'Excel Files' directory")
        print("   2. Run this script again")
        print("   3. Or specify a directory path")

if __name__ == "__main__":
    main()