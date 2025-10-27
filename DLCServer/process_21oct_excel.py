#!/usr/bin/env python3
"""
Process Excel files from 21Oct directory and insert into database
Maps the pensioner data to appropriate database tables
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
from datetime import datetime
import re
import numpy as np

class Excel21OctProcessor:
    def __init__(self, db_path="database.db"):
        self.db_path = db_path
        self.processed_files = []
        self.total_records = 0
        self.errors = []
        
    def connect_db(self):
        """Connect to SQLite database"""
        return sqlite3.connect(self.db_path)
    
    def extract_year_from_birth(self, birth_value):
        """Extract year from various birth date formats"""
        if pd.isna(birth_value):
            return None
            
        try:
            # If it's already a datetime object
            if isinstance(birth_value, datetime):
                return birth_value.year
                
            # If it's a string, try to parse it
            birth_str = str(birth_value).strip()
            
            # Try different date formats
            date_formats = [
                '%d-%m-%Y',  # 21-01-1946
                '%d/%m/%Y',  # 21/01/1946
                '%Y-%m-%d',  # 1946-01-21
                '%Y/%m/%d',  # 1946/01/21
                '%d.%m.%Y',  # 21.01.1946
            ]
            
            for fmt in date_formats:
                try:
                    date_obj = datetime.strptime(birth_str, fmt)
                    return date_obj.year
                except ValueError:
                    continue
            
            # Try to extract just the year (4 digits)
            year_match = re.search(r'\b(19|20)\d{2}\b', birth_str)
            if year_match:
                return int(year_match.group())
                
            return None
            
        except Exception as e:
            print(f"   ⚠️  Error parsing birth date '{birth_value}': {e}")
            return None
    
    def extract_pincode(self, address_text):
        """Extract pincode from address text"""
        if pd.isna(address_text):
            return None
            
        try:
            address_str = str(address_text).strip()
            
            # Look for 6-digit pincode patterns
            pincode_patterns = [
                r'Pin-?\s*(\d{6})',  # Pin- 783301
                r'PIN-?\s*(\d{6})',  # PIN 783301
                r'Pincode-?\s*(\d{6})',  # Pincode 783301
                r'(\d{6})$',  # 783301 at end
                r'\b(\d{6})\b',  # Any 6-digit number
            ]
            
            for pattern in pincode_patterns:
                match = re.search(pattern, address_str)
                if match:
                    return match.group(1)
                    
            return None
            
        except Exception as e:
            print(f"   ⚠️  Error extracting pincode from '{address_text}': {e}")
            return None
    
    def extract_state_from_filename(self, filename):
        """Extract state name from filename"""
        filename_upper = filename.upper()
        
        state_mappings = {
            'ASSAM': 'ASSAM',
            'BIHAR': 'BIHAR', 
            'CHHATTISGARH': 'CHHATTISGARH',
            'GUJARAT': 'GUJARAT',
            'JHARKHAND': 'JHARKHAND',
            'JK': 'JAMMU AND KASHMIR',
            'KARNATAKA': 'KARNATAKA',
            'NE': 'NORTH EAST',
            'PUNJAB': 'PUNJAB',
            'TELANGANA': 'TELANGANA',
            'UP': 'UTTAR PRADESH',
        }
        
        for key, state in state_mappings.items():
            if key in filename_upper:
                return state
                
        # For bank files, try to extract state from data
        return None
    
    def calculate_age(self, birth_year):
        """Calculate age from birth year"""
        if birth_year is None:
            return None
        try:
            current_year = datetime.now().year
            return current_year - int(birth_year)
        except:
            return None
    
    def process_excel_file(self, file_path):
        """Process a single Excel file"""
        filename = os.path.basename(file_path)
        print(f"\n📄 Processing: {filename}")
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
                    sheet_records = self.process_sheet_data(df, filename, sheet_name)
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
    
    def process_sheet_data(self, df, filename, sheet_name):
        """Process data from a single sheet"""
        records_inserted = 0
        
        try:
            # Identify the header row (usually row 0 or 1)
            header_row = 0
            
            # Look for header indicators
            for idx, row in df.head(3).iterrows():
                row_str = ' '.join([str(val) for val in row.values if pd.notna(val)]).upper()
                if 'PPO' in row_str and ('BIRTH' in row_str or 'YEAR' in row_str):
                    header_row = idx
                    break
            
            # Skip to data rows
            data_df = df.iloc[header_row + 1:].copy()
            
            if data_df.empty:
                return 0
            
            # Identify columns based on content
            columns = df.columns.tolist()
            
            # Map columns to our database fields
            ppo_col = None
            birth_col = None
            psa_col = None
            branch_pincode_col = None
            pensioner_pincode_col = None
            
            # Find PPO column
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                if 'PPO' in header_text:
                    ppo_col = col
                    break
            
            # Find Birth column
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                if 'BIRTH' in header_text or 'YEAR' in header_text:
                    birth_col = col
                    break
            
            # Find PSA column
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                if 'SANCTION' in header_text or 'AUTHORITY' in header_text or 'PSA' in header_text:
                    psa_col = col
                    break
            
            # Find Branch Pincode column
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                if 'DISBURSING' in header_text or 'BRANCH' in header_text:
                    branch_pincode_col = col
                    break
            
            # Find Pensioner Pincode column
            for i, col in enumerate(columns):
                header_text = str(df.iloc[header_row, i]).upper() if pd.notna(df.iloc[header_row, i]) else ""
                if 'POSTAL' in header_text or 'PENSIONER' in header_text:
                    pensioner_pincode_col = col
                    break
            
            # If columns not found by header, use positional mapping
            if not ppo_col and len(columns) > 1:
                ppo_col = columns[1]  # Usually second column
            if not birth_col and len(columns) > 2:
                birth_col = columns[2]  # Usually third column
            if not psa_col and len(columns) > 3:
                psa_col = columns[3]  # Usually fourth column
            if not branch_pincode_col and len(columns) > 4:
                branch_pincode_col = columns[4]  # Usually fifth column
            if not pensioner_pincode_col and len(columns) > 5:
                pensioner_pincode_col = columns[5]  # Usually sixth column
            
            print(f"      📊 Column mapping:")
            print(f"         PPO: {ppo_col}")
            print(f"         Birth: {birth_col}")
            print(f"         PSA: {psa_col}")
            print(f"         Branch Pincode: {branch_pincode_col}")
            print(f"         Pensioner Pincode: {pensioner_pincode_col}")
            
            # Extract state from filename
            state = self.extract_state_from_filename(filename)
            
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
                    ppo_no = str(row[ppo_col]).strip() if ppo_col and pd.notna(row[ppo_col]) else None
                    
                    # Skip if no PPO number
                    if not ppo_no or ppo_no == 'nan':
                        continue
                    
                    birth_value = row[birth_col] if birth_col else None
                    birth_year = self.extract_year_from_birth(birth_value)
                    age = self.calculate_age(birth_year)
                    
                    psa = str(row[psa_col]).strip() if psa_col and pd.notna(row[psa_col]) else None
                    
                    branch_address = str(row[branch_pincode_col]).strip() if branch_pincode_col and pd.notna(row[branch_pincode_col]) else None
                    branch_pincode = self.extract_pincode(branch_address)
                    
                    pensioner_address = str(row[pensioner_pincode_col]).strip() if pensioner_pincode_col and pd.notna(row[pensioner_pincode_col]) else None
                    pensioner_pincode = self.extract_pincode(pensioner_address)
                    
                    # Insert into doppw_pensioner_data table (most appropriate for this data)
                    cursor.execute("""
                        INSERT INTO doppw_pensioner_data (
                            file_name, sheet_name, gcode, pension_type, 
                            branch_pincode, branch_state, birth_year, age,
                            pensioner_pincode, pensioner_state, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        filename,
                        sheet_name,
                        ppo_no,  # Using PPO as gcode
                        'POSTAL' if 'POSTAL' in str(ppo_no).upper() else 'PENSION',
                        branch_pincode,
                        state,
                        birth_year,
                        age,
                        pensioner_pincode,
                        state,
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
    
    def process_all_files(self):
        """Process all Excel files in the 21Oct directory"""
        excel_dir = Path("Excel Files/21Oct")
        
        if not excel_dir.exists():
            print(f"❌ Directory not found: {excel_dir}")
            return
        
        excel_files = list(excel_dir.glob("*.xlsx"))
        print(f"📁 Found {len(excel_files)} Excel files to process")
        print("=" * 60)
        
        for file_path in excel_files:
            self.process_excel_file(file_path)
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 PROCESSING SUMMARY")
        print("=" * 60)
        print(f"✅ Files processed: {len(self.processed_files)}")
        print(f"📝 Total records inserted: {self.total_records}")
        
        if self.errors:
            print(f"⚠️  Errors encountered: {len(self.errors)}")
            for error in self.errors[:5]:  # Show first 5 errors
                print(f"   - {error}")
            if len(self.errors) > 5:
                print(f"   ... and {len(self.errors) - 5} more errors")
        
        print(f"\n🎯 Data has been inserted into the 'doppw_pensioner_data' table")
        
        # Show database stats
        self.show_database_stats()
    
    def show_database_stats(self):
        """Show database statistics after processing"""
        try:
            conn = self.connect_db()
            cursor = conn.cursor()
            
            # Get total records
            cursor.execute("SELECT COUNT(*) FROM doppw_pensioner_data")
            total_records = cursor.fetchone()[0]
            
            # Get records by state
            cursor.execute("""
                SELECT pensioner_state, COUNT(*) as count 
                FROM doppw_pensioner_data 
                WHERE pensioner_state IS NOT NULL 
                GROUP BY pensioner_state 
                ORDER BY count DESC
            """)
            state_stats = cursor.fetchall()
            
            # Get records by file
            cursor.execute("""
                SELECT file_name, COUNT(*) as count 
                FROM doppw_pensioner_data 
                WHERE file_name LIKE '%21Oct%' OR file_name IN (
                    'ASSAM DLC PORTAL DATA.xlsx', 'BIHAR DLC PORTAL DATA.xlsx', 
                    'HDFC.xlsx', 'Bank of Maharashtra.xlsx'
                )
                GROUP BY file_name 
                ORDER BY count DESC
            """)
            file_stats = cursor.fetchall()
            
            print(f"\n📈 DATABASE STATISTICS")
            print("-" * 30)
            print(f"Total records in database: {total_records}")
            
            if state_stats:
                print(f"\nRecords by state:")
                for state, count in state_stats[:10]:
                    print(f"   {state}: {count}")
            
            if file_stats:
                print(f"\nRecords from processed files:")
                for filename, count in file_stats:
                    print(f"   {filename}: {count}")
            
            conn.close()
            
        except Exception as e:
            print(f"⚠️  Error showing database stats: {e}")

def main():
    processor = Excel21OctProcessor()
    processor.process_all_files()

if __name__ == "__main__":
    main()