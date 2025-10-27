#!/usr/bin/env python3
"""
DLC Portal Data Processor
Processes pensioner data in DLC Portal format with:
- Pincode-wise analysis (Pensioner + Branch)
- Age calculation from Year of Birth
- PSA hierarchy parsing
- Duplicate prevention
- District/State mapping
"""

import sqlite3
import pandas as pd
import re
from datetime import datetime
import sys
import os

class DLCPortalProcessor:
    def __init__(self, db_path='dlc_portal_database.db'):
        self.db_path = db_path
        self.conn = None
        self.current_year = datetime.now().year
        
        # Pincode to District/State mapping (sample - expand as needed)
        self.pincode_mapping = self.load_pincode_mapping()
        
    def load_pincode_mapping(self):
        """
        Load pincode to district/state mapping
        You can expand this or load from a separate CSV file
        """
        return {
            '783301': {'district': 'Dhubri', 'state': 'Assam'},
            '110001': {'district': 'New Delhi', 'state': 'Delhi'},
            '400001': {'district': 'Mumbai', 'state': 'Maharashtra'},
            '560001': {'district': 'Bangalore', 'state': 'Karnataka'},
            '600001': {'district': 'Chennai', 'state': 'Tamil Nadu'},
            # Add more mappings as needed
        }
    
    def connect(self):
        """Connect to database and create tables"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.create_tables()
            print(f"✓ Connected to database: {self.db_path}")
            return True
        except Exception as e:
            print(f"✗ Error connecting to database: {e}")
            return False
    
    def create_tables(self):
        """Create database tables with proper schema"""
        cursor = self.conn.cursor()
        
        # Main pensioner data table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS dlc_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ppo_number TEXT UNIQUE NOT NULL,
                year_of_birth TEXT,
                birth_year INTEGER,
                age INTEGER,
                age_category TEXT,
                
                -- PSA Details
                psa_full TEXT,
                psa_type TEXT,
                psa_division TEXT,
                psa_area TEXT,
                psa_pincode TEXT,
                
                -- Pincode Details
                branch_pincode TEXT,
                branch_pincode_clean TEXT,
                pensioner_pincode TEXT,
                pensioner_pincode_clean TEXT,
                
                -- Location Details (from pincode mapping)
                pensioner_district TEXT,
                pensioner_state TEXT,
                branch_district TEXT,
                branch_state TEXT,
                
                -- Metadata
                file_source TEXT,
                sheet_source TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create indexes for fast queries
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_ppo ON dlc_pensioner_data(ppo_number)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pensioner_pincode ON dlc_pensioner_data(pensioner_pincode_clean)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_branch_pincode ON dlc_pensioner_data(branch_pincode_clean)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_age_category ON dlc_pensioner_data(age_category)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pensioner_state ON dlc_pensioner_data(pensioner_state)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_pensioner_district ON dlc_pensioner_data(pensioner_district)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_psa_type ON dlc_pensioner_data(psa_type)')
        
        # Summary table for quick statistics
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS pincode_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pincode TEXT UNIQUE,
                district TEXT,
                state TEXT,
                total_pensioners INTEGER DEFAULT 0,
                age_less_than_60 INTEGER DEFAULT 0,
                age_60_to_70 INTEGER DEFAULT 0,
                age_70_to_80 INTEGER DEFAULT 0,
                age_more_than_80 INTEGER DEFAULT 0,
                age_not_available INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        self.conn.commit()
        print("✓ Database tables created successfully")
    
    def extract_pincode(self, text):
        """
        Extract 6-digit pincode from text
        Examples:
        - "Dhubri H.O , Pin- 783301" → "783301"
        - "783301" → "783301"
        - "Pin-110001" → "110001"
        """
        if pd.isna(text) or text is None:
            return None
        
        text = str(text).strip()
        
        # Try to find 6-digit number
        match = re.search(r'\b(\d{6})\b', text)
        if match:
            return match.group(1)
        
        return None
    
    def parse_psa_details(self, psa_text):
        """
        Parse PSA (Pension Sanctioning Authority) details
        Example: "SPOs,Goalpara Div, Dhubri-783301"
        Returns: {
            'type': 'SPOs',
            'division': 'Goalpara Div',
            'area': 'Dhubri',
            'pincode': '783301'
        }
        """
        if pd.isna(psa_text) or psa_text is None:
            return {'type': None, 'division': None, 'area': None, 'pincode': None}
        
        psa_text = str(psa_text).strip()
        parts = [p.strip() for p in psa_text.split(',')]
        
        result = {
            'type': parts[0] if len(parts) > 0 else None,
            'division': parts[1] if len(parts) > 1 else None,
            'area': None,
            'pincode': None
        }
        
        # Extract area and pincode from last part (e.g., "Dhubri-783301")
        if len(parts) > 2:
            last_part = parts[2]
            if '-' in last_part:
                area_pincode = last_part.split('-')
                result['area'] = area_pincode[0].strip()
                result['pincode'] = area_pincode[1].strip() if len(area_pincode) > 1 else None
            else:
                result['area'] = last_part
        
        return result
    
    def parse_year_of_birth(self, yob_text):
        """
        Parse Year of Birth from various formats
        Examples:
        - "21-01-1946" → 1946
        - "1946" → 1946
        - Excel date (18678) → calculated year
        """
        if pd.isna(yob_text) or yob_text is None:
            return None
        
        # If it's already an integer (year)
        if isinstance(yob_text, int):
            if 1900 <= yob_text <= self.current_year:
                return yob_text
            # Excel date format (days since 1900-01-01)
            elif yob_text > 10000:
                return 1900 + (yob_text // 365)
        
        # If it's a string
        text = str(yob_text).strip()
        
        # Format: DD-MM-YYYY or DD/MM/YYYY
        date_patterns = [
            r'(\d{2})[-/](\d{2})[-/](\d{4})',  # DD-MM-YYYY
            r'(\d{4})[-/](\d{2})[-/](\d{2})',  # YYYY-MM-DD
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                groups = match.groups()
                # Find the 4-digit year
                for g in groups:
                    if len(g) == 4:
                        year = int(g)
                        if 1900 <= year <= self.current_year:
                            return year
        
        # Try to extract 4-digit year directly
        match = re.search(r'\b(19\d{2}|20\d{2})\b', text)
        if match:
            return int(match.group(1))
        
        return None
    
    def calculate_age(self, birth_year):
        """Calculate current age from birth year"""
        if birth_year is None:
            return None
        return self.current_year - birth_year
    
    def get_age_category(self, age):
        """
        Categorize age into groups
        Categories: <60, 60-70, 70-80, >80, N/A
        """
        if age is None:
            return 'AGE_NOT_AVAILABLE'
        elif age < 60:
            return 'AGE_LESS_THAN_60'
        elif 60 <= age < 70:
            return 'AGE_60_TO_70'
        elif 70 <= age < 80:
            return 'AGE_70_TO_80'
        else:
            return 'AGE_MORE_THAN_80'
    
    def get_location_from_pincode(self, pincode):
        """Get district and state from pincode"""
        if pincode in self.pincode_mapping:
            return self.pincode_mapping[pincode]
        return {'district': None, 'state': None}
    
    def check_duplicate(self, ppo_number):
        """Check if PPO number already exists"""
        cursor = self.conn.cursor()
        cursor.execute('SELECT id FROM dlc_pensioner_data WHERE ppo_number = ?', (ppo_number,))
        return cursor.fetchone() is not None
    
    def process_excel_file(self, file_path, sheet_name=None):
        """
        Process Excel file in DLC Portal format
        Expected columns:
        - S. No / Sl. No / SL.NO.
        - PPO No. / PPO_NUM
        - Year of Birth / Date of Birth
        - Pension Sanctioning Authority
        - Address PinCode of Pension Disbursing Branch
        - Postal Address PinCode of pensioner
        """
        print(f"\n{'='*80}")
        print(f"Processing: {os.path.basename(file_path)}")
        print(f"{'='*80}")
        
        try:
            # Read Excel file
            if sheet_name:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
            else:
                # Read first sheet
                df = pd.read_excel(file_path)
            
            print(f"✓ Loaded {len(df)} rows")
            print(f"✓ Columns: {list(df.columns)}")
            
            # Detect column names (case-insensitive, flexible matching)
            col_mapping = self.detect_columns(df.columns)
            print(f"\n✓ Column Mapping:")
            for key, val in col_mapping.items():
                print(f"  {key}: {val}")
            
            # Process each row
            inserted = 0
            duplicates = 0
            errors = 0
            
            for idx, row in df.iterrows():
                try:
                    # Extract PPO number
                    ppo_number = str(row[col_mapping['ppo']]).strip() if col_mapping['ppo'] else None
                    
                    if not ppo_number or ppo_number == 'nan':
                        continue
                    
                    # Check for duplicate
                    if self.check_duplicate(ppo_number):
                        duplicates += 1
                        continue
                    
                    # Parse Year of Birth
                    yob_text = row[col_mapping['yob']] if col_mapping['yob'] else None
                    birth_year = self.parse_year_of_birth(yob_text)
                    age = self.calculate_age(birth_year)
                    age_category = self.get_age_category(age)
                    
                    # Parse PSA
                    psa_text = row[col_mapping['psa']] if col_mapping['psa'] else None
                    psa_details = self.parse_psa_details(psa_text)
                    
                    # Extract Pincodes
                    branch_pincode_raw = row[col_mapping['branch_pin']] if col_mapping['branch_pin'] else None
                    pensioner_pincode_raw = row[col_mapping['pensioner_pin']] if col_mapping['pensioner_pin'] else None
                    
                    branch_pincode = self.extract_pincode(branch_pincode_raw)
                    pensioner_pincode = self.extract_pincode(pensioner_pincode_raw)
                    
                    # Get location details
                    pensioner_location = self.get_location_from_pincode(pensioner_pincode) if pensioner_pincode else {'district': None, 'state': None}
                    branch_location = self.get_location_from_pincode(branch_pincode) if branch_pincode else {'district': None, 'state': None}
                    
                    # Insert into database
                    cursor = self.conn.cursor()
                    cursor.execute('''
                        INSERT INTO dlc_pensioner_data (
                            ppo_number, year_of_birth, birth_year, age, age_category,
                            psa_full, psa_type, psa_division, psa_area, psa_pincode,
                            branch_pincode, branch_pincode_clean,
                            pensioner_pincode, pensioner_pincode_clean,
                            pensioner_district, pensioner_state,
                            branch_district, branch_state,
                            file_source, sheet_source
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (
                        ppo_number,
                        str(yob_text) if yob_text else None,
                        birth_year,
                        age,
                        age_category,
                        str(psa_text) if psa_text else None,
                        psa_details['type'],
                        psa_details['division'],
                        psa_details['area'],
                        psa_details['pincode'],
                        str(branch_pincode_raw) if branch_pincode_raw else None,
                        branch_pincode,
                        str(pensioner_pincode_raw) if pensioner_pincode_raw else None,
                        pensioner_pincode,
                        pensioner_location['district'],
                        pensioner_location['state'],
                        branch_location['district'],
                        branch_location['state'],
                        os.path.basename(file_path),
                        sheet_name
                    ))
                    
                    inserted += 1
                    
                    # Progress indicator
                    if inserted % 1000 == 0:
                        print(f"  Processed {inserted} records...", end='\r')
                
                except Exception as e:
                    errors += 1
                    if errors <= 5:  # Show first 5 errors
                        print(f"\n  ✗ Error at row {idx}: {e}")
            
            self.conn.commit()
            
            # Update summary
            self.update_pincode_summary()
            
            print(f"\n\n{'='*80}")
            print(f"PROCESSING COMPLETE")
            print(f"{'='*80}")
            print(f"✓ Inserted: {inserted:,} records")
            print(f"⚠ Duplicates skipped: {duplicates:,}")
            print(f"✗ Errors: {errors:,}")
            print(f"{'='*80}\n")
            
            return inserted
            
        except Exception as e:
            print(f"✗ Error processing file: {e}")
            import traceback
            traceback.print_exc()
            return 0
    
    def detect_columns(self, columns):
        """
        Detect column names from various formats
        Returns mapping of standard names to actual column names
        """
        col_map = {
            'ppo': None,
            'yob': None,
            'psa': None,
            'branch_pin': None,
            'pensioner_pin': None
        }
        
        # Convert to lowercase for matching
        cols_lower = {col.lower().strip(): col for col in columns}
        
        # PPO Number patterns
        ppo_patterns = ['ppo no', 'ppo_num', 'ppo number', 'ppo_no']
        for pattern in ppo_patterns:
            for col_lower, col_original in cols_lower.items():
                if pattern in col_lower:
                    col_map['ppo'] = col_original
                    break
            if col_map['ppo']:
                break
        
        # Year of Birth patterns
        yob_patterns = ['year of birth', 'date of birth', 'birth_year', 'dob']
        for pattern in yob_patterns:
            for col_lower, col_original in cols_lower.items():
                if pattern in col_lower:
                    col_map['yob'] = col_original
                    break
            if col_map['yob']:
                break
        
        # PSA patterns
        psa_patterns = ['pension sanctioning authority', 'psa', 'sanctioning authority']
        for pattern in psa_patterns:
            for col_lower, col_original in cols_lower.items():
                if pattern in col_lower:
                    col_map['psa'] = col_original
                    break
            if col_map['psa']:
                break
        
        # Branch Pincode patterns
        branch_patterns = ['branch pin', 'disbursing branch', 'branch_pin', 'address pincode of pension disbursing']
        for pattern in branch_patterns:
            for col_lower, col_original in cols_lower.items():
                if pattern in col_lower:
                    col_map['branch_pin'] = col_original
                    break
            if col_map['branch_pin']:
                break
        
        # Pensioner Pincode patterns
        pensioner_patterns = ['pensioner pin', 'postal address pin', 'pensioner_pin', 'postal address pincode of pensioner']
        for pattern in pensioner_patterns:
            for col_lower, col_original in cols_lower.items():
                if pattern in col_lower:
                    col_map['pensioner_pin'] = col_original
                    break
            if col_map['pensioner_pin']:
                break
        
        return col_map
    
    def update_pincode_summary(self):
        """Update pincode summary table with aggregated statistics"""
        cursor = self.conn.cursor()
        
        # Clear existing summary
        cursor.execute('DELETE FROM pincode_summary')
        
        # Aggregate by pensioner pincode
        cursor.execute('''
            INSERT INTO pincode_summary (
                pincode, district, state,
                total_pensioners,
                age_less_than_60, age_60_to_70, age_70_to_80,
                age_more_than_80, age_not_available
            )
            SELECT 
                pensioner_pincode_clean as pincode,
                pensioner_district as district,
                pensioner_state as state,
                COUNT(*) as total_pensioners,
                SUM(CASE WHEN age_category = 'AGE_LESS_THAN_60' THEN 1 ELSE 0 END) as age_less_than_60,
                SUM(CASE WHEN age_category = 'AGE_60_TO_70' THEN 1 ELSE 0 END) as age_60_to_70,
                SUM(CASE WHEN age_category = 'AGE_70_TO_80' THEN 1 ELSE 0 END) as age_70_to_80,
                SUM(CASE WHEN age_category = 'AGE_MORE_THAN_80' THEN 1 ELSE 0 END) as age_more_than_80,
                SUM(CASE WHEN age_category = 'AGE_NOT_AVAILABLE' THEN 1 ELSE 0 END) as age_not_available
            FROM dlc_pensioner_data
            WHERE pensioner_pincode_clean IS NOT NULL
            GROUP BY pensioner_pincode_clean, pensioner_district, pensioner_state
        ''')
        
        self.conn.commit()
        print("✓ Pincode summary updated")
    
    def get_statistics(self):
        """Get overall statistics"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print("DATABASE STATISTICS")
        print(f"{'='*80}\n")
        
        # Total records
        cursor.execute('SELECT COUNT(*) FROM dlc_pensioner_data')
        total = cursor.fetchone()[0]
        print(f"📊 Total Pensioners: {total:,}")
        
        # Age category breakdown
        print(f"\n👥 Age Category Breakdown:")
        cursor.execute('''
            SELECT age_category, COUNT(*) as count
            FROM dlc_pensioner_data
            GROUP BY age_category
            ORDER BY count DESC
        ''')
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]:,}")
        
        # Top 10 pincodes
        print(f"\n📍 Top 10 Pincodes by Pensioner Count:")
        cursor.execute('''
            SELECT pincode, district, state, total_pensioners
            FROM pincode_summary
            ORDER BY total_pensioners DESC
            LIMIT 10
        ''')
        for idx, row in enumerate(cursor.fetchall(), 1):
            print(f"  {idx}. {row[0]} ({row[1]}, {row[2]}): {row[3]:,} pensioners")
        
        # PSA type breakdown
        print(f"\n🏛️  PSA Type Breakdown:")
        cursor.execute('''
            SELECT psa_type, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE psa_type IS NOT NULL
            GROUP BY psa_type
            ORDER BY count DESC
            LIMIT 10
        ''')
        for row in cursor.fetchall():
            print(f"  {row[0]}: {row[1]:,}")
        
        print(f"\n{'='*80}\n")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("✓ Database connection closed")

def main():
    """Main function"""
    print("="*80)
    print("DLC PORTAL DATA PROCESSOR")
    print("="*80)
    
    if len(sys.argv) < 2:
        print("\nUsage: python3 dlc_portal_processor.py <excel_file> [sheet_name]")
        print("\nExample:")
        print("  python3 dlc_portal_processor.py 'ASSAM DLC PORTAL DATA.xlsx'")
        print("  python3 dlc_portal_processor.py 'ASSAM DLC PORTAL DATA.xlsx' 'Sheet1'")
        return
    
    file_path = sys.argv[1]
    sheet_name = sys.argv[2] if len(sys.argv) > 2 else None
    
    if not os.path.exists(file_path):
        print(f"✗ File not found: {file_path}")
        return
    
    # Initialize processor
    processor = DLCPortalProcessor()
    
    if not processor.connect():
        return
    
    try:
        # Process file
        processor.process_excel_file(file_path, sheet_name)
        
        # Show statistics
        processor.get_statistics()
        
    finally:
        processor.close()

if __name__ == "__main__":
    main()
