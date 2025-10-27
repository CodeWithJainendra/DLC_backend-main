#!/usr/bin/env python3
"""
Flexible Excel to Database Processor
Handles multiple Excel file formats and creates appropriate database tables
"""

import pandas as pd
import sqlite3
import os
import sys
from pathlib import Path
import logging
import re

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class FlexibleExcelProcessor:
    def __init__(self, db_path="database.db"):
        self.db_path = db_path
        self.conn = None
        
    def connect_db(self):
        """Connect to SQLite database"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            logger.info(f"Connected to database: {self.db_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            return False
    
    def close_db(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed")
    
    def detect_file_format(self, excel_path):
        """Detect the format of Excel file"""
        try:
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            
            # Check first sheet to determine format
            first_sheet = sheets[0]
            df_raw = pd.read_excel(excel_path, sheet_name=first_sheet, header=None)
            
            # Look for patterns in the data
            format_type = "unknown"
            
            # Check for bank data format (BANK_STATE, BANK_CITY, etc.)
            # Look more thoroughly through the first few rows
            for i in range(min(15, len(df_raw))):
                row_str = str(df_raw.iloc[i].tolist()).upper()
                bank_keywords = ['BANK_STATE', 'BANK_CITY', 'BANK_NAME', 'BANK_IFSC', 'AGE LESS THAN 80', 'AGE MORE THAN 80']
                bank_matches = sum(1 for keyword in bank_keywords if keyword in row_str)
                
                if bank_matches >= 3:  # If at least 3 bank-related keywords found
                    format_type = "bank_pensioner_data"
                    logger.info(f"Bank format detected at row {i}: {row_str[:200]}...")
                    break
            
            # Check for district/state PSA format if not bank format
            if format_type == "unknown":
                for i in range(min(15, len(df_raw))):
                    row_str = str(df_raw.iloc[i].tolist()).upper()
                    psa_keywords = ['NAME OF DISTRICT', 'NAME OF STATE', 'PSA', 'NO. OF PENSIONERS']
                    psa_matches = sum(1 for keyword in psa_keywords if keyword in row_str)
                    
                    # Also check for PSA category format (State Government, Central Government, etc.)
                    psa_category_keywords = ['STATE GOVERNMENT', 'CENTRAL GOVERNMENT', 'NAME OF PSA']
                    psa_category_matches = sum(1 for keyword in psa_category_keywords if keyword in row_str)
                    
                    if psa_matches >= 2 or psa_category_matches >= 1:  # If PSA-related keywords found
                        format_type = "psa_pensioner_data"
                        logger.info(f"PSA format detected at row {i}: {row_str[:200]}...")
                        break
            
            logger.info(f"Detected format: {format_type}")
            return format_type, sheets
            
        except Exception as e:
            logger.error(f"Error detecting file format: {e}")
            return "unknown", []
    
    def create_bank_pensioner_tables(self):
        """Create tables for bank pensioner data format"""
        try:
            cursor = self.conn.cursor()
            
            # Bank pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS bank_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                bank_state TEXT,
                bank_city TEXT,
                bank_name TEXT,
                bank_ifsc TEXT,
                branch_pin_code TEXT,
                age_less_than_80 INTEGER DEFAULT 0,
                age_more_than_80 INTEGER DEFAULT 0,
                age_not_available INTEGER DEFAULT 0,
                grand_total INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_table_sql)
            
            # Bank summary table
            create_summary_sql = """
            CREATE TABLE IF NOT EXISTS bank_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_type TEXT,
                category TEXT,
                count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_sql)
            
            self.conn.commit()
            logger.info("Bank pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating bank tables: {e}")
            return False
    
    def create_psa_pensioner_tables(self):
        """Create tables for PSA pensioner data format"""
        try:
            cursor = self.conn.cursor()
            
            # PSA pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS psa_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                data_type TEXT,  -- 'district' or 'state'
                s_no INTEGER,
                location_name TEXT,  -- district name or state name
                psa_name TEXT,
                total_pensioners INTEGER DEFAULT 0,
                manual_lc_submitted INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_table_sql)
            
            # PSA summary table
            create_summary_sql = """
            CREATE TABLE IF NOT EXISTS psa_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_type TEXT,
                category TEXT,
                count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_sql)
            
            self.conn.commit()
            logger.info("PSA pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating PSA tables: {e}")
            return False
    
    def find_header_row(self, df_raw, expected_columns):
        """Find the row containing headers"""
        for i in range(min(15, len(df_raw))):
            row_str = str(df_raw.iloc[i].tolist()).upper()
            matches = sum(1 for col in expected_columns if col.upper() in row_str)
            if matches >= len(expected_columns) // 2:  # At least half the columns match
                logger.info(f"Found header row at index {i} with {matches}/{len(expected_columns)} matches")
                return i
        return None
    
    def process_bank_pensioner_sheet(self, excel_path, sheet_name, file_name):
        """Process bank pensioner data sheet"""
        try:
            df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            
            # Expected columns for bank data
            expected_columns = ['BANK_STATE', 'BANK_CITY', 'BANK_NAME', 'BANK_IFSC', 'AGE LESS THAN 80']
            
            # Find header row
            header_row = self.find_header_row(df_raw, expected_columns)
            if header_row is None:
                logger.warning(f"Could not find header row in sheet {sheet_name}")
                return False
            
            # Read with proper header
            df = pd.read_excel(excel_path, sheet_name=sheet_name, header=header_row)
            
            # Clean and standardize column names
            df.columns = df.columns.str.strip()
            
            # Column mapping
            column_mapping = {
                'BANK_STATE': ['BANK_STATE', 'Bank State', 'State'],
                'BANK_CITY': ['BANK_CITY2', 'BANK_CITY', 'Bank City', 'City'],
                'BANK_NAME': ['BANK_NAME', 'Bank Name', 'Bank'],
                'BANK_IFSC': ['BANK_IFSC', 'IFSC', 'IFSC Code'],
                'BRANCH_PIN_CODE': ['Branch PIN Code', 'PIN Code', 'Pincode'],
                'AGE_LESS_THAN_80': ['AGE LESS THAN 80', 'Age Less Than 80', 'Less Than 80'],
                'AGE_MORE_THAN_80': ['AGE MORE THAN 80', 'Age More Than 80', 'More Than 80'],
                'AGE_NOT_AVAILABLE': ['AGE NOT AVAILABLE', 'Age Not Available', 'Not Available'],
                'GRAND_TOTAL': ['Grand Total', 'Total', 'GRAND_TOTAL']
            }
            
            # Standardize column names
            standardized_columns = {}
            for standard_name, variations in column_mapping.items():
                for col in df.columns:
                    if col in variations:
                        standardized_columns[col] = standard_name
                        break
            
            df = df.rename(columns=standardized_columns)
            
            # Insert data
            cursor = self.conn.cursor()
            
            for _, row in df.iterrows():
                if pd.isna(row.get('BANK_NAME', '')) or str(row.get('BANK_NAME', '')).strip() == '':
                    continue
                
                insert_sql = """
                INSERT INTO bank_pensioner_data (
                    file_name, sheet_name, bank_state, bank_city, bank_name, bank_ifsc,
                    branch_pin_code, age_less_than_80, age_more_than_80,
                    age_not_available, grand_total
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                values = (
                    file_name, sheet_name,
                    str(row.get('BANK_STATE', '')).strip(),
                    str(row.get('BANK_CITY', '')).strip(),
                    str(row.get('BANK_NAME', '')).strip(),
                    str(row.get('BANK_IFSC', '')).strip(),
                    str(row.get('BRANCH_PIN_CODE', '')).strip(),
                    int(row.get('AGE_LESS_THAN_80', 0)) if pd.notna(row.get('AGE_LESS_THAN_80')) else 0,
                    int(row.get('AGE_MORE_THAN_80', 0)) if pd.notna(row.get('AGE_MORE_THAN_80')) else 0,
                    int(row.get('AGE_NOT_AVAILABLE', 0)) if pd.notna(row.get('AGE_NOT_AVAILABLE')) else 0,
                    int(row.get('GRAND_TOTAL', 0)) if pd.notna(row.get('GRAND_TOTAL')) else 0
                )
                
                cursor.execute(insert_sql, values)
            
            self.conn.commit()
            logger.info(f"Successfully processed bank sheet: {sheet_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing bank sheet {sheet_name}: {e}")
            return False
    
    def process_psa_pensioner_sheet(self, excel_path, sheet_name, file_name):
        """Process PSA pensioner data sheet"""
        try:
            df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            
            # Expected columns for PSA data
            expected_columns = ['S.NO', 'NAME OF', 'PSA', 'PENSIONERS']
            
            # Find header row
            header_row = self.find_header_row(df_raw, expected_columns)
            if header_row is None:
                logger.warning(f"Could not find header row in sheet {sheet_name}")
                # Try to process as category format (State Government, Central Government, etc.)
                return self.process_psa_category_format(df_raw, sheet_name, file_name)
            
            # Read with proper header
            df = pd.read_excel(excel_path, sheet_name=sheet_name, header=header_row)
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            # Determine data type (district or state)
            data_type = "district" if "district" in sheet_name.lower() else "state"
            
            # Insert data
            cursor = self.conn.cursor()
            
            for _, row in df.iterrows():
                # Skip empty rows
                if pd.isna(row.iloc[1]) or str(row.iloc[1]).strip() == '':
                    continue
                
                insert_sql = """
                INSERT INTO psa_pensioner_data (
                    file_name, sheet_name, data_type, s_no, location_name,
                    psa_name, total_pensioners, manual_lc_submitted
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                values = (
                    file_name, sheet_name, data_type,
                    int(row.iloc[0]) if pd.notna(row.iloc[0]) and str(row.iloc[0]).replace('.', '').isdigit() else None,
                    str(row.iloc[1]).strip(),
                    str(row.iloc[2]).strip() if pd.notna(row.iloc[2]) else '',
                    int(row.iloc[3]) if pd.notna(row.iloc[3]) and str(row.iloc[3]).replace('.', '').isdigit() else 0,
                    int(row.iloc[4]) if len(row) > 4 and pd.notna(row.iloc[4]) and str(row.iloc[4]).replace('.', '').isdigit() else 0
                )
                
                cursor.execute(insert_sql, values)
            
            self.conn.commit()
            logger.info(f"Successfully processed PSA sheet: {sheet_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing PSA sheet {sheet_name}: {e}")
            return False
    
    def process_psa_category_format(self, df_raw, sheet_name, file_name):
        """Process PSA category format (State Government, Central Government, etc.)"""
        try:
            logger.info(f"Processing PSA category format for sheet: {sheet_name}")
            
            cursor = self.conn.cursor()
            
            # Look for PSA category data in the raw dataframe
            for i, row in df_raw.iterrows():
                if pd.isna(row.iloc[1]):
                    continue
                    
                psa_name = str(row.iloc[1]).strip()
                
                # Check if this looks like a PSA category
                if any(keyword in psa_name.upper() for keyword in ['STATE GOVERNMENT', 'CENTRAL GOVERNMENT', 'OTHERS']):
                    total_pensioners = int(row.iloc[2]) if pd.notna(row.iloc[2]) and str(row.iloc[2]).replace('.', '').replace(',', '').isdigit() else 0
                    manual_lc = int(row.iloc[3]) if len(row) > 3 and pd.notna(row.iloc[3]) and str(row.iloc[3]).replace('.', '').replace(',', '').isdigit() else 0
                    
                    if total_pensioners > 0 or manual_lc > 0:  # Only insert if there's actual data
                        insert_sql = """
                        INSERT INTO psa_pensioner_data (
                            file_name, sheet_name, data_type, s_no, location_name,
                            psa_name, total_pensioners, manual_lc_submitted
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """
                        
                        # Clean up PSA name for better categorization
                        clean_psa_name = psa_name.replace('Concerned ', '').strip()
                        
                        values = (
                            file_name, sheet_name, "category",
                            None,  # No S.No for category format
                            clean_psa_name,  # Use cleaned PSA name as location
                            clean_psa_name,  # PSA name
                            total_pensioners,
                            manual_lc
                        )
                        
                        cursor.execute(insert_sql, values)
                        logger.info(f"Inserted PSA category: {psa_name} - {total_pensioners} pensioners, {manual_lc} manual LCs")
            
            self.conn.commit()
            logger.info(f"Successfully processed PSA category sheet: {sheet_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing PSA category sheet {sheet_name}: {e}")
            return False
    
    def generate_psa_summary(self):
        """Generate PSA summary statistics"""
        try:
            cursor = self.conn.cursor()
            
            # Clear existing summary
            cursor.execute("DELETE FROM psa_summary")
            
            # PSA-wise summary
            cursor.execute("""
                INSERT INTO psa_summary (summary_type, category, count)
                SELECT 'psa_wise', psa_name, SUM(total_pensioners)
                FROM psa_pensioner_data
                WHERE psa_name != ''
                GROUP BY psa_name
            """)
            
            # State-wise summary
            cursor.execute("""
                INSERT INTO psa_summary (summary_type, category, count)
                SELECT 'location_wise', location_name, SUM(total_pensioners)
                FROM psa_pensioner_data
                WHERE data_type = 'state' AND location_name != ''
                GROUP BY location_name
            """)
            
            # Total summary
            cursor.execute("""
                INSERT INTO psa_summary (summary_type, category, count)
                SELECT 'total_pensioners', 'All', SUM(total_pensioners)
                FROM psa_pensioner_data
            """)
            
            cursor.execute("""
                INSERT INTO psa_summary (summary_type, category, count)
                SELECT 'manual_lc_submitted', 'All', SUM(manual_lc_submitted)
                FROM psa_pensioner_data
            """)
            
            self.conn.commit()
            logger.info("PSA summary statistics generated")
            return True
            
        except Exception as e:
            logger.error(f"Error generating PSA summary: {e}")
            return False
    
    def process_excel_file(self, excel_path):
        """Main method to process Excel file"""
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return False
        
        if not self.connect_db():
            return False
        
        try:
            file_name = os.path.basename(excel_path)
            
            # Detect file format
            format_type, sheets = self.detect_file_format(excel_path)
            
            if format_type == "bank_pensioner_data":
                if not self.create_bank_pensioner_tables():
                    return False
                
                for sheet_name in sheets:
                    self.process_bank_pensioner_sheet(excel_path, sheet_name, file_name)
            
            elif format_type == "psa_pensioner_data":
                if not self.create_psa_pensioner_tables():
                    return False
                
                for sheet_name in sheets:
                    self.process_psa_pensioner_sheet(excel_path, sheet_name, file_name)
                
                self.generate_psa_summary()
            
            else:
                logger.warning(f"Unknown format type: {format_type}")
                return False
            
            logger.info("Excel file processing completed successfully")
            return True
            
        finally:
            self.close_db()
    
    def display_database_info(self):
        """Display database information"""
        if not self.connect_db():
            return
        
        try:
            cursor = self.conn.cursor()
            
            print("\n" + "="*60)
            print("DATABASE SUMMARY")
            print("="*60)
            
            # Check for PSA data
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='psa_pensioner_data'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM psa_pensioner_data")
                psa_records = cursor.fetchone()[0]
                
                cursor.execute("SELECT SUM(total_pensioners) FROM psa_pensioner_data")
                total_pensioners = cursor.fetchone()[0] or 0
                
                cursor.execute("SELECT SUM(manual_lc_submitted) FROM psa_pensioner_data")
                manual_lc = cursor.fetchone()[0] or 0
                
                print(f"PSA PENSIONER DATA:")
                print(f"  Total Records: {psa_records}")
                print(f"  Total Pensioners: {total_pensioners}")
                print(f"  Manual LC Submitted: {manual_lc}")
                
                # Top locations by pensioner count
                print(f"\nTop 10 Locations by Pensioner Count:")
                cursor.execute("""
                    SELECT location_name, SUM(total_pensioners) as total
                    FROM psa_pensioner_data
                    WHERE location_name != ''
                    GROUP BY location_name
                    ORDER BY total DESC
                    LIMIT 10
                """)
                
                for location, count in cursor.fetchall():
                    print(f"  {location}: {count}")
                
                # PSA-wise summary
                print(f"\nPSA-wise Summary:")
                cursor.execute("""
                    SELECT psa_name, SUM(total_pensioners) as total
                    FROM psa_pensioner_data
                    WHERE psa_name != ''
                    GROUP BY psa_name
                    ORDER BY total DESC
                """)
                
                for psa, count in cursor.fetchall():
                    print(f"  {psa}: {count}")
            
            # Check for Bank data
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='bank_pensioner_data'")
            if cursor.fetchone():
                cursor.execute("SELECT COUNT(*) FROM bank_pensioner_data")
                bank_records = cursor.fetchone()[0]
                
                if bank_records > 0:
                    print(f"\nBANK PENSIONER DATA:")
                    print(f"  Total Records: {bank_records}")
                    
                    cursor.execute("SELECT SUM(grand_total) FROM bank_pensioner_data")
                    total_bank_pensioners = cursor.fetchone()[0] or 0
                    print(f"  Total Pensioners: {total_bank_pensioners}")
            
        except Exception as e:
            logger.error(f"Error displaying database info: {e}")
        finally:
            self.close_db()

def main():
    """Main function"""
    excel_file = "Excel Files/AXIS.xls"
    
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    
    processor = FlexibleExcelProcessor()
    
    print(f"Processing Excel file: {excel_file}")
    
    if processor.process_excel_file(excel_file):
        print("✅ Excel file processed successfully!")
        processor.display_database_info()
    else:
        print("❌ Failed to process Excel file")

if __name__ == "__main__":
    main()
