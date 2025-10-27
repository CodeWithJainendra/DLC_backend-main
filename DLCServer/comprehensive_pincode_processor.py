#!/usr/bin/env python3
"""
Comprehensive Pincode Processor
Extracts pincode data from ALL Excel files and database tables
"""

import sqlite3
import pandas as pd
import os
import re
from datetime import datetime
import traceback

class ComprehensivePincodeProcessor:
    def __init__(self, db_path='database.db', excel_dir='Excel Files'):
        self.db_path = db_path
        self.excel_dir = excel_dir
        self.conn = None
        self.stats = {
            'excel_files_processed': 0,
            'excel_records': 0,
            'db_records': 0,
            'unique_pincodes': 0,
            'errors': []
        }
        
    def connect_db(self):
        """Connect to SQLite database"""
        self.conn = sqlite3.connect(self.db_path, timeout=30)
        print("✓ Database connected")
        
    def clean_pincode(self, pincode):
        """Clean and validate pincode"""
        if pd.isna(pincode) or pincode is None or pincode == '':
            return None
        
        pincode_str = str(pincode).strip()
        pincode_clean = re.sub(r'[^0-9]', '', pincode_str)
        
        if len(pincode_clean) == 6 and pincode_clean.isdigit():
            return pincode_clean
        
        return None
    
    def extract_pincode_from_address(self, address):
        """Extract pincode from address text"""
        if pd.isna(address) or address is None:
            return None
            
        address_str = str(address).strip()
        
        patterns = [
            r'Pin-?\s*(\d{6})', r'PIN-?\s*(\d{6})', r'Pincode-?\s*(\d{6})',
            r'(\d{6})$', r'-\s*(\d{6})', r'\b(\d{6})\b'
        ]
        
        for pattern in patterns:
            match = re.search(pattern, address_str)
            if match:
                return self.clean_pincode(match.group(1))
        
        return None
    
    def extract_state_district(self, address):
        """Extract state and district from address"""
        if pd.isna(address) or address is None:
            return None, None
            
        address_upper = str(address).upper()
        
        states = [
            'ANDHRA PRADESH', 'ARUNACHAL PRADESH', 'ASSAM', 'BIHAR', 'CHHATTISGARH',
            'GOA', 'GUJARAT', 'HARYANA', 'HIMACHAL PRADESH', 'JHARKHAND',
            'KARNATAKA', 'KERALA', 'MADHYA PRADESH', 'MAHARASHTRA', 'MANIPUR',
            'MEGHALAYA', 'MIZORAM', 'NAGALAND', 'ODISHA', 'PUNJAB',
            'RAJASTHAN', 'SIKKIM', 'TAMIL NADU', 'TELANGANA', 'TRIPURA',
            'UTTAR PRADESH', 'UTTARAKHAND', 'WEST BENGAL', 'DELHI',
            'JAMMU AND KASHMIR', 'JAMMU & KASHMIR'
        ]
        
        state = None
        for s in states:
            if s in address_upper:
                state = s
                break
        
        district = None
        if state:
            pattern = r',\s*([^,]+),\s*' + re.escape(state)
            match = re.search(pattern, address_upper)
            if match:
                district = match.group(1).strip()
        
        return state, district
    
    def update_pincode_tables(self, pincode, state=None, district=None, city=None, 
                             bank_name=None, bank_ifsc=None, total_pensioners=0,
                             age_less_80=0, age_more_80=0, age_na=0,
                             data_source='', file_name='', sheet_name=''):
        """Update pincode master and pensioner pincode data"""
        cursor = self.conn.cursor()
        
        try:
            # Update pincode_master
            cursor.execute('''
                INSERT INTO pincode_master (pincode, district, state, city, data_source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(pincode) DO UPDATE SET
                    district = COALESCE(excluded.district, district),
                    state = COALESCE(excluded.state, state),
                    city = COALESCE(excluded.city, city),
                    updated_at = CURRENT_TIMESTAMP
            ''', (pincode, district, state, city, data_source))
            
            # Insert into pensioner_pincode_data
            cursor.execute('''
                INSERT INTO pensioner_pincode_data 
                (pincode, district, state, city, bank_name, bank_ifsc,
                 total_pensioners, age_less_than_80, age_more_than_80, age_not_available,
                 data_source, file_name, sheet_name)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (pincode, district, state, city, bank_name, bank_ifsc,
                  total_pensioners, age_less_80, age_more_80, age_na,
                  data_source, file_name, sheet_name))
            
            return True
        except Exception as e:
            print(f"  ⚠️  Error updating pincode {pincode}: {e}")
            return False
    
    def process_excel_file(self, file_path):
        """Process single Excel file"""
        filename = os.path.basename(file_path)
        print(f"\n📄 {filename}")
        
        try:
            excel_file = pd.ExcelFile(file_path)
            file_records = 0
            
            for sheet_name in excel_file.sheet_names:
                try:
                    df = pd.read_excel(file_path, sheet_name=sheet_name)
                    
                    if df.empty or len(df) < 2:
                        continue
                    
                    # Find pincode columns
                    pincode_cols = []
                    state_cols = []
                    city_cols = []
                    district_cols = []
                    
                    for col in df.columns:
                        col_str = str(col).lower()
                        if 'pin' in col_str or 'code' in col_str:
                            pincode_cols.append(col)
                        if 'state' in col_str:
                            state_cols.append(col)
                        if 'city' in col_str:
                            city_cols.append(col)
                        if 'district' in col_str:
                            district_cols.append(col)
                    
                    # Also check first few rows for headers
                    for idx in range(min(3, len(df))):
                        row_text = ' '.join([str(v) for v in df.iloc[idx].values if pd.notna(v)]).upper()
                        if 'PINCODE' in row_text or 'PIN CODE' in row_text:
                            for i, val in enumerate(df.iloc[idx].values):
                                val_str = str(val).upper()
                                if 'PIN' in val_str and df.columns[i] not in pincode_cols:
                                    pincode_cols.append(df.columns[i])
                    
                    if not pincode_cols:
                        continue
                    
                    # Find other relevant columns
                    bank_col = next((col for col in df.columns if 'bank' in str(col).lower() and 'name' in str(col).lower()), None)
                    ifsc_col = next((col for col in df.columns if 'ifsc' in str(col).lower()), None)
                    total_col = next((col for col in df.columns if 'total' in str(col).lower() or 'grand' in str(col).lower()), None)
                    age_80_less = next((col for col in df.columns if '80' in str(col) and 'less' in str(col).lower()), None)
                    age_80_more = next((col for col in df.columns if '80' in str(col) and 'more' in str(col).lower()), None)
                    age_na = next((col for col in df.columns if 'not' in str(col).lower() and 'available' in str(col).lower()), None)
                    
                    sheet_records = 0
                    
                    for idx, row in df.iterrows():
                        if row.isna().all():
                            continue
                        
                        # Try all pincode columns
                        pincode = None
                        for pc in pincode_cols:
                            pincode = self.clean_pincode(row.get(pc))
                            if not pincode:
                                pincode = self.extract_pincode_from_address(row.get(pc))
                            if pincode:
                                break
                        
                        if not pincode:
                            continue
                        
                        state = row.get(state_cols[0]) if state_cols else None
                        city = row.get(city_cols[0]) if city_cols else None
                        district = row.get(district_cols[0]) if district_cols else None
                        
                        # Try to extract from address if not found
                        if not state or not district:
                            for pc in pincode_cols:
                                addr = row.get(pc)
                                if addr:
                                    s, d = self.extract_state_district(addr)
                                    if not state:
                                        state = s
                                    if not district:
                                        district = d
                        
                        bank_name = row.get(bank_col) if bank_col else None
                        ifsc = row.get(ifsc_col) if ifsc_col else None
                        total = int(row.get(total_col, 0)) if total_col and pd.notna(row.get(total_col)) else 0
                        less_80 = int(row.get(age_80_less, 0)) if age_80_less and pd.notna(row.get(age_80_less)) else 0
                        more_80 = int(row.get(age_80_more, 0)) if age_80_more and pd.notna(row.get(age_80_more)) else 0
                        na = int(row.get(age_na, 0)) if age_na and pd.notna(row.get(age_na)) else 0
                        
                        if self.update_pincode_tables(
                            pincode, state, district, city, bank_name, ifsc,
                            total, less_80, more_80, na,
                            'Excel', filename, sheet_name
                        ):
                            sheet_records += 1
                    
                    if sheet_records > 0:
                        print(f"  ✓ {sheet_name}: {sheet_records} records")
                        file_records += sheet_records
                    
                except Exception as e:
                    print(f"  ✗ {sheet_name}: {e}")
                    continue
            
            self.conn.commit()
            self.stats['excel_records'] += file_records
            if file_records > 0:
                self.stats['excel_files_processed'] += 1
            
        except Exception as e:
            print(f"  ✗ Error: {e}")
            self.stats['errors'].append(f"{filename}: {e}")
    
    def process_all_excel_files(self):
        """Process all Excel files"""
        print("\n" + "="*80)
        print("📊 PROCESSING EXCEL FILES")
        print("="*80)
        
        # Main directory
        if os.path.exists(self.excel_dir):
            for file in os.listdir(self.excel_dir):
                if file.endswith(('.xlsx', '.xls')):
                    file_path = os.path.join(self.excel_dir, file)
                    self.process_excel_file(file_path)
        
        # 21Oct subdirectory
        oct_dir = os.path.join(self.excel_dir, '21Oct')
        if os.path.exists(oct_dir):
            print(f"\n📁 Processing 21Oct directory...")
            for file in os.listdir(oct_dir):
                if file.endswith(('.xlsx', '.xls')):
                    file_path = os.path.join(oct_dir, file)
                    self.process_excel_file(file_path)
    
    def process_database_tables(self):
        """Extract pincode data from existing database tables"""
        print("\n" + "="*80)
        print("📊 PROCESSING DATABASE TABLES")
        print("="*80)
        
        cursor = self.conn.cursor()
        
        # 1. bank_pensioner_data
        print("\n📋 bank_pensioner_data")
        try:
            cursor.execute('''
                SELECT branch_pin_code, bank_state, bank_city, bank_name, bank_ifsc,
                       SUM(age_less_than_80), SUM(age_more_than_80), SUM(age_not_available), SUM(grand_total)
                FROM bank_pensioner_data
                WHERE branch_pin_code IS NOT NULL AND branch_pin_code != ''
                GROUP BY branch_pin_code, bank_state, bank_city, bank_name, bank_ifsc
            ''')
            
            count = 0
            for row in cursor.fetchall():
                pincode = self.clean_pincode(row[0])
                if pincode:
                    self.update_pincode_tables(
                        pincode, row[1], None, row[2], row[3], row[4],
                        row[8], row[5], row[6], row[7],
                        'bank_pensioner_data', '', ''
                    )
                    count += 1
            
            self.conn.commit()
            print(f"  ✓ {count} records processed")
            self.stats['db_records'] += count
        except Exception as e:
            print(f"  ✗ Error: {e}")
        
        # 2. doppw_pensioner_data
        print("\n📋 doppw_pensioner_data")
        try:
            cursor.execute('''
                SELECT branch_pincode, branch_state, pensioner_pincode, pensioner_state, pensioner_district,
                       COUNT(*) as count
                FROM doppw_pensioner_data
                WHERE branch_pincode IS NOT NULL OR pensioner_pincode IS NOT NULL
                GROUP BY branch_pincode, branch_state, pensioner_pincode, pensioner_state, pensioner_district
            ''')
            
            count = 0
            for row in cursor.fetchall():
                # Branch pincode
                branch_pin = self.clean_pincode(row[0])
                if branch_pin:
                    self.update_pincode_tables(
                        branch_pin, row[1], None, None, None, None,
                        row[5], 0, 0, 0,
                        'doppw_pensioner_data_branch', '', ''
                    )
                    count += 1
                
                # Pensioner pincode
                pensioner_pin = self.clean_pincode(row[2])
                if pensioner_pin:
                    self.update_pincode_tables(
                        pensioner_pin, row[3], row[4], None, None, None,
                        row[5], 0, 0, 0,
                        'doppw_pensioner_data_pensioner', '', ''
                    )
                    count += 1
            
            self.conn.commit()
            print(f"  ✓ {count} records processed")
            self.stats['db_records'] += count
        except Exception as e:
            print(f"  ✗ Error: {e}")
        
        # 3. dot_pensioner_data
        print("\n📋 dot_pensioner_data")
        try:
            cursor.execute('''
                SELECT pensioner_pincode, pda_pincode, COUNT(*) as count
                FROM dot_pensioner_data
                WHERE pensioner_pincode IS NOT NULL OR pda_pincode IS NOT NULL
                GROUP BY pensioner_pincode, pda_pincode
            ''')
            
            count = 0
            for row in cursor.fetchall():
                pensioner_pin = self.clean_pincode(row[0])
                if pensioner_pin:
                    self.update_pincode_tables(
                        pensioner_pin, None, None, None, None, None,
                        row[2], 0, 0, 0,
                        'dot_pensioner_data', '', ''
                    )
                    count += 1
                
                pda_pin = self.clean_pincode(row[1])
                if pda_pin and pda_pin != pensioner_pin:
                    self.update_pincode_tables(
                        pda_pin, None, None, None, None, None,
                        row[2], 0, 0, 0,
                        'dot_pensioner_data_pda', '', ''
                    )
                    count += 1
            
            self.conn.commit()
            print(f"  ✓ {count} records processed")
            self.stats['db_records'] += count
        except Exception as e:
            print(f"  ✗ Error: {e}")
        
        # 4. ubi1_pensioner_data
        print("\n📋 ubi1_pensioner_data")
        try:
            cursor.execute('''
                SELECT pensioner_pincode, pensioner_state, pensioner_city, COUNT(*) as count
                FROM ubi1_pensioner_data
                WHERE pensioner_pincode IS NOT NULL
                GROUP BY pensioner_pincode, pensioner_state, pensioner_city
            ''')
            
            count = 0
            for row in cursor.fetchall():
                pincode = self.clean_pincode(row[0])
                if pincode:
                    self.update_pincode_tables(
                        pincode, row[1], None, row[2], None, None,
                        row[3], 0, 0, 0,
                        'ubi1_pensioner_data', '', ''
                    )
                    count += 1
            
            self.conn.commit()
            print(f"  ✓ {count} records processed")
            self.stats['db_records'] += count
        except Exception as e:
            print(f"  ✗ Error: {e}")
        
        # 5. ubi3_pensioner_data
        print("\n📋 ubi3_pensioner_data")
        try:
            cursor.execute('''
                SELECT branch_pincode, pensioner_pincode, pensioner_state, pensioner_city, COUNT(*) as count
                FROM ubi3_pensioner_data
                WHERE branch_pincode IS NOT NULL OR pensioner_pincode IS NOT NULL
                GROUP BY branch_pincode, pensioner_pincode, pensioner_state, pensioner_city
            ''')
            
            count = 0
            for row in cursor.fetchall():
                branch_pin = self.clean_pincode(row[0])
                if branch_pin:
                    self.update_pincode_tables(
                        branch_pin, row[2], None, row[3], None, None,
                        row[4], 0, 0, 0,
                        'ubi3_pensioner_data_branch', '', ''
                    )
                    count += 1
                
                pensioner_pin = self.clean_pincode(row[1])
                if pensioner_pin and pensioner_pin != branch_pin:
                    self.update_pincode_tables(
                        pensioner_pin, row[2], None, row[3], None, None,
                        row[4], 0, 0, 0,
                        'ubi3_pensioner_data_pensioner', '', ''
                    )
                    count += 1
            
            self.conn.commit()
            print(f"  ✓ {count} records processed")
            self.stats['db_records'] += count
        except Exception as e:
            print(f"  ✗ Error: {e}")
    
    def update_statistics(self):
        """Update pincode statistics table"""
        print("\n" + "="*80)
        print("📊 UPDATING STATISTICS")
        print("="*80)
        
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
        self.stats['unique_pincodes'] = count
    
    def generate_report(self):
        """Generate comprehensive report"""
        print("\n" + "="*80)
        print("📊 FINAL REPORT")
        print("="*80)
        
        cursor = self.conn.cursor()
        
        print(f"\n✅ Processing Summary:")
        print(f"  Excel files processed: {self.stats['excel_files_processed']}")
        print(f"  Excel records: {self.stats['excel_records']:,}")
        print(f"  Database records: {self.stats['db_records']:,}")
        print(f"  Unique pincodes: {self.stats['unique_pincodes']:,}")
        
        cursor.execute('SELECT COUNT(*) FROM pincode_master')
        total_pincodes = cursor.fetchone()[0]
        print(f"\n📍 Total Pincodes in Master: {total_pincodes:,}")
        
        cursor.execute('SELECT COUNT(*) FROM pensioner_pincode_data')
        total_records = cursor.fetchone()[0]
        print(f"📊 Total Pincode Records: {total_records:,}")
        
        cursor.execute('SELECT SUM(total_pensioners) FROM pincode_statistics')
        total_pensioners = cursor.fetchone()[0] or 0
        print(f"👥 Total Pensioners: {total_pensioners:,}")
        
        print(f"\n🏆 Top 15 States by Pincode Count:")
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
        
        print(f"\n🏆 Top 20 Pincodes by Pensioner Count:")
        cursor.execute('''
            SELECT pincode, state, district, total_pensioners, total_banks
            FROM pincode_statistics
            ORDER BY total_pensioners DESC
            LIMIT 20
        ''')
        
        for idx, row in enumerate(cursor.fetchall(), 1):
            state = row[1] or 'Unknown'
            district = row[2] or 'Unknown'
            print(f"  {idx}. {row[0]} ({state}, {district}): {row[3]:,} pensioners, {row[4]} banks")
        
        if self.stats['errors']:
            print(f"\n⚠️  Errors ({len(self.stats['errors'])}):")
            for error in self.stats['errors'][:5]:
                print(f"  - {error}")
            if len(self.stats['errors']) > 5:
                print(f"  ... and {len(self.stats['errors']) - 5} more")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("\n✓ Database connection closed")
    
    def run(self):
        """Main execution"""
        try:
            print("="*80)
            print("🚀 COMPREHENSIVE PINCODE PROCESSOR")
            print("="*80)
            
            self.connect_db()
            self.process_all_excel_files()
            self.process_database_tables()
            self.update_statistics()
            self.generate_report()
            
            print("\n✅ Processing completed successfully!")
            
        except Exception as e:
            print(f"\n❌ Error: {e}")
            traceback.print_exc()
        finally:
            self.close()

if __name__ == "__main__":
    processor = ComprehensivePincodeProcessor()
    processor.run()
