#!/usr/bin/env python3
"""
Comprehensive Data Processor for all pensioner data formats
Handles both simple and enhanced formats automatically
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime
import re
import numpy as np

class ComprehensiveDataProcessor:
    def __init__(self, db_path="database.db"):
        self.db_path = db_path
        self.processed_files = []
        self.total_records = 0
        self.errors = []
        
    def connect_db(self):
        """Connect to SQLite database"""
        return sqlite3.connect(self.db_path)
    
    def detect_data_format(self, df, sheet_name="Sheet1"):
        """Detect the format of the data"""
        print(f"   🔍 Detecting data format for sheet: {sheet_name}")
        
        # Look at first few rows to identify format
        sample_text = ""
        for idx in range(min(5, len(df))):
            row_text = ' '.join([str(val) for val in df.iloc[idx].values if pd.notna(val)])
            sample_text += row_text.upper() + " "
        
        print(f"   📝 Sample text: {sample_text[:200]}...")
        
        # Enhanced format indicators
        enhanced_indicators = [
            'PENSION SANCTIONING AUTHORITY',
            'ADDRESS PINCODE OF PENSION DISBURSING BRANCH',
            'POSTAL ADDRESS PINCODE OF PENSIONER',
            'CENTRAL PENSION ACCOUNTING OFFICE',
            'CPAO'
        ]
        
        # Simple format indicators
        simple_indicators = [
            'PPO NO',
            'YEAR OF BIRTH',
            'POSTAL/',
            'STATE:',
            'DISTRICT:'
        ]
        
        enhanced_score = sum(1 for indicator in enhanced_indicators if indicator in sample_text)
        simple_score = sum(1 for indicator in simple_indicators if indicator in sample_text)
        
        if enhanced_score >= 2:
            format_type = "ENHANCED"
        elif simple_score >= 2:
            format_type = "SIMPLE"
        else:
            # Default detection based on column count
            if len(df.columns) >= 6:
                format_type = "ENHANCED"
            else:
                format_type = "SIMPLE"
        
        print(f"   📊 Detected format: {format_type} (Enhanced: {enhanced_score}, Simple: {simple_score})")
        return format_type
    
    def extract_detailed_address_info(self, address_text):
        """Extract detailed information from address"""
        if pd.isna(address_text):
            return {'pincode': None, 'district': None, 'state': None, 'full_address': None}
        
        try:
            address_str = str(address_text).strip()
            
            # Extract pincode
            pincode_patterns = [
                r'Pin-?\s*(\d{6})', r'PIN-?\s*(\d{6})', r'Pincode-?\s*(\d{6})',
                r'(\d{6})$', r'-\s*(\d{6})', r'\b(\d{6})\b'
            ]
            
            pincode = None
            for pattern in pincode_patterns:
                match = re.search(pattern, address_str)
                if match:
                    pincode = match.group(1)
                    break
            
            # Extract state
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
            
            # Extract district
            district = None
            if state:
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
                'pincode': None, 'district': None, 'state': None,
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
    
    def extract_year_from_birth(self, birth_value):
        """Extract year from various birth date formats"""
        if pd.isna(birth_value):
            return None
            
        try:
            if isinstance(birth_value, datetime):
                return birth_value.year
                
            birth_str = str(birth_value).strip()
            
            # Try different date formats
            date_formats = ['%d-%m-%Y', '%d/%m/%Y', '%Y-%m-%d', '%Y/%m/%d', '%d.%m.%Y']
            
            for fmt in date_formats:
                try:
                    date_obj = datetime.strptime(birth_str, fmt)
                    return date_obj.year
                except ValueError:
                    continue
            
            # Try to extract just the year
            year_match = re.search(r'\b(19|20)\d{2}\b', birth_str)
            if year_match:
                return int(year_match.group())
                
            return None
            
        except Exception as e:
            return None
    
    def identify_pension_type(self, ppo_no, psa):
        """Identify pension type"""
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
    
    def process_enhanced_format(self, df, filename, sheet_name):
        """Process enhanced format data"""
        print(f"      📊 Processing as ENHANCED format")
        records_inserted = 0
        
        try:
            # Find header row
            header_row = 0
            for idx, row in df.head(5).iterrows():
                row_str = ' '.join([str(val) for val in row.values if pd.notna(val)]).upper()
                if 'PPO' in row_str and ('BIRTH' in row_str or 'YEAR' in row_str):
                    header_row = idx
                    break
            
            data_df = df.iloc[header_row + 1:].copy()
            if data_df.empty:
                return 0
            
            columns = df.columns.tolist()
            
            # Map columns for enhanced format
            col_mapping = {}
            for i, col in enumerate(columns):
                if i < len(df.iloc[header_row]):
                    header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                    
                    if 'PPO' in header_text:
                        col_mapping['ppo_no'] = col
                    elif 'BIRTH' in header_text or 'YEAR' in header_text:
                        col_mapping['birth_year'] = col
                    elif 'SANCTION' in header_text or 'AUTHORITY' in header_text:
                        col_mapping['psa'] = col
                    elif 'DISBURSING' in header_text or 'BRANCH' in header_text:
                        col_mapping['branch_address'] = col
                    elif 'POSTAL' in header_text or 'PENSIONER' in header_text:
                        col_mapping['pensioner_address'] = col
            
            # Fallback to positional mapping
            if len(col_mapping) < 4 and len(columns) >= 6:
                col_mapping = {
                    'ppo_no': columns[1],
                    'birth_year': columns[2],
                    'psa': columns[3],
                    'branch_address': columns[4],
                    'pensioner_address': columns[5]
                }
            
            conn = self.connect_db()
            cursor = conn.cursor()
            
            for idx, row in data_df.iterrows():
                try:
                    if row.isna().all():
                        continue
                    
                    ppo_no = str(row[col_mapping.get('ppo_no', columns[1])]).strip() if col_mapping.get('ppo_no') and pd.notna(row[col_mapping.get('ppo_no', columns[1])]) else None
                    
                    if not ppo_no or ppo_no == 'nan':
                        continue
                    
                    birth_year_val = row[col_mapping.get('birth_year', columns[2])] if col_mapping.get('birth_year') else None
                    birth_year = self.extract_year_from_birth(birth_year_val)
                    age = self.calculate_age(birth_year)
                    
                    psa = str(row[col_mapping.get('psa', columns[3])]).strip() if col_mapping.get('psa') and pd.notna(row[col_mapping.get('psa', columns[3])]) else None
                    
                    branch_address = str(row[col_mapping.get('branch_address', columns[4])]).strip() if col_mapping.get('branch_address') and pd.notna(row[col_mapping.get('branch_address', columns[4])]) else None
                    
                    pensioner_address = str(row[col_mapping.get('pensioner_address', columns[5])]).strip() if col_mapping.get('pensioner_address') and pd.notna(row[col_mapping.get('pensioner_address', columns[5])]) else None
                    
                    # Extract address details
                    branch_info = self.extract_detailed_address_info(branch_address)
                    pensioner_info = self.extract_detailed_address_info(pensioner_address)
                    
                    pension_type = self.identify_pension_type(ppo_no, psa)
                    
                    cursor.execute("""
                        INSERT INTO doppw_pensioner_data (
                            file_name, sheet_name, gcode, pension_type,
                            branch_pincode, branch_state,
                            birth_year, age,
                            pensioner_pincode, pensioner_district, pensioner_state,
                            created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        filename, sheet_name, ppo_no, pension_type,
                        branch_info['pincode'], branch_info['state'],
                        birth_year, age,
                        pensioner_info['pincode'], pensioner_info['district'], pensioner_info['state'],
                        datetime.now()
                    ))
                    
                    records_inserted += 1
                    
                except Exception as e:
                    continue
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"      ❌ Error in enhanced processing: {e}")
        
        return records_inserted
    
    def process_simple_format(self, df, filename, sheet_name):
        """Process simple format data (existing logic)"""
        print(f"      📊 Processing as SIMPLE format")
        records_inserted = 0
        
        try:
            # Find header row
            header_row = 0
            for idx, row in df.head(3).iterrows():
                row_str = ' '.join([str(val) for val in row.values if pd.notna(val)]).upper()
                if 'PPO' in row_str and ('BIRTH' in row_str or 'YEAR' in row_str):
                    header_row = idx
                    break
            
            data_df = df.iloc[header_row + 1:].copy()
            if data_df.empty:
                return 0
            
            columns = df.columns.tolist()
            
            # Simple column mapping (existing logic)
            ppo_col = columns[1] if len(columns) > 1 else None
            birth_col = columns[2] if len(columns) > 2 else None
            psa_col = columns[3] if len(columns) > 3 else None
            branch_pincode_col = columns[4] if len(columns) > 4 else None
            pensioner_pincode_col = columns[5] if len(columns) > 5 else None
            
            conn = self.connect_db()
            cursor = conn.cursor()
            
            for idx, row in data_df.iterrows():
                try:
                    if row.isna().all():
                        continue
                    
                    ppo_no = str(row[ppo_col]).strip() if ppo_col and pd.notna(row[ppo_col]) else None
                    
                    if not ppo_no or ppo_no == 'nan':
                        continue
                    
                    birth_value = row[birth_col] if birth_col else None
                    birth_year = self.extract_year_from_birth(birth_value)
                    age = self.calculate_age(birth_year)
                    
                    psa = str(row[psa_col]).strip() if psa_col and pd.notna(row[psa_col]) else None
                    
                    branch_address = str(row[branch_pincode_col]).strip() if branch_pincode_col and pd.notna(row[branch_pincode_col]) else None
                    branch_info = self.extract_detailed_address_info(branch_address)
                    
                    pensioner_address = str(row[pensioner_pincode_col]).strip() if pensioner_pincode_col and pd.notna(row[pensioner_pincode_col]) else None
                    pensioner_info = self.extract_detailed_address_info(pensioner_address)
                    
                    pension_type = self.identify_pension_type(ppo_no, psa)
                    
                    cursor.execute("""
                        INSERT INTO doppw_pensioner_data (
                            file_name, sheet_name, gcode, pension_type,
                            branch_pincode, branch_state,
                            birth_year, age,
                            pensioner_pincode, pensioner_district, pensioner_state,
                            created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        filename, sheet_name, ppo_no, pension_type,
                        branch_info['pincode'], branch_info['state'],
                        birth_year, age,
                        pensioner_info['pincode'], pensioner_info['district'], pensioner_info['state'],
                        datetime.now()
                    ))
                    
                    records_inserted += 1
                    
                except Exception as e:
                    continue
            
            conn.commit()
            conn.close()
            
        except Exception as e:
            print(f"      ❌ Error in simple processing: {e}")
        
        return records_inserted
    
    def process_excel_file(self, file_path):
        """Process Excel file with automatic format detection"""
        filename = os.path.basename(file_path)
        print(f"\n📄 Processing: {filename}")
        print("-" * 50)
        
        try:
            excel_file = pd.ExcelFile(file_path)
            sheet_names = excel_file.sheet_names
            
            file_records = 0
            
            for sheet_name in sheet_names:
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    
                    if df.empty:
                        print(f"   📋 Sheet '{sheet_name}': Empty, skipping")
                        continue
                    
                    print(f"   📋 Sheet '{sheet_name}': {len(df)} rows")
                    
                    # Detect format
                    format_type = self.detect_data_format(df, sheet_name)
                    
                    # Process based on detected format
                    if format_type == "ENHANCED":
                        sheet_records = self.process_enhanced_format(df, filename, sheet_name)
                    else:
                        sheet_records = self.process_simple_format(df, filename, sheet_name)
                    
                    file_records += sheet_records
                    print(f"      ✅ Inserted {sheet_records} records")
                    
                except Exception as e:
                    error_msg = f"Error processing sheet '{sheet_name}' in {filename}: {e}"
                    print(f"   ❌ {error_msg}")
                    self.errors.append(error_msg)
            
            print(f"   ✅ Total: {file_records} records from {filename}")
            self.processed_files.append(filename)
            self.total_records += file_records
            
        except Exception as e:
            error_msg = f"Error processing file {filename}: {e}"
            print(f"❌ {error_msg}")
            self.errors.append(error_msg)

def main():
    processor = ComprehensiveDataProcessor()
    
    print("🚀 COMPREHENSIVE PENSIONER DATA PROCESSOR")
    print("=" * 60)
    print("✨ Features:")
    print("   - Automatic format detection")
    print("   - Enhanced address parsing")
    print("   - Multiple data format support")
    print("   - Intelligent column mapping")
    print("")
    
    # Process sample enhanced data
    print("📝 Processing sample enhanced data...")
    sample_data = [
        [1, "688002400653", 1964, "Central Pension Accounting Office (CPAO)", 
         "15A, Ward No.21, Plot No.4, Guru Nanak Colony, Bahadurgarh, Jhajjar, Haryana, Pin-124507",
         "Gali No 5, Shakti Nagar, Bahadurgarh, Jhajjar, Haryana- 124507"]
    ]
    
    # Create a sample DataFrame
    sample_df = pd.DataFrame(sample_data, columns=[
        'S.No', 'PPO No.', 'Year of Birth', 'Pension Sanctioning Authority',
        'Address PinCode of Pension Disbursing Branch', 'Postal Address PinCode of pensioner'
    ])
    
    # Add header row
    header_df = pd.DataFrame([['S. No', 'PPO No.', 'Year of Birth', 'Pension Sanctioning Authority',
                              'Address PinCode of Pension Disbursing Branch', 'Postal Address PinCode of pensioner']], 
                            columns=sample_df.columns)
    
    full_df = pd.concat([header_df, sample_df], ignore_index=True)
    
    # Process the sample
    records = processor.process_enhanced_format(full_df, "SAMPLE_ENHANCED_DATA.xlsx", "Sheet1")
    
    print(f"\n📊 SAMPLE PROCESSING COMPLETE")
    print(f"✅ Records processed: {records}")
    
    # Show instructions for bulk processing
    print(f"\n🎯 FOR BULK PROCESSING:")
    print("-" * 30)
    print("1. Place your Excel files in any directory")
    print("2. Run: python3 comprehensive_data_processor.py /path/to/excel/files")
    print("3. Or modify this script to point to your files")
    print("")
    print("📋 SUPPORTED FORMATS:")
    print("   ✅ Enhanced format (with complete addresses)")
    print("   ✅ Simple format (basic PPO, birth year, pincode)")
    print("   ✅ Mixed formats in same file")
    print("   ✅ Multiple sheets per file")

if __name__ == "__main__":
    main()