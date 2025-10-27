#!/usr/bin/env python3

"""
New Pension Data Importer
Analyzes BOB, UBI, and other Excel files and inserts data into the existing database
"""

import pandas as pd
import sqlite3
import os
import sys
from datetime import datetime
import numpy as np

class NewPensionDataImporter:
    def __init__(self):
        self.db_path = os.path.join(os.path.dirname(__file__), '..', 'DLC_Database.db')
        self.conn = None
        self.cursor = None
        
    def connect_db(self):
        """Connect to database"""
        self.conn = sqlite3.connect(self.db_path)
        self.cursor = self.conn.cursor()
        print("✅ Database connected\n")
        
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("✅ Database connection closed\n")
    
    def validate_pincode(self, pincode):
        """Validate pincode - should be 6 digits and not in invalid list"""
        invalid_pincodes = ['111111', '999999', '000000']
        
        if pd.isna(pincode) or pincode is None:
            return False
            
        pincode_str = str(pincode).strip()
        
        # Check if it's a valid 6-digit number
        if not pincode_str.isdigit() or len(pincode_str) != 6:
            return False
            
        # Check against invalid pincodes
        if pincode_str in invalid_pincodes:
            return False
            
        return True
    
    def validate_name(self, name):
        """Validate name - should not be null, empty, or in invalid list"""
        invalid_names = ['null', 'undefined', 'na', 'n/a', 'nil']
        
        if pd.isna(name) or name is None:
            return False
            
        name_str = str(name).strip().lower()
        
        # Check against invalid names
        if name_str in invalid_names or len(name_str) == 0:
            return False
            
        return True
    
    def extract_year_from_dob(self, dob):
        """Extract year from DOB string"""
        if pd.isna(dob) or dob is None:
            return None
            
        dob_str = str(dob).strip()
        
        # Handle different date formats (DD-MM-YYYY, DD/MM/YYYY, etc.)
        import re
        date_pattern = r'^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$'
        match = re.match(date_pattern, dob_str)
        
        if match:
            year = match.group(3)
            # Handle 2-digit years
            if len(year) == 2:
                full_year = '19' + year if int(year) > 50 else '20' + year
                return full_year
            return year
            
        return None
    
    def process_bob_file(self, file_path):
        """Process BOB Excel file"""
        print(f"🔄 Processing BOB file: {os.path.basename(file_path)}")
        
        try:
            df = pd.read_excel(file_path)
            print(f"📊 Rows: {len(df)}, Columns: {len(df.columns)}")
            
            # Filter valid rows
            valid_rows = []
            invalid_rows = 0
            
            for _, row in df.iterrows():
                # Check if row has valid data
                ppo = row.get('PPO NUMBER')
                state = row.get('STATE')
                pincode = row.get('Pensioner POST_CODE')
                
                # Basic validation
                if pd.isna(ppo) or not str(ppo).strip():
                    invalid_rows += 1
                    continue
                    
                if not self.validate_name(state):
                    invalid_rows += 1
                    continue
                    
                if not self.validate_pincode(pincode):
                    invalid_rows += 1
                    continue
                
                valid_rows.append(row)
            
            print(f"✅ Valid rows: {len(valid_rows)}")
            print(f"❌ Invalid rows: {invalid_rows}")
            
            # Insert valid rows into database
            inserted = 0
            errors = 0
            
            insert_query = """
                INSERT INTO pensioner_bank_master (
                    ppo_number, pensioner_dob, psa, pda, bank_name,
                    branch_name, branch_postcode, pensioner_city, state, 
                    pensioner_postcode, sr_no, name_of_disbursing_bank,
                    data_source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """
            
            for row in valid_rows:
                try:
                    values = (
                        str(row.get('PPO NUMBER', '')) if not pd.isna(row.get('PPO NUMBER')) else '',
                        str(row.get('DOB REGULAR', '')) if not pd.isna(row.get('DOB REGULAR')) else '',
                        str(row.get('PSA', '')) if not pd.isna(row.get('PSA')) else '',
                        str(row.get('PDA and  name of disbursing bank', '')) if not pd.isna(row.get('PDA and  name of disbursing bank')) else '',
                        str(row.get('PDA and  name of disbursing bank', '')) if not pd.isna(row.get('PDA and  name of disbursing bank')) else '',  # bank_name
                        str(row.get('BRANCH_NAME', '')) if not pd.isna(row.get('BRANCH_NAME')) else '',
                        str(row.get('Branch POST_CODE', '')) if not pd.isna(row.get('Branch POST_CODE')) else '',
                        str(row.get('Pensioner CITY', '')) if not pd.isna(row.get('Pensioner CITY')) else '',
                        str(row.get('STATE', '')) if not pd.isna(row.get('STATE')) else '',
                        str(row.get('Pensioner POST_CODE', '')) if not pd.isna(row.get('Pensioner POST_CODE')) else '',
                        str(row.get('Sr NO', '')) if not pd.isna(row.get('Sr NO')) else '',
                        str(row.get('PDA and  name of disbursing bank', '')) if not pd.isna(row.get('PDA and  name of disbursing bank')) else '',  # name_of_disbursing_bank
                        f"BOB_{os.path.basename(file_path).replace('.xlsx', '').replace(' ', '_')}"
                    )
                    
                    self.cursor.execute(insert_query, values)
                    inserted += 1
                    
                    # Commit in batches
                    if inserted % 10000 == 0:
                        self.conn.commit()
                        print(f"   💾 Inserted {inserted} rows...")
                        
                except Exception as e:
                    errors += 1
                    print(f"   ❌ Error inserting row: {e}")
            
            self.conn.commit()
            print(f"✅ Successfully inserted {inserted} rows")
            if errors > 0:
                print(f"❌ Errors: {errors}")
                
            return {'processed': len(df), 'inserted': inserted, 'errors': errors, 'invalid': invalid_rows}
            
        except Exception as e:
            print(f"❌ Error processing BOB file: {e}")
            return {'processed': 0, 'inserted': 0, 'errors': 1, 'invalid': 0}
    
    def process_dashboard_file(self, file_path):
        """Process Dashboard DLC Data file"""
        print(f"🔄 Processing Dashboard file: {os.path.basename(file_path)}")
        
        try:
            df = pd.read_excel(file_path)
            print(f"📊 Rows: {len(df)}, Columns: {len(df.columns)}")
            
            # Filter valid rows
            valid_rows = []
            invalid_rows = 0
            
            for _, row in df.iterrows():
                # Check if row has valid data
                state = row.get('PENSIONER STATENAME')
                pincode = row.get('PENSIONER PINCODE')
                
                if not self.validate_name(state):
                    invalid_rows += 1
                    continue
                    
                if not self.validate_pincode(pincode):
                    invalid_rows += 1
                    continue
                
                valid_rows.append(row)
            
            print(f"✅ Valid rows: {len(valid_rows)}")
            print(f"❌ Invalid rows: {invalid_rows}")
            
            # Insert valid rows into database
            inserted = 0
            errors = 0
            
            insert_query = """
                INSERT INTO pensioner_bank_master (
                    gcode, escroll_cat, gid, pension_type, branch_code,
                    branch_name, branch_pin, branch_state, birth_year,
                    submitted_status, waiver_upto, submission_mode, verification_type,
                    certificate_submission_date, pensioner_postcode, pensioner_distname,
                    state, ppo_number, data_source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """
            
            for row in valid_rows:
                try:
                    # Extract year from BIRTH_YEAR
                    birth_year = row.get('BIRTH_YEAR')
                    if not pd.isna(birth_year):
                        birth_year = str(int(birth_year))
                    
                    values = (
                        str(row.get('GCODE', '')) if not pd.isna(row.get('GCODE')) else '',
                        str(row.get('ESCROLL_CAT', '')) if not pd.isna(row.get('ESCROLL_CAT')) else '',
                        str(row.get('GID', '')) if not pd.isna(row.get('GID')) else '',
                        str(row.get('PENSION_TYPE', '')) if not pd.isna(row.get('PENSION_TYPE')) else '',
                        str(row.get('BRANCH_CODE', '')) if not pd.isna(row.get('BRANCH_CODE')) else '',
                        str(row.get('BRANCH_NAME', '')) if not pd.isna(row.get('BRANCH_NAME')) else '',
                        str(row.get('BRANCH_PIN', '')) if not pd.isna(row.get('BRANCH_PIN')) else '',
                        str(row.get('BRANCH_STATE', '')) if not pd.isna(row.get('BRANCH_STATE')) else '',
                        birth_year,
                        str(row.get('SUBMITTED_STATUS', '')) if not pd.isna(row.get('SUBMITTED_STATUS')) else '',
                        str(row.get('WAIVER_UPTO', '')) if not pd.isna(row.get('WAIVER_UPTO')) else '',
                        str(row.get('SUBMISSION_MODE', '')) if not pd.isna(row.get('SUBMISSION_MODE')) else '',
                        str(row.get('VERIFICATION_TYPE', '')) if not pd.isna(row.get('VERIFICATION_TYPE')) else '',
                        str(row.get('CERTIFICATE_SUBMISSION_DATE', '')) if not pd.isna(row.get('CERTIFICATE_SUBMISSION_DATE')) else '',
                        str(row.get('PENSIONER PINCODE', '')) if not pd.isna(row.get('PENSIONER PINCODE')) else '',
                        str(row.get('PENSIONER DISTNAME', '')) if not pd.isna(row.get('PENSIONER DISTNAME')) else '',
                        str(row.get('PENSIONER STATENAME', '')) if not pd.isna(row.get('PENSIONER STATENAME')) else '',
                        str(row.get('PPO_NO', '')) if not pd.isna(row.get('PPO_NO')) else '',
                        f"DASHBOARD_{os.path.basename(file_path).replace('.xlsx', '').replace(' ', '_')}"
                    )
                    
                    self.cursor.execute(insert_query, values)
                    inserted += 1
                    
                    # Commit in batches
                    if inserted % 10000 == 0:
                        self.conn.commit()
                        print(f"   💾 Inserted {inserted} rows...")
                        
                except Exception as e:
                    errors += 1
                    print(f"   ❌ Error inserting row: {e}")
            
            self.conn.commit()
            print(f"✅ Successfully inserted {inserted} rows")
            if errors > 0:
                print(f"❌ Errors: {errors}")
                
            return {'processed': len(df), 'inserted': inserted, 'errors': errors, 'invalid': invalid_rows}
            
        except Exception as e:
            print(f"❌ Error processing Dashboard file: {e}")
            return {'processed': 0, 'inserted': 0, 'errors': 1, 'invalid': 0}
    
    def process_ubi_file(self, file_path):
        """Process UBI Excel file"""
        print(f"🔄 Processing UBI file: {os.path.basename(file_path)}")
        
        try:
            # Read with header row at index 1 for UBI files
            df = pd.read_excel(file_path, header=1)
            print(f"📊 Rows: {len(df)}, Columns: {len(df.columns)}")
            
            # Rename columns for easier access
            column_mapping = {
                df.columns[0]: 'S_NO' if len(df.columns) > 0 else 'S_NO',
                df.columns[1]: 'PPO_NO' if len(df.columns) > 1 else 'PPO_NO',
                df.columns[2]: 'DOB' if len(df.columns) > 2 else 'DOB',
                df.columns[3]: 'PSA' if len(df.columns) > 3 else 'PSA',
                df.columns[4]: 'PDA' if len(df.columns) > 4 else 'PDA',
                df.columns[5]: 'BANK_NAME' if len(df.columns) > 5 else 'BANK_NAME',
                df.columns[6]: 'BRANCH_NAME' if len(df.columns) > 6 else 'BRANCH_NAME',
                df.columns[7]: 'BRANCH_PINCODE' if len(df.columns) > 7 else 'BRANCH_PINCODE',
                df.columns[8]: 'PENSIONER_CITY' if len(df.columns) > 8 else 'PENSIONER_CITY',
                df.columns[9]: 'STATE' if len(df.columns) > 9 else 'STATE',
                df.columns[10]: 'PENSIONER_PINCODE' if len(df.columns) > 10 else 'PENSIONER_PINCODE'
            }
            
            df = df.rename(columns=column_mapping)
            
            # Filter valid rows
            valid_rows = []
            invalid_rows = 0
            
            for _, row in df.iterrows():
                # Check if row has valid data
                ppo = row.get('PPO_NO')
                state = row.get('STATE')
                pincode = row.get('PENSIONER_PINCODE')
                
                # Basic validation
                if pd.isna(ppo) or not str(ppo).strip():
                    invalid_rows += 1
                    continue
                    
                if not self.validate_name(state):
                    invalid_rows += 1
                    continue
                    
                if pincode and not self.validate_pincode(pincode):
                    invalid_rows += 1
                    continue
                
                valid_rows.append(row)
            
            print(f"✅ Valid rows: {len(valid_rows)}")
            print(f"❌ Invalid rows: {invalid_rows}")
            
            # Insert valid rows into database
            inserted = 0
            errors = 0
            
            insert_query = """
                INSERT INTO pensioner_bank_master (
                    ppo_number, pensioner_dob, psa, pda, bank_name,
                    branch_name, branch_postcode, pensioner_city, state, 
                    pensioner_postcode, s_no, name_of_bank_branch_of_pensioner,
                    data_source, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
            """
            
            for row in valid_rows:
                try:
                    values = (
                        str(row.get('PPO_NO', '')) if not pd.isna(row.get('PPO_NO')) else '',
                        str(row.get('DOB', '')) if not pd.isna(row.get('DOB')) else '',
                        str(row.get('PSA', '')) if not pd.isna(row.get('PSA')) else '',
                        str(row.get('PDA', '')) if not pd.isna(row.get('PDA')) else '',
                        str(row.get('BANK_NAME', '')) if not pd.isna(row.get('BANK_NAME')) else '',
                        str(row.get('BRANCH_NAME', '')) if not pd.isna(row.get('BRANCH_NAME')) else '',
                        str(row.get('BRANCH_PINCODE', '')) if not pd.isna(row.get('BRANCH_PINCODE')) else '',
                        str(row.get('PENSIONER_CITY', '')) if not pd.isna(row.get('PENSIONER_CITY')) else '',
                        str(row.get('STATE', '')) if not pd.isna(row.get('STATE')) else '',
                        str(row.get('PENSIONER_PINCODE', '')) if not pd.isna(row.get('PENSIONER_PINCODE')) else '',
                        str(row.get('S_NO', '')) if not pd.isna(row.get('S_NO')) else '',
                        str(row.get('BRANCH_NAME', '')) if not pd.isna(row.get('BRANCH_NAME')) else '',  # name_of_bank_branch_of_pensioner
                        f"UBI_{os.path.basename(file_path).replace('.xlsx', '').replace(' ', '_')}"
                    )
                    
                    self.cursor.execute(insert_query, values)
                    inserted += 1
                    
                    # Commit in batches
                    if inserted % 10000 == 0:
                        self.conn.commit()
                        print(f"   💾 Inserted {inserted} rows...")
                        
                except Exception as e:
                    errors += 1
                    print(f"   ❌ Error inserting row: {e}")
            
            self.conn.commit()
            print(f"✅ Successfully inserted {inserted} rows")
            if errors > 0:
                print(f"❌ Errors: {errors}")
                
            return {'processed': len(df), 'inserted': inserted, 'errors': errors, 'invalid': invalid_rows}
            
        except Exception as e:
            print(f"❌ Error processing UBI file: {e}")
            return {'processed': 0, 'inserted': 0, 'errors': 1, 'invalid': 0}
    
    def import_all_files(self):
        """Main import function"""
        print('='*100)
        print('🚀 NEW PENSION DATA IMPORTER')
        print('='*100)
        print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        self.connect_db()
        
        # Files to process
        files_to_process = [
            ('BOB', '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx'),
            ('BOB', '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx'),
            ('DASHBOARD', '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx'),
            ('UBI', '/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx'),
            ('UBI', '/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx'),
            ('UBI', '/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx')
        ]
        
        total_stats = {
            'processed': 0,
            'inserted': 0,
            'errors': 0,
            'invalid': 0
        }
        
        for file_type, file_path in files_to_process:
            if not os.path.exists(file_path):
                print(f"⚠️  File not found: {file_path}")
                continue
                
            print(f"\n{'='*80}")
            
            if file_type == 'BOB':
                result = self.process_bob_file(file_path)
            elif file_type == 'DASHBOARD':
                result = self.process_dashboard_file(file_path)
            elif file_type == 'UBI':
                result = self.process_ubi_file(file_path)
            else:
                print(f"⚠️  Unknown file type: {file_type}")
                continue
            
            total_stats['processed'] += result['processed']
            total_stats['inserted'] += result['inserted']
            total_stats['errors'] += result['errors']
            total_stats['invalid'] += result['invalid']
        
        # Print summary
        print("\n" + "="*100)
        print("🎯 FINAL SUMMARY")
        print("="*100)
        print(f"📊 Total rows processed: {total_stats['processed']:,}")
        print(f"✅ Total inserted: {total_stats['inserted']:,}")
        print(f"❌ Total errors: {total_stats['errors']:,}")
        print(f"🔄 Total invalid rows: {total_stats['invalid']:,}")
        print(f"📈 Net valid rows: {total_stats['inserted']:,}")
        
        print(f"\n⏰ Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*100)
        
        self.close_db()
        print("\n✨ ALL FILES IMPORTED SUCCESSFULLY! ✨\n")

def main():
    importer = NewPensionDataImporter()
    importer.import_all_files()

if __name__ == '__main__':
    main()