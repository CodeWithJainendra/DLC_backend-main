#!/usr/bin/env python3

"""
Optimized Pension Data Importer
Handles large files more efficiently
"""

import pandas as pd
import sqlite3
import os
import sys
from datetime import datetime
import numpy as np

class OptimizedPensionDataImporter:
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
        
        if pd.isna(pincode) or pincode is None or pincode == '':
            return True  # Allow empty pincodes
            
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
        invalid_names = ['null', 'undefined', 'na', 'n/a', 'nil', '']
        
        if pd.isna(name) or name is None:
            return False
            
        name_str = str(name).strip().lower()
        
        # Check against invalid names
        if name_str in invalid_names:
            return False
            
        return True
    
    def process_bob_files(self):
        """Process BOB Excel files and insert into pensioner_bank_master table"""
        bob_files = [
            '/data1/jainendra/DLC_backend-main/BOB Pensioners data 1.xlsx',
            '/data1/jainendra/DLC_backend-main/BOB Pensioners data 2.xlsx'
        ]
        
        total_stats = {'processed': 0, 'inserted': 0, 'errors': 0, 'invalid': 0}
        
        for file_path in bob_files:
            if not os.path.exists(file_path):
                print(f"⚠️  BOB file not found: {file_path}")
                continue
                
            print(f"🔄 Processing BOB file: {os.path.basename(file_path)}")
            
            try:
                # Read file in chunks for better memory management
                chunk_size = 10000
                total_rows = 0
                total_valid = 0
                total_invalid = 0
                total_inserted = 0
                total_errors = 0
                
                # Process file in chunks
                for chunk in pd.read_excel(file_path, chunksize=chunk_size):
                    total_rows += len(chunk)
                    valid_rows = 0
                    invalid_rows = 0
                    
                    # Filter valid rows in chunk
                    valid_indices = []
                    for idx, row in chunk.iterrows():
                        # Check if row has valid data
                        ppo = row.get('PPO NUMBER')
                        state = row.get('STATE')
                        
                        # Basic validation
                        if pd.isna(ppo) or not str(ppo).strip():
                            invalid_rows += 1
                            continue
                            
                        if state and not self.validate_name(state):
                            invalid_rows += 1
                            continue
                        
                        # Pincode validation
                        pincode = row.get('Pensioner POST_CODE')
                        if pincode and not self.validate_pincode(pincode):
                            invalid_rows += 1
                            continue
                        
                        valid_indices.append(idx)
                        valid_rows += 1
                    
                    total_valid += valid_rows
                    total_invalid += invalid_rows
                    
                    # Process valid rows
                    if valid_indices:
                        valid_chunk = chunk.loc[valid_indices]
                        
                        # Prepare data for batch insert
                        insert_data = []
                        for _, row in valid_chunk.iterrows():
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
                                insert_data.append(values)
                            except Exception as e:
                                total_errors += 1
                                print(f"   ❌ Error preparing row: {e}")
                        
                        # Batch insert
                        if insert_data:
                            try:
                                insert_query = """
                                    INSERT INTO pensioner_bank_master (
                                        ppo_number, pensioner_dob, psa, pda, bank_name,
                                        branch_name, branch_postcode, pensioner_city, state, 
                                        pensioner_postcode, sr_no, name_of_disbursing_bank,
                                        data_source
                                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                """
                                self.cursor.executemany(insert_query, insert_data)
                                self.conn.commit()
                                total_inserted += len(insert_data)
                                print(f"   💾 Inserted {len(insert_data)} rows from chunk...")
                            except Exception as e:
                                total_errors += len(insert_data)
                                print(f"   ❌ Error inserting batch: {e}")
                    
                    print(f"   📊 Processed chunk: {valid_rows} valid, {invalid_rows} invalid")
                
                print(f"📊 Total rows: {total_rows}")
                print(f"✅ Valid rows: {total_valid}")
                print(f"❌ Invalid rows: {total_invalid}")
                print(f"💾 Successfully inserted: {total_inserted}")
                if total_errors > 0:
                    print(f"❌ Errors: {total_errors}")
                
                total_stats['processed'] += total_rows
                total_stats['inserted'] += total_inserted
                total_stats['errors'] += total_errors
                total_stats['invalid'] += total_invalid
                
            except Exception as e:
                print(f"❌ Error processing BOB file: {e}")
                import traceback
                traceback.print_exc()
                total_stats['errors'] += 1
        
        return total_stats
    
    def process_dashboard_file(self):
        """Process Dashboard file and insert into pension_data table"""
        file_path = '/data1/jainendra/DLC_backend-main/Dashborad_DLC_Data_.xlsx'
        
        if not os.path.exists(file_path):
            print(f"⚠️  Dashboard file not found: {file_path}")
            return {'processed': 0, 'inserted': 0, 'errors': 0, 'invalid': 0}
            
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
                
                if state and not self.validate_name(state):
                    invalid_rows += 1
                    continue
                
                # Pincode validation
                pincode = row.get('PENSIONER PINCODE')
                if pincode and not self.validate_pincode(pincode):
                    invalid_rows += 1
                    continue
                
                valid_rows.append(row)
            
            print(f"✅ Valid rows: {len(valid_rows)}")
            print(f"❌ Invalid rows: {invalid_rows}")
            
            # Insert valid rows into pension_data table
            inserted = 0
            errors = 0
            
            insert_query = """
                INSERT INTO pension_data (
                    LEVEL1, ESCROLL_CATEGORY, GROUP_ID, PENSION_TYPE, BRANCH_CODE,
                    BRANCH_NAME, BRANCH_PINCODE, BRANCH_STATE_NAME, YEAR_OF_BIRTH,
                    SUBMISSION_STATUS, WAIVER_TILL, SUBMISSION_MODE, VERIFICATION_TYPE,
                    CERTIFICATE_SUBMISSION_DATE, PENSIONER_PINCODE, PENSIONER_DISTRICT_NAME,
                    PENSIONER_STATE_NAME, PPO_UNIQUE_ID, PSA, PDA, DATA_DATE
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, date('now'))
            """
            
            # Prepare data for batch insert
            insert_data = []
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
                        str(row.get('PSA', '')) if not pd.isna(row.get('PSA')) else '',
                        str(row.get('PDA', '')) if not pd.isna(row.get('PDA')) else '',
                        datetime.now().strftime('%Y-%m-%d')  # DATA_DATE
                    )
                    insert_data.append(values)
                    
                except Exception as e:
                    errors += 1
                    print(f"   ❌ Error preparing row: {e}")
            
            # Batch insert
            if insert_data:
                try:
                    self.cursor.executemany(insert_query, insert_data)
                    self.conn.commit()
                    inserted = len(insert_data)
                    print(f"✅ Successfully inserted {inserted} rows")
                except Exception as e:
                    errors += len(insert_data)
                    print(f"❌ Error inserting rows: {e}")
            
            if errors > 0:
                print(f"❌ Errors: {errors}")
                
            return {'processed': len(df), 'inserted': inserted, 'errors': errors, 'invalid': invalid_rows}
            
        except Exception as e:
            print(f"❌ Error processing Dashboard file: {e}")
            import traceback
            traceback.print_exc()
            return {'processed': 0, 'inserted': 0, 'errors': 1, 'invalid': 0}
    
    def process_ubi_files(self):
        """Process UBI Excel files and insert into pensioner_bank_master table"""
        ubi_files = [
            ('/data1/jainendra/DLC_backend-main/Data from UBI 1.xlsx', 1),
            ('/data1/jainendra/DLC_backend-main/Data from UBI 2.xlsx', 2),
            ('/data1/jainendra/DLC_backend-main/Data from UBI 3.xlsx', 3)
        ]
        
        total_stats = {'processed': 0, 'inserted': 0, 'errors': 0, 'invalid': 0}
        
        for file_path, file_num in ubi_files:
            if not os.path.exists(file_path):
                print(f"⚠️  UBI file not found: {file_path}")
                continue
                
            print(f"🔄 Processing UBI file {file_num}: {os.path.basename(file_path)}")
            
            try:
                # Handle different UBI file structures
                if file_num == 1:
                    # UBI 1 has headers in row 1
                    df = pd.read_excel(file_path, header=1)
                else:
                    # UBI 2 and 3 have headers in row 0
                    df = pd.read_excel(file_path)
                
                print(f"📊 Rows: {len(df)}, Columns: {len(df.columns)}")
                
                # Rename columns for easier access based on file type
                if file_num == 1:
                    # UBI 1 column mapping
                    column_mapping = {}
                    if len(df.columns) > 0: column_mapping[df.columns[0]] = 'S_NO'
                    if len(df.columns) > 1: column_mapping[df.columns[1]] = 'PPO_NO'
                    if len(df.columns) > 2: column_mapping[df.columns[2]] = 'DOB'
                    if len(df.columns) > 3: column_mapping[df.columns[3]] = 'PSA'
                    if len(df.columns) > 4: column_mapping[df.columns[4]] = 'PDA'
                    if len(df.columns) > 5: column_mapping[df.columns[5]] = 'BANK_NAME'
                    if len(df.columns) > 6: column_mapping[df.columns[6]] = 'BRANCH_NAME'
                    if len(df.columns) > 7: column_mapping[df.columns[7]] = 'BRANCH_PINCODE'
                    if len(df.columns) > 8: column_mapping[df.columns[8]] = 'PENSIONER_CITY'
                    if len(df.columns) > 9: column_mapping[df.columns[9]] = 'STATE'
                    if len(df.columns) > 10: column_mapping[df.columns[10]] = 'PENSIONER_PINCODE'
                    df = df.rename(columns=column_mapping)
                elif file_num == 2:
                    # UBI 2 already has proper column names
                    pass
                elif file_num == 3:
                    # UBI 3 column names
                    pass
                
                # Filter valid rows
                valid_rows = []
                invalid_rows = 0
                
                for _, row in df.iterrows():
                    # Check if row has valid data based on file type
                    if file_num == 1:
                        ppo = row.get('PPO_NO')
                        state = row.get('STATE')
                    elif file_num == 2:
                        ppo = row.get('PPO No.')
                        state = row.get('State')
                    elif file_num == 3:
                        ppo = row.get('PPO No.')
                        state = row.get('State')
                    
                    # Basic validation
                    if pd.isna(ppo) or not str(ppo).strip():
                        invalid_rows += 1
                        continue
                        
                    if state and not self.validate_name(state):
                        invalid_rows += 1
                        continue
                    
                    # Pincode validation
                    if file_num == 1:
                        pincode = row.get('PENSIONER_PINCODE')
                    elif file_num == 2:
                        pincode = row.get('Pensioner Pincode')
                    elif file_num == 3:
                        pincode = row.get('Pensioner Pincode')
                    
                    if pincode and not self.validate_pincode(pincode):
                        invalid_rows += 1
                        continue
                    
                    valid_rows.append(row)
                
                print(f"✅ Valid rows: {len(valid_rows)}")
                print(f"❌ Invalid rows: {invalid_rows}")
                
                # Insert valid rows into pensioner_bank_master table
                inserted = 0
                errors = 0
                
                insert_query = """
                    INSERT INTO pensioner_bank_master (
                        ppo_number, pensioner_dob, psa, pda, bank_name,
                        branch_name, branch_postcode, pensioner_city, state, 
                        pensioner_postcode, s_no, name_of_bank_branch_of_pensioner,
                        data_source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                # Prepare data for batch insert
                insert_data = []
                for row in valid_rows:
                    try:
                        # Get values based on file type
                        if file_num == 1:
                            ppo = row.get('PPO_NO', '')
                            dob = row.get('DOB', '')
                            psa = row.get('PSA', '')
                            pda = row.get('PDA', '')
                            bank_name = row.get('BANK_NAME', '')
                            branch_name = row.get('BRANCH_NAME', '')
                            branch_pincode = row.get('BRANCH_PINCODE', '')
                            pensioner_city = row.get('PENSIONER_CITY', '')
                            state = row.get('STATE', '')
                            pensioner_pincode = row.get('PENSIONER_PINCODE', '')
                            s_no = row.get('S_NO', '')
                        elif file_num == 2:
                            ppo = row.get('PPO No.', '')
                            dob = row.get('Date of Birth', '')
                            psa = row.get('PSA', '')
                            pda = row.get('PDA', '')
                            bank_name = row.get('Name of Bank disbursing pension', '')
                            branch_name = row.get('Name of Bank Branch of pesioner', '')
                            branch_pincode = row.get('Pincode', '')
                            pensioner_city = row.get('Pensioner City', '')
                            state = row.get('State', '')
                            pensioner_pincode = row.get('Pensioner Pincode', '')
                            s_no = ''  # Not available in UBI 2
                        elif file_num == 3:
                            ppo = row.get('PPO No.', '')
                            dob = row.get('Date of Birth', '')
                            psa = row.get('PSA', '')
                            pda = row.get('PDA', '')
                            bank_name = row.get('Name of Bank disbursing pension', '')
                            branch_name = row.get('Name of Bank Branch of pesioner', '')
                            branch_pincode = row.get('Branch Pincode', '')
                            pensioner_city = row.get('Pensioners City', '')
                            state = row.get('State', '')
                            pensioner_pincode = row.get('Pensioner Pincode', '')
                            s_no = ''  # Not available in UBI 3
                        
                        values = (
                            str(ppo) if not pd.isna(ppo) else '',
                            str(dob) if not pd.isna(dob) else '',
                            str(psa) if not pd.isna(psa) else '',
                            str(pda) if not pd.isna(pda) else '',
                            str(bank_name) if not pd.isna(bank_name) else '',
                            str(branch_name) if not pd.isna(branch_name) else '',
                            str(branch_pincode) if not pd.isna(branch_pincode) else '',
                            str(pensioner_city) if not pd.isna(pensioner_city) else '',
                            str(state) if not pd.isna(state) else '',
                            str(pensioner_pincode) if not pd.isna(pensioner_pincode) else '',
                            str(s_no) if not pd.isna(s_no) else '',
                            str(branch_name) if not pd.isna(branch_name) else '',  # name_of_bank_branch_of_pensioner
                            f"UBI_FILE_{file_num}"
                        )
                        insert_data.append(values)
                        
                    except Exception as e:
                        errors += 1
                        print(f"   ❌ Error preparing row: {e}")
                
                # Batch insert
                if insert_data:
                    try:
                        self.cursor.executemany(insert_query, insert_data)
                        self.conn.commit()
                        inserted = len(insert_data)
                        print(f"✅ Successfully inserted {inserted} rows")
                    except Exception as e:
                        errors += len(insert_data)
                        print(f"❌ Error inserting rows: {e}")
                
                if errors > 0:
                    print(f"❌ Errors: {errors}")
                    
                total_stats['processed'] += len(df)
                total_stats['inserted'] += inserted
                total_stats['errors'] += errors
                total_stats['invalid'] += invalid_rows
                
            except Exception as e:
                print(f"❌ Error processing UBI file {file_num}: {e}")
                import traceback
                traceback.print_exc()
                total_stats['errors'] += 1
        
        return total_stats
    
    def import_all_files(self):
        """Main import function"""
        print('='*100)
        print('🚀 OPTIMIZED PENSION DATA IMPORTER')
        print('Mapping files to correct database tables:')
        print('  - BOB files → pensioner_bank_master table')
        print('  - Dashboard file → pension_data table')
        print('  - UBI files → pensioner_bank_master table')
        print('='*100)
        print(f"⏰ Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        self.connect_db()
        
        # Process each file type
        print("STEP 1: Processing BOB files")
        print("="*60)
        bob_stats = self.process_bob_files()
        
        print("\nSTEP 2: Processing Dashboard file")
        print("="*60)
        dashboard_stats = self.process_dashboard_file()
        
        print("\nSTEP 3: Processing UBI files")
        print("="*60)
        ubi_stats = self.process_ubi_files()
        
        # Calculate total stats
        total_stats = {
            'processed': bob_stats['processed'] + dashboard_stats['processed'] + ubi_stats['processed'],
            'inserted': bob_stats['inserted'] + dashboard_stats['inserted'] + ubi_stats['inserted'],
            'errors': bob_stats['errors'] + dashboard_stats['errors'] + ubi_stats['errors'],
            'invalid': bob_stats['invalid'] + dashboard_stats['invalid'] + ubi_stats['invalid']
        }
        
        # Print summary
        print("\n" + "="*100)
        print("🎯 FINAL SUMMARY")
        print("="*100)
        print(f"📊 Total rows processed: {total_stats['processed']:,}")
        print(f"✅ Total inserted: {total_stats['inserted']:,}")
        print(f"❌ Total errors: {total_stats['errors']:,}")
        print(f"🔄 Total invalid rows: {total_stats['invalid']:,}")
        print(f"📈 Net valid rows: {total_stats['inserted']:,}")
        
        print(f"\n📋 Detailed breakdown:")
        print(f"   BOB files: {bob_stats['inserted']:,} inserted, {bob_stats['invalid']:,} invalid")
        print(f"   Dashboard file: {dashboard_stats['inserted']:,} inserted, {dashboard_stats['invalid']:,} invalid")
        print(f"   UBI files: {ubi_stats['inserted']:,} inserted, {ubi_stats['invalid']:,} invalid")
        
        print(f"\n⏰ Completed: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*100)
        
        self.close_db()
        print("\n✨ ALL FILES IMPORTED SUCCESSFULLY! ✨\n")

def main():
    importer = OptimizedPensionDataImporter()
    importer.import_all_files()

if __name__ == '__main__':
    main()