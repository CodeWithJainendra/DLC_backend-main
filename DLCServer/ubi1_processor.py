#!/usr/bin/env python3
"""
UBI 1 Pensioner Data Processor
Specialized processor for UBI 1 Excel files with multi-row headers
"""

import pandas as pd
import sqlite3
import os
import sys
from datetime import datetime
import logging
import re

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class UBI1Processor:
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
    
    def create_ubi1_tables(self):
        """Create tables for UBI 1 pensioner data"""
        try:
            cursor = self.conn.cursor()
            
            # UBI 1 pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS ubi1_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                ppo_number TEXT,
                birth_date DATE,
                psa_name TEXT,
                pda_name TEXT,
                bank_name TEXT,
                branch_name TEXT,
                pensioner_city TEXT,
                pensioner_state TEXT,
                pensioner_pincode TEXT,
                age INTEGER,
                is_valid BOOLEAN,
                validation_notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_table_sql)
            
            self.conn.commit()
            logger.info("UBI 1 pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating UBI 1 tables: {e}")
            return False
    
    def calculate_age(self, birth_date):
        """Calculate age from birth date"""
        try:
            if pd.isna(birth_date):
                return None
            
            # Handle pandas Timestamps
            if isinstance(birth_date, pd.Timestamp):
                birth_dt = birth_date.to_pydatetime()
            # Handle Python datetime objects
            elif isinstance(birth_date, datetime):
                birth_dt = birth_date
            # Handle string representations
            elif isinstance(birth_date, str):
                # Try common date formats
                for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                    try:
                        birth_dt = datetime.strptime(birth_date, fmt)
                        break
                    except ValueError:
                        continue
                else:
                    return None
            else:
                return None
            
            today = datetime.now()
            age = today.year - birth_dt.year
            
            # Adjust if birthday hasn't occurred this year
            if today.month < birth_dt.month or \
               (today.month == birth_dt.month and today.day < birth_dt.day):
                age -= 1
                
            return age
        except Exception as e:
            logger.error(f"Age calculation error: {e}")
            return None
    
    def is_valid_pincode(self, pincode):
        """Validate PIN code format (6 digits or 'NA')"""
        if pd.isna(pincode):
            return False
        pincode_str = str(pincode).strip().upper()
        if pincode_str == 'NA':
            return True
        return bool(re.match(r'^[1-9][0-9]{5}$', pincode_str))
    
    def validate_record(self, record):
        """Validate UBI 1 record"""
        validation_notes = []
        is_valid = True
        
        # Check critical fields
        critical_fields = ['PPO No.', 'PSA', 'Pensioners City', 'State']
        for field in critical_fields:
            value = record.get(field)
            if pd.isna(value) or str(value).strip() in ['', 'null', 'Null']:
                validation_notes.append(f"Missing {field}")
                is_valid = False
        
        # Check birth date
        birth_date = record.get('Date of Birth')
        if pd.isna(birth_date) or str(birth_date).strip().upper() == 'NA':
            validation_notes.append("Missing birth date")
            is_valid = False
        
        # Check PIN code
        pincode = record.get('Pensioner Pincode')
        if not self.is_valid_pincode(pincode):
            validation_notes.append("Invalid PIN code")
            is_valid = False
        
        return is_valid, "; ".join(validation_notes)
    
    def process_ubi1_sheet(self, excel_path, sheet_name, file_name):
        """Process UBI 1 pensioner data sheet with multi-row header"""
        try:
            # Read the raw Excel data without headers
            df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            
            # Extract headers from row 0 and row 1
            headers = []
            # First 7 columns from row 0
            for i in range(7):
                headers.append(str(df_raw.iloc[0, i]) if not pd.isna(df_raw.iloc[0, i]) else f"Column_{i}")
            # Last 3 columns from row 1
            for i in range(7, 10):
                headers.append(str(df_raw.iloc[1, i]) if not pd.isna(df_raw.iloc[1, i]) else f"Column_{i}")
            
            # Create DataFrame from row 2 onwards
            df = df_raw.iloc[2:]
            df.columns = headers
            
            logger.info(f"Processing {sheet_name}: {len(df)} records")
            
            # Insert data
            cursor = self.conn.cursor()
            valid_count = 0
            invalid_count = 0
            
            for _, row in df.iterrows():
                # Skip empty rows
                if pd.isna(row.iloc[0]):
                    continue
                
                # Extract values
                record = {
                    'S. No': row.iloc[0],
                    'PPO No.': row.iloc[1],
                    'Date of Birth': row.iloc[2],
                    'PSA': row.iloc[3],
                    'PDA': row.iloc[4],
                    'Name of Bank disbursing pension': row.iloc[5],
                    'Name of Bank Branch of pensioner': row.iloc[6],
                    'Pensioners City': row.iloc[7],
                    'State': row.iloc[8],
                    'Pensioner Pincode': row.iloc[9]
                }
                
                # Validate record
                is_valid, validation_notes = self.validate_record(record)
                
                # Calculate age
                age = self.calculate_age(record['Date of Birth']) if is_valid else None
                
                # Only insert valid records
                if is_valid:
                    insert_sql = """
                    INSERT INTO ubi1_pensioner_data (
                        file_name, sheet_name, ppo_number, birth_date, psa_name, pda_name,
                        bank_name, branch_name, pensioner_city, pensioner_state,
                        pensioner_pincode, age, is_valid, validation_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    
                    values = (
                        file_name, sheet_name, record['PPO No.'], record['Date of Birth'], 
                        record['PSA'], record['PDA'], record['Name of Bank disbursing pension'],
                        record['Name of Bank Branch of pensioner'], record['Pensioners City'], 
                        record['State'], record['Pensioner Pincode'], age, 1, validation_notes
                    )
                    
                    cursor.execute(insert_sql, values)
                    valid_count += 1
                else:
                    invalid_count += 1
                    logger.warning(f"Invalid record skipped: {validation_notes}")
            
            self.conn.commit()
            logger.info(f"Successfully processed UBI 1 sheet: {sheet_name} - {valid_count} valid, {invalid_count} invalid records")
            return True
            
        except Exception as e:
            logger.error(f"Error processing UBI 1 sheet {sheet_name}: {e}")
            return False
    
    def process_ubi1_file(self, excel_path):
        """Main method to process UBI 1 Excel file"""
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return False
        
        if not self.connect_db():
            return False
        
        try:
            file_name = os.path.basename(excel_path)
            
            # Create tables
            if not self.create_ubi1_tables():
                return False
            
            # Get all sheets
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            
            logger.info(f"Found {len(sheets)} sheets: {sheets}")
            
            # Process each sheet
            for sheet_name in sheets:
                if not self.process_ubi1_sheet(excel_path, sheet_name, file_name):
                    logger.warning(f"Failed to process sheet: {sheet_name}")
            
            logger.info("UBI 1 Excel file processing completed successfully")
            return True
            
        finally:
            self.close_db()

def main():
    """Main function"""
    excel_file = "Excel Files/Data from UBI 1.xlsx"
    
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    
    processor = UBI1Processor()
    
    print(f"Processing UBI 1 Excel file: {excel_file}")
    
    if processor.process_ubi1_file(excel_file):
        print("✅ UBI 1 Excel file processed successfully!")
    else:
        print("❌ Failed to process UBI 1 Excel file")

if __name__ == "__main__":
    main()
