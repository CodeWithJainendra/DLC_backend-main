#!/usr/bin/env python3
"""
UBI 3 Pensioner Data Processor
Handles UBI 3 Excel files with pensioner details including PIN code validation
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

class UBI3Processor:
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
    
    def create_ubi3_tables(self):
        """Create tables for UBI 3 pensioner data"""
        try:
            cursor = self.conn.cursor()
            
            # UBI 3 pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS ubi3_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                ppo_number TEXT,
                birth_date DATE,
                psa_name TEXT,
                pda_name TEXT,
                bank_name TEXT,
                branch_name TEXT,
                branch_pincode TEXT,
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
            
            # UBI 3 summary table
            create_summary_sql = """
            CREATE TABLE IF NOT EXISTS ubi3_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_type TEXT,
                category TEXT,
                count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_sql)
            
            self.conn.commit()
            logger.info("UBI 3 pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating UBI 3 tables: {e}")
            return False
    
    def is_valid_pincode(self, pincode):
        """Validate PIN code format (6 digits)"""
        if pd.isna(pincode):
            return False
        pincode_str = str(pincode).strip()
        return bool(re.match(r'^[1-9][0-9]{5}$', pincode_str))
    
    def is_valid_date(self, date_str):
        """Validate date format including DD-MM-YYYY"""
        try:
            # Try common date formats
            for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"):
                try:
                    datetime.strptime(date_str, fmt)
                    return True
                except ValueError:
                    continue
            return False
        except Exception:
            return False
    
    def calculate_age(self, birth_date):
        """Robust age calculation from various date formats"""
        try:
            if pd.isna(birth_date):
                return None
            
            # Handle pandas Timestamps
            if isinstance(birth_date, pd.Timestamp):
                birth_dt = birth_date.to_pydatetime()
            # Handle Python datetime objects
            elif isinstance(birth_date, datetime):
                birth_dt = birth_date
            # Handle Excel date numbers
            elif isinstance(birth_date, (int, float)):
                birth_dt = datetime.fromordinal(datetime(1900, 1, 1).toordinal() + int(birth_date) - 2)
            # Handle string representations
            elif isinstance(birth_date, str):
                try:
                    # Try common date formats
                    for fmt in ("%m/%d/%Y", "%m/%d/%y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
                        try:
                            birth_dt = datetime.strptime(birth_date, fmt)
                            break
                        except ValueError:
                            continue
                    else:
                        return None
                except:
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
    
    def validate_record(self, record, strict_pincode=True):
        """Validate record with state as optional"""
        validation_notes = []
        is_valid = True
        
        # Check critical fields
        critical_fields = ['PPO No.', 'PSA']
        for field in critical_fields:
            value = record.get(field)
            if pd.isna(value) or str(value).strip() in ['', 'null', 'Null']:
                validation_notes.append(f"Missing {field}")
                is_valid = False
        
        # Check birth date
        birth_date = record.get('Date of Birth')
        if pd.isna(birth_date) or str(birth_date).strip().upper() in ['NA', 'N/A']:
            validation_notes.append("Missing birth date")
            is_valid = False
        elif not isinstance(birth_date, (datetime, pd.Timestamp)) and not self.is_valid_date(str(birth_date)):
            validation_notes.append("Invalid birth date format")
            is_valid = False
        
        # Only validate PIN codes if in strict mode (UBI 3)
        if strict_pincode:
            branch_pincode = record.get('Branch Pincode')
            pensioner_pincode = record.get('Pensioner Pincode')
            
            if pd.isna(branch_pincode) or str(branch_pincode).strip().upper() in ['NA', 'N/A']:
                validation_notes.append("Missing branch PIN code")
                is_valid = False
            elif not self.is_valid_pincode(branch_pincode):
                validation_notes.append("Invalid branch PIN code")
                
            if pd.isna(pensioner_pincode) or str(pensioner_pincode).strip().upper() in ['NA', 'N/A']:
                validation_notes.append("Missing pensioner PIN code")
                is_valid = False
            elif not self.is_valid_pincode(pensioner_pincode):
                validation_notes.append("Invalid pensioner PIN code")
        
        return is_valid, "; ".join(validation_notes)
    
    def process_ubi3_sheet(self, excel_path, sheet_name, file_name):
        """Process UBI pensioner data sheet with Bank of Baroda support"""
        try:
            # Read the sheet with header
            df = pd.read_excel(excel_path, sheet_name=sheet_name)
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            # Comprehensive column mapping including Bank of Baroda
            col_mapping = {
                # Standard UBI mappings
                'PPO No.': 'PPO No.',
                'Date of Birth': 'Date of Birth',
                'PSA': 'PSA',
                'PDA': 'PDA',
                'Name of Bank disbursing pension': 'Name of Bank disbursing pension',
                'Name of Bank Branch of pensioner': 'Name of Bank Branch of pensioner',
                'Branch Pincode': 'Branch Pincode',
                'Pensioners City': 'Pensioners City',
                'State': 'State',
                'Pensioner Pincode': 'Pensioner Pincode',
                
                # Bank of Baroda specific mappings
                'PPO NUMBER': 'PPO No.',
                'DOB REGULAR': 'Date of Birth',
                'PDA and  name of disbursing bank': 'Name of Bank disbursing pension',
                'BRANCH_NAME': 'Name of Bank Branch of pensioner',
                'Branch POST_CODE': 'Branch Pincode',
                'Pensioner CITY': 'Pensioners City',
                'Pensioner POST_CODE': 'Pensioner Pincode'
            }
            
            # Apply mapping to standardize column names
            df.rename(columns={k: v for k, v in col_mapping.items() if k in df.columns}, inplace=True)
            
            # Add missing columns with None
            required_columns = ['PPO No.', 'Date of Birth', 'PSA', 'PDA', 
                               'Name of Bank disbursing pension', 'Name of Bank Branch of pensioner',
                               'Branch Pincode', 'Pensioners City', 'State', 'Pensioner Pincode']
            for col in required_columns:
                if col not in df.columns:
                    df[col] = None
            
            logger.info(f"Processing {sheet_name}: {len(df)} records")
            logger.info(f"Columns after standardization: {list(df.columns)}")
            
            # Insert data
            cursor = self.conn.cursor()
            valid_count = 0
            invalid_count = 0
            
            for _, row in df.iterrows():
                # Skip empty rows
                if pd.isna(row.iloc[0]):
                    continue
                
                # Extract values with fallbacks
                ppo_number = str(row['PPO No.']).strip() if 'PPO No.' in row and not pd.isna(row['PPO No.']) else None
                birth_date = row['Date of Birth'] if 'Date of Birth' in row and not pd.isna(row['Date of Birth']) else None
                psa_name = str(row['PSA']).strip() if 'PSA' in row and not pd.isna(row['PSA']) else None
                pda_name = str(row['PDA']).strip() if 'PDA' in row and not pd.isna(row['PDA']) else None
                bank_name = str(row['Name of Bank disbursing pension']).strip() \
                    if 'Name of Bank disbursing pension' in row and not pd.isna(row['Name of Bank disbursing pension']) else None
                branch_name = str(row['Name of Bank Branch of pensioner']).strip() \
                    if 'Name of Bank Branch of pensioner' in row and not pd.isna(row['Name of Bank Branch of pensioner']) else None
                branch_pincode = row['Branch Pincode'] if 'Branch Pincode' in row and not pd.isna(row['Branch Pincode']) else None
                pensioner_city = str(row['Pensioners City']).strip() \
                    if 'Pensioners City' in row and not pd.isna(row['Pensioners City']) else None
                pensioner_state = str(row['State']).strip() if 'State' in row and not pd.isna(row['State']) else None
                pensioner_pincode = row['Pensioner Pincode'] \
                    if 'Pensioner Pincode' in row and not pd.isna(row['Pensioner Pincode']) else None
                
                # Validate record - relaxed PIN code rules for BOB
                is_valid, validation_notes = self.validate_record({
                    'PPO No.': ppo_number,
                    'Date of Birth': birth_date,
                    'PSA': psa_name,
                    'Pensioners City': pensioner_city,
                    'State': pensioner_state,
                    'Branch Pincode': branch_pincode,
                    'Pensioner Pincode': pensioner_pincode
                }, strict_pincode=False)
                
                # Calculate age
                age = self.calculate_age(birth_date) if is_valid else None
                
                # Only insert valid records
                if is_valid:
                    insert_sql = """
                    INSERT INTO ubi3_pensioner_data (
                        file_name, sheet_name, ppo_number, birth_date, psa_name, pda_name,
                        bank_name, branch_name, branch_pincode, pensioner_city,
                        pensioner_state, pensioner_pincode, age, is_valid, validation_notes
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """
                    
                    values = (
                        file_name, sheet_name, ppo_number, birth_date, psa_name, pda_name,
                        bank_name, branch_name, branch_pincode, pensioner_city,
                        pensioner_state, pensioner_pincode, age, 1, validation_notes
                    )
                    
                    cursor.execute(insert_sql, values)
                    valid_count += 1
                else:
                    invalid_count += 1
                    logger.warning(f"Invalid record skipped: {validation_notes}")
            
            self.conn.commit()
            logger.info(f"Successfully processed sheet: {sheet_name} - {valid_count} valid, {invalid_count} invalid records")
            return True
            
        except Exception as e:
            logger.error(f"Error processing sheet {sheet_name}: {e}")
            return False
    
    def generate_ubi3_summary(self):
        """Generate UBI 3 summary statistics"""
        try:
            cursor = self.conn.cursor()
            
            # Clear existing summary
            cursor.execute("DELETE FROM ubi3_summary")
            
            # State-wise distribution
            cursor.execute("""
                INSERT INTO ubi3_summary (summary_type, category, count)
                SELECT 'state_distribution', pensioner_state, COUNT(*)
                FROM ubi3_pensioner_data
                GROUP BY pensioner_state
            """)
            
            # PSA category summary
            cursor.execute("""
                INSERT INTO ubi3_summary (summary_type, category, count)
                SELECT 'psa_category', psa_name, COUNT(*)
                FROM ubi3_pensioner_data
                GROUP BY psa_name
            """)
            
            # Age group distribution
            cursor.execute("""
                INSERT INTO ubi3_summary (summary_type, category, count)
                SELECT 'age_group', 
                       CASE 
                           WHEN age < 60 THEN 'Under 60'
                           WHEN age BETWEEN 60 AND 70 THEN '60-70'
                           WHEN age BETWEEN 71 AND 80 THEN '71-80'
                           WHEN age > 80 THEN 'Over 80'
                           ELSE 'Unknown Age'
                       END as age_group,
                       COUNT(*)
                FROM ubi3_pensioner_data
                WHERE age IS NOT NULL
                GROUP BY age_group
            """)
            
            # PIN code validity
            cursor.execute("""
                INSERT INTO ubi3_summary (summary_type, category, count)
                SELECT 'pincode_validity', 
                       CASE 
                           WHEN is_valid = 1 THEN 'Valid Records'
                           ELSE 'Invalid Records'
                       END,
                       COUNT(*)
                FROM ubi3_pensioner_data
                GROUP BY is_valid
            """)
            
            self.conn.commit()
            logger.info("UBI 3 summary statistics generated")
            return True
            
        except Exception as e:
            logger.error(f"Error generating UBI 3 summary: {e}")
            return False
    
    def process_ubi3_file(self, excel_path):
        """Main method to process UBI 3 Excel file"""
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return False
        
        if not self.connect_db():
            return False
        
        try:
            file_name = os.path.basename(excel_path)
            
            # Create tables
            if not self.create_ubi3_tables():
                return False
            
            # Get all sheets
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            
            logger.info(f"Found {len(sheets)} sheets: {sheets}")
            
            # Process each sheet
            for sheet_name in sheets:
                if not self.process_ubi3_sheet(excel_path, sheet_name, file_name):
                    logger.warning(f"Failed to process sheet: {sheet_name}")
            
            # Generate summary statistics
            self.generate_ubi3_summary()
            
            logger.info("UBI 3 Excel file processing completed successfully")
            return True
            
        finally:
            self.close_db()
    
    def display_ubi3_info(self):
        """Display UBI 3 database information"""
        if not self.connect_db():
            return
        
        try:
            cursor = self.conn.cursor()
            
            # Total records
            cursor.execute("SELECT COUNT(*) FROM ubi3_pensioner_data")
            total_records = cursor.fetchone()[0]
            
            cursor.execute("SELECT COUNT(*) FROM ubi3_pensioner_data WHERE is_valid = 1")
            valid_records = cursor.fetchone()[0]
            
            print("\n" + "="*60)
            print("UBI 3 PENSIONER DATABASE SUMMARY")
            print("="*60)
            print(f"Total Records Processed: {total_records:,}")
            print(f"Valid Records: {valid_records:,} ({valid_records/total_records*100:.1f}%)")
            print(f"Invalid Records: {total_records - valid_records:,} ({(total_records - valid_records)/total_records*100:.1f}%)")
            
            # State distribution
            print(f"\nState Distribution:")
            cursor.execute("""
                SELECT pensioner_state, COUNT(*) as count
                FROM ubi3_pensioner_data
                WHERE is_valid = 1
                GROUP BY pensioner_state
                ORDER BY count DESC
                LIMIT 5
            """)
            
            for state, count in cursor.fetchall():
                print(f"  {state}: {count:,}")
            
            # PSA category
            print(f"\nPSA Category Distribution:")
            cursor.execute("""
                SELECT psa_name, COUNT(*) as count
                FROM ubi3_pensioner_data
                WHERE is_valid = 1
                GROUP BY psa_name
                ORDER BY count DESC
                LIMIT 5
            """)
            
            for psa, count in cursor.fetchall():
                print(f"  {psa}: {count:,}")
            
            # Age distribution
            print(f"\nAge Group Distribution:")
            cursor.execute("""
                SELECT 
                    CASE 
                        WHEN age < 60 THEN 'Under 60'
                        WHEN age BETWEEN 60 AND 70 THEN '60-70'
                        WHEN age BETWEEN 71 AND 80 THEN '71-80'
                        WHEN age > 80 THEN 'Over 80'
                        ELSE 'Unknown Age'
                    END as age_group,
                    COUNT(*) as count
                FROM ubi3_pensioner_data
                WHERE is_valid = 1
                GROUP BY age_group
                ORDER BY 
                    CASE age_group
                        WHEN 'Under 60' THEN 1
                        WHEN '60-70' THEN 2
                        WHEN '71-80' THEN 3
                        WHEN 'Over 80' THEN 4
                        ELSE 5
                    END
            """)
            
            for age_group, count in cursor.fetchall():
                print(f"  {age_group}: {count:,}")
            
        except Exception as e:
            logger.error(f"Error displaying UBI 3 info: {e}")
        finally:
            self.close_db()

def main():
    """Main function"""
    excel_file = "Excel Files/Data from UBI 3.xlsx"
    
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    
    processor = UBI3Processor()
    
    print(f"Processing UBI 3 Excel file: {excel_file}")
    
    if processor.process_ubi3_file(excel_file):
        print(" UBI 3 Excel file processed successfully!")
        processor.display_ubi3_info()
    else:
        print(" Failed to process UBI 3 Excel file")

if __name__ == "__main__":
    main()
