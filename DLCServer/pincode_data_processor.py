#!/usr/bin/env python3
"""
Pincode-based Data Processor
Extracts pincode data from all Excel files and creates comprehensive pincode mapping
"""

import sqlite3
import pandas as pd
import os
import re
from datetime import datetime
import json

class PincodeDataProcessor:
    def __init__(self, db_path='database.db', excel_dir='Excel Files'):
        self.db_path = db_path
        self.excel_dir = excel_dir
        self.conn = None
        self.pincode_mapping = {}
        
    def connect_db(self):
        """Connect to SQLite database"""
        self.conn = sqlite3.connect(self.db_path)
        print("✓ Database connected")
        
    def create_pincode_tables(self):
        """Create tables for pincode mapping and pensioner location data"""
        cursor = self.conn.cursor()
        
        # Pincode master table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pincode_master (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pincode TEXT UNIQUE NOT NULL,
                district TEXT,
                state TEXT,
                city TEXT,
                region TEXT,
                data_source TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Pensioner pincode mapping
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pensioner_pincode_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pincode TEXT NOT NULL,
                district TEXT,
                state TEXT,
                city TEXT,
                bank_name TEXT,
                bank_ifsc TEXT,
                branch_name TEXT,
                total_pensioners INTEGER DEFAULT 0,
                age_less_than_80 INTEGER DEFAULT 0,
                age_more_than_80 INTEGER DEFAULT 0,
                age_not_available INTEGER DEFAULT 0,
                data_source TEXT,
                file_name TEXT,
                sheet_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Pincode statistics
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pincode_statistics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pincode TEXT NOT NULL,
                state TEXT,
                district TEXT,
                total_pensioners INTEGER DEFAULT 0,
                total_banks INTEGER DEFAULT 0,
                total_branches INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pincode ON pincode_master(pincode)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pensioner_pincode ON pensioner_pincode_data(pincode)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pincode_state ON pincode_master(state)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pincode_district ON pincode_master(district)')
        
        self.conn.commit()
        print("✓ Pincode tables created successfully")
        
    def clean_pincode(self, pincode):
        """Clean and validate pincode"""
        if pd.isna(pincode) or pincode is None:
            return None
        
        pincode_str = str(pincode).strip()
        # Remove any non-numeric characters
        pincode_clean = re.sub(r'[^0-9]', '', pincode_str)
        
        # Indian pincodes are 6 digits
        if len(pincode_clean) == 6 and pincode_clean.isdigit():
            return pincode_clean
        
        return None
    
    def get_state_from_pincode(self, pincode):
        """Get state from pincode (first digit mapping)"""
        if not pincode or len(pincode) != 6:
            return None
            
        first_digit = pincode[0]
        state_mapping = {
            '1': 'Delhi/Haryana/Punjab/Himachal Pradesh/Jammu & Kashmir/Chandigarh',
            '2': 'Uttar Pradesh/Uttarakhand',
            '3': 'Rajasthan',
            '4': 'Gujarat/Dadra and Nagar Haveli/Daman and Diu',
            '5': 'Maharashtra/Goa',
            '6': 'Karnataka/Kerala',
            '7': 'Andhra Pradesh/Telangana',
            '8': 'West Bengal/Odisha/Sikkim/Andaman and Nicobar/Arunachal Pradesh/Assam/Manipur/Meghalaya/Mizoram/Nagaland/Tripura',
            '9': 'Tamil Nadu/Puducherry'
        }
        
        return state_mapping.get(first_digit, 'Unknown')
    
    def insert_pincode_master(self, pincode, district=None, state=None, city=None, source='Excel'):
        """Insert or update pincode in master table"""
        cursor = self.conn.cursor()
        
        if not state:
            state = self.get_state_from_pincode(pincode)
        
        try:
            cursor.execute('''
                INSERT INTO pincode_master (pincode, district, state, city, data_source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(pincode) DO UPDATE SET
                    district = COALESCE(excluded.district, district),
                    state = COALESCE(excluded.state, state),
                    city = COALESCE(excluded.city, city),
                    updated_at = CURRENT_TIMESTAMP
            ''', (pincode, district, state, city, source))
            
            self.conn.commit()
            return True
        except Exception as e:
            print(f"Error inserting pincode {pincode}: {e}")
            return False
    
    def process_bank_excel_files(self):
        """Process all bank Excel files for pincode data"""
        print("\n📊 Processing Bank Excel Files...")
        
        excel_files = [f for f in os.listdir(self.excel_dir) 
                      if f.endswith(('.xlsx', '.xls')) and 
                      'doppw' not in f.lower() and 
                      'dot' not in f.lower() and
                      'dashboard' not in f.lower()]
        
        total_records = 0
        
        for file_name in excel_files:
            file_path = os.path.join(self.excel_dir, file_name)
            print(f"\n  Processing: {file_name}")
            
            try:
                # Try reading all sheets
                excel_file = pd.ExcelFile(file_path)
                
                for sheet_name in excel_file.sheet_names:
                    try:
                        df = pd.read_excel(file_path, sheet_name=sheet_name)
                        
                        # Find pincode columns
                        pincode_cols = [col for col in df.columns 
                                       if 'pin' in str(col).lower() or 
                                       'code' in str(col).lower()]
                        
                        if not pincode_cols:
                            continue
                        
                        pincode_col = pincode_cols[0]
                        
                        # Find other relevant columns
                        state_col = next((col for col in df.columns if 'state' in str(col).lower()), None)
                        city_col = next((col for col in df.columns if 'city' in str(col).lower()), None)
                        district_col = next((col for col in df.columns if 'district' in str(col).lower()), None)
                        bank_col = next((col for col in df.columns if 'bank' in str(col).lower() and 'name' in str(col).lower()), None)
                        ifsc_col = next((col for col in df.columns if 'ifsc' in str(col).lower()), None)
                        
                        # Age columns
                        age_80_less = next((col for col in df.columns if '80' in str(col) and 'less' in str(col).lower()), None)
                        age_80_more = next((col for col in df.columns if '80' in str(col) and 'more' in str(col).lower()), None)
                        age_na = next((col for col in df.columns if 'not' in str(col).lower() and 'available' in str(col).lower()), None)
                        total_col = next((col for col in df.columns if 'total' in str(col).lower() or 'grand' in str(col).lower()), None)
                        
                        records_added = 0
                        
                        for idx, row in df.iterrows():
                            pincode = self.clean_pincode(row.get(pincode_col))
                            
                            if not pincode:
                                continue
                            
                            state = row.get(state_col) if state_col else None
                            city = row.get(city_col) if city_col else None
                            district = row.get(district_col) if district_col else None
                            bank_name = row.get(bank_col) if bank_col else None
                            ifsc = row.get(ifsc_col) if ifsc_col else None
                            
                            # Insert into pincode master
                            self.insert_pincode_master(pincode, district, state, city, file_name)
                            
                            # Insert pensioner pincode data
                            cursor = self.conn.cursor()
                            cursor.execute('''
                                INSERT INTO pensioner_pincode_data 
                                (pincode, district, state, city, bank_name, bank_ifsc, 
                                 total_pensioners, age_less_than_80, age_more_than_80, 
                                 age_not_available, data_source, file_name, sheet_name)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', (
                                pincode,
                                district,
                                state,
                                city,
                                bank_name,
                                ifsc,
                                int(row.get(total_col, 0)) if total_col and pd.notna(row.get(total_col)) else 0,
                                int(row.get(age_80_less, 0)) if age_80_less and pd.notna(row.get(age_80_less)) else 0,
                                int(row.get(age_80_more, 0)) if age_80_more and pd.notna(row.get(age_80_more)) else 0,
                                int(row.get(age_na, 0)) if age_na and pd.notna(row.get(age_na)) else 0,
                                'Bank Excel',
                                file_name,
                                sheet_name
                            ))
                            
                            records_added += 1
                        
                        self.conn.commit()
                        print(f"    ✓ Sheet '{sheet_name}': {records_added} records")
                        total_records += records_added
                        
                    except Exception as e:
                        print(f"    ✗ Error in sheet '{sheet_name}': {e}")
                        continue
                        
            except Exception as e:
                print(f"  ✗ Error processing {file_name}: {e}")
                continue
        
        print(f"\n✓ Total bank records processed: {total_records}")
        return total_records
    
    def process_existing_database_data(self):
        """Extract pincode data from existing database tables"""
        print("\n📊 Processing Existing Database Data...")
        
        cursor = self.conn.cursor()
        
        # Process bank_pensioner_data
        print("  Processing bank_pensioner_data table...")
        cursor.execute('''
            SELECT DISTINCT branch_pin_code, bank_state, bank_city, bank_name, bank_ifsc,
                   SUM(age_less_than_80) as age_less_80,
                   SUM(age_more_than_80) as age_more_80,
                   SUM(age_not_available) as age_na,
                   SUM(grand_total) as total
            FROM bank_pensioner_data
            WHERE branch_pin_code IS NOT NULL AND branch_pin_code != ''
            GROUP BY branch_pin_code, bank_state, bank_city, bank_name, bank_ifsc
        ''')
        
        bank_records = 0
        for row in cursor.fetchall():
            pincode = self.clean_pincode(row[0])
            if pincode:
                self.insert_pincode_master(pincode, None, row[1], row[2], 'Database')
                
                cursor.execute('''
                    INSERT INTO pensioner_pincode_data 
                    (pincode, state, city, bank_name, bank_ifsc, 
                     age_less_than_80, age_more_than_80, age_not_available,
                     total_pensioners, data_source)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (pincode, row[1], row[2], row[3], row[4], row[5], row[6], row[7], row[8], 'bank_pensioner_data'))
                bank_records += 1
        
        self.conn.commit()
        print(f"    ✓ {bank_records} bank records processed")
        
        # Process dot_pensioner_data
        print("  Processing dot_pensioner_data table...")
        cursor.execute('''
            SELECT pensioner_pincode, COUNT(*) as count
            FROM dot_pensioner_data
            WHERE pensioner_pincode IS NOT NULL AND pensioner_pincode != ''
            GROUP BY pensioner_pincode
        ''')
        
        dot_records = 0
        for row in cursor.fetchall():
            pincode = self.clean_pincode(row[0])
            if pincode:
                self.insert_pincode_master(pincode, None, None, None, 'DoT Database')
                
                cursor.execute('''
                    INSERT INTO pensioner_pincode_data 
                    (pincode, total_pensioners, data_source)
                    VALUES (?, ?, ?)
                ''', (pincode, row[1], 'dot_pensioner_data'))
                dot_records += 1
        
        self.conn.commit()
        print(f"    ✓ {dot_records} DoT records processed")
        
        # Process doppw_pensioner_data
        print("  Processing doppw_pensioner_data table...")
        cursor.execute('''
            SELECT branch_pincode, branch_state, COUNT(*) as count
            FROM doppw_pensioner_data
            WHERE branch_pincode IS NOT NULL AND branch_pincode != ''
            GROUP BY branch_pincode, branch_state
        ''')
        
        doppw_records = 0
        for row in cursor.fetchall():
            pincode = self.clean_pincode(row[0])
            if pincode:
                self.insert_pincode_master(pincode, None, row[1], None, 'DoPPW Database')
                
                cursor.execute('''
                    INSERT INTO pensioner_pincode_data 
                    (pincode, state, total_pensioners, data_source)
                    VALUES (?, ?, ?, ?)
                ''', (pincode, row[1], row[2], 'doppw_pensioner_data'))
                doppw_records += 1
        
        self.conn.commit()
        print(f"    ✓ {doppw_records} DoPPW records processed")
        
        return bank_records + dot_records + doppw_records
    
    def update_pincode_statistics(self):
        """Update pincode statistics table"""
        print("\n📊 Updating Pincode Statistics...")
        
        cursor = self.conn.cursor()
        
        cursor.execute('DELETE FROM pincode_statistics')
        
        cursor.execute('''
            INSERT INTO pincode_statistics 
            (pincode, state, district, total_pensioners, total_banks, total_branches)
            SELECT 
                p.pincode,
                pm.state,
                pm.district,
                SUM(p.total_pensioners) as total_pensioners,
                COUNT(DISTINCT p.bank_name) as total_banks,
                COUNT(DISTINCT p.bank_ifsc) as total_branches
            FROM pensioner_pincode_data p
            LEFT JOIN pincode_master pm ON p.pincode = pm.pincode
            GROUP BY p.pincode, pm.state, pm.district
        ''')
        
        self.conn.commit()
        
        cursor.execute('SELECT COUNT(*) FROM pincode_statistics')
        count = cursor.fetchone()[0]
        print(f"✓ Statistics updated for {count} pincodes")
        
    def generate_report(self):
        """Generate comprehensive pincode report"""
        print("\n" + "="*80)
        print("PINCODE DATA PROCESSING REPORT")
        print("="*80)
        
        cursor = self.conn.cursor()
        
        # Total unique pincodes
        cursor.execute('SELECT COUNT(DISTINCT pincode) FROM pincode_master')
        total_pincodes = cursor.fetchone()[0]
        print(f"\n📍 Total Unique Pincodes: {total_pincodes}")
        
        # Total pensioner records
        cursor.execute('SELECT COUNT(*) FROM pensioner_pincode_data')
        total_records = cursor.fetchone()[0]
        print(f"📊 Total Pensioner Records: {total_records}")
        
        # Total pensioners
        cursor.execute('SELECT SUM(total_pensioners) FROM pensioner_pincode_data')
        total_pensioners = cursor.fetchone()[0] or 0
        print(f"👥 Total Pensioners: {total_pensioners:,}")
        
        # State-wise breakdown
        print("\n📍 State-wise Pincode Distribution:")
        cursor.execute('''
            SELECT state, COUNT(DISTINCT pincode) as pincode_count,
                   SUM(total_pensioners) as pensioner_count
            FROM pincode_statistics
            WHERE state IS NOT NULL
            GROUP BY state
            ORDER BY pensioner_count DESC
            LIMIT 15
        ''')
        
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]} pincodes, {row[2]:,} pensioners")
        
        # Top pincodes by pensioner count
        print("\n🏆 Top 20 Pincodes by Pensioner Count:")
        cursor.execute('''
            SELECT pincode, state, district, total_pensioners, total_banks
            FROM pincode_statistics
            ORDER BY total_pensioners DESC
            LIMIT 20
        ''')
        
        for idx, row in enumerate(cursor.fetchall(), 1):
            print(f"  {idx}. Pincode {row[0]} ({row[1]}, {row[2]}): {row[3]:,} pensioners, {row[4]} banks")
        
        print("\n" + "="*80)
        
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("\n✓ Database connection closed")
    
    def run(self):
        """Main execution method"""
        try:
            print("="*80)
            print("PINCODE DATA PROCESSOR")
            print("="*80)
            
            self.connect_db()
            self.create_pincode_tables()
            
            # Process Excel files
            excel_count = self.process_bank_excel_files()
            
            # Process existing database
            db_count = self.process_existing_database_data()
            
            # Update statistics
            self.update_pincode_statistics()
            
            # Generate report
            self.generate_report()
            
            print("\n✅ Pincode data processing completed successfully!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            self.close()

if __name__ == "__main__":
    processor = PincodeDataProcessor()
    processor.run()
