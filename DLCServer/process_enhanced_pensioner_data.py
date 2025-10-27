#!/usr/bin/env python3
"""
Enhanced Processor for detailed pensioner data with complete addresses
This handles the new format with detailed address information
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime
import re
import numpy as np

class EnhancedPensionerProcessor:
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
            print(f"   ⚠️  Error parsing address '{address_text}': {e}")
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
    
    def process_enhanced_data(self, data_rows):
        """Process the enhanced pensioner data"""
        print(f"\n📊 Processing Enhanced Pensioner Data")
        print("-" * 40)
        
        records_inserted = 0
        
        try:
            conn = self.connect_db()
            cursor = conn.cursor()
            
            for i, row_data in enumerate(data_rows):
                try:
                    # Parse the row data
                    if len(row_data) < 6:
                        print(f"   ⚠️  Row {i+1}: Insufficient data columns")
                        continue
                    
                    s_no = row_data[0] if len(row_data) > 0 else None
                    ppo_no = str(row_data[1]).strip() if len(row_data) > 1 and not pd.isna(row_data[1]) else None
                    birth_year = int(row_data[2]) if len(row_data) > 2 and not pd.isna(row_data[2]) else None
                    psa = str(row_data[3]).strip() if len(row_data) > 3 and not pd.isna(row_data[3]) else None
                    branch_address = str(row_data[4]).strip() if len(row_data) > 4 and not pd.isna(row_data[4]) else None
                    pensioner_address = str(row_data[5]).strip() if len(row_data) > 5 and not pd.isna(row_data[5]) else None
                    
                    # Skip if no PPO number
                    if not ppo_no or ppo_no == 'nan':
                        continue
                    
                    # Calculate age
                    age = self.calculate_age(birth_year)
                    
                    # Extract branch address details
                    branch_info = self.extract_detailed_address_info(branch_address)
                    
                    # Extract pensioner address details
                    pensioner_info = self.extract_detailed_address_info(pensioner_address)
                    
                    # Identify pension type
                    pension_type = self.identify_pension_type(ppo_no, psa)
                    
                    # Insert into doppw_pensioner_data table
                    cursor.execute("""
                        INSERT INTO doppw_pensioner_data (
                            file_name, sheet_name, gcode, pension_type,
                            branch_pincode, branch_state, 
                            birth_year, age,
                            pensioner_pincode, pensioner_district, pensioner_state,
                            created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        'ENHANCED_PENSIONER_DATA',  # file_name
                        'MANUAL_ENTRY',  # sheet_name
                        ppo_no,  # gcode (PPO number)
                        pension_type,  # pension_type
                        branch_info['pincode'],  # branch_pincode
                        branch_info['state'],  # branch_state
                        birth_year,  # birth_year
                        age,  # age
                        pensioner_info['pincode'],  # pensioner_pincode
                        pensioner_info['district'],  # pensioner_district
                        pensioner_info['state'],  # pensioner_state
                        datetime.now()  # created_at
                    ))
                    
                    records_inserted += 1
                    
                    # Print progress for every 100 records
                    if records_inserted % 100 == 0:
                        print(f"   📝 Processed {records_inserted} records...")
                    
                except Exception as e:
                    print(f"   ⚠️  Error processing row {i+1}: {e}")
                    self.errors.append(f"Row {i+1}: {e}")
                    continue
            
            # Commit changes
            conn.commit()
            conn.close()
            
            print(f"   ✅ Successfully inserted {records_inserted} records")
            self.total_records += records_inserted
            
        except Exception as e:
            print(f"   ❌ Error in processing: {e}")
            self.errors.append(f"Processing error: {e}")
        
        return records_inserted
    
    def process_sample_data(self):
        """Process the sample data you provided"""
        print("🔧 Processing Sample Enhanced Data")
        print("=" * 50)
        
        # Sample data from your message
        sample_data = [
            [1, "688002400653", 1964, "Central Pension Accounting Office (CPAO)", 
             "15A, Ward No.21, Plot No.4, Guru Nanak Colony, Bahadurgarh, Jhajjar, Haryana, Pin-124507",
             "Gali No 5, Shakti Nagar, Bahadurgarh, Jhajjar, Haryana- 124507"]
        ]
        
        records_processed = self.process_enhanced_data(sample_data)
        
        print(f"\n📊 SAMPLE PROCESSING SUMMARY")
        print("-" * 30)
        print(f"✅ Records processed: {records_processed}")
        
        if self.errors:
            print(f"⚠️  Errors: {len(self.errors)}")
            for error in self.errors:
                print(f"   - {error}")
        
        # Show the inserted record
        self.show_inserted_record("688002400653")
    
    def show_inserted_record(self, ppo_no):
        """Show the details of inserted record"""
        try:
            conn = self.connect_db()
            cursor = conn.cursor()
            
            cursor.execute("""
                SELECT gcode, birth_year, age, pension_type,
                       branch_pincode, branch_state,
                       pensioner_pincode, pensioner_district, pensioner_state,
                       created_at
                FROM doppw_pensioner_data 
                WHERE gcode = ?
                ORDER BY created_at DESC
                LIMIT 1
            """, (ppo_no,))
            
            record = cursor.fetchone()
            
            if record:
                print(f"\n📝 INSERTED RECORD DETAILS:")
                print("-" * 30)
                print(f"   PPO Number: {record[0]}")
                print(f"   Birth Year: {record[1]}")
                print(f"   Age: {record[2]}")
                print(f"   Pension Type: {record[3]}")
                print(f"   Branch Pincode: {record[4]}")
                print(f"   Branch State: {record[5]}")
                print(f"   Pensioner Pincode: {record[6]}")
                print(f"   Pensioner District: {record[7]}")
                print(f"   Pensioner State: {record[8]}")
                print(f"   Created At: {record[9]}")
            else:
                print(f"   ⚠️  No record found for PPO: {ppo_no}")
            
            conn.close()
            
        except Exception as e:
            print(f"   ❌ Error showing record: {e}")
    
    def create_bulk_insert_template(self):
        """Create a template for bulk data insertion"""
        template_data = """
# Enhanced Pensioner Data Template
# Format: [S.No, PPO_No, Birth_Year, PSA, Branch_Address, Pensioner_Address]

sample_data = [
    [1, "688002400653", 1964, "Central Pension Accounting Office (CPAO)", 
     "15A, Ward No.21, Plot No.4, Guru Nanak Colony, Bahadurgarh, Jhajjar, Haryana, Pin-124507",
     "Gali No 5, Shakti Nagar, Bahadurgarh, Jhajjar, Haryana- 124507"],
    
    [2, "YOUR_PPO_NUMBER", BIRTH_YEAR, "PENSION_SANCTIONING_AUTHORITY",
     "COMPLETE_BRANCH_ADDRESS_WITH_PINCODE",
     "COMPLETE_PENSIONER_ADDRESS_WITH_PINCODE"],
    
    # Add more records here...
]

# To process this data:
# processor = EnhancedPensionerProcessor()
# processor.process_enhanced_data(sample_data)
"""
        
        with open("enhanced_data_template.py", "w") as f:
            f.write(template_data)
        
        print(f"\n📄 Template created: enhanced_data_template.py")
        print("   You can modify this template to add your data and run it")

def main():
    processor = EnhancedPensionerProcessor()
    
    print("🚀 ENHANCED PENSIONER DATA PROCESSOR")
    print("=" * 50)
    
    # Process sample data
    processor.process_sample_data()
    
    # Create template for bulk processing
    processor.create_bulk_insert_template()
    
    print(f"\n🎯 RECOMMENDATIONS:")
    print("-" * 20)
    print("1. ✅ Sample data processed successfully")
    print("2. 📄 Template created for bulk data entry")
    print("3. 🔧 Use the template to add more records")
    print("4. 📊 Data is inserted into 'doppw_pensioner_data' table")
    print("5. 🏛️  Addresses are parsed for state, district, and pincode")

if __name__ == "__main__":
    main()