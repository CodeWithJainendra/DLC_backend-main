#!/usr/bin/env python3
"""
DoPPW Pensioner Data Processor
Handles DoPPW Excel files with pension type categorization (Civil, Defence, Railway)
"""

import pandas as pd
import sqlite3
import os
import sys
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class DoPPWProcessor:
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
    
    def create_doppw_tables(self):
        """Create tables for DoPPW pensioner data"""
        try:
            cursor = self.conn.cursor()
            
            # DoPPW pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS doppw_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                gcode TEXT,
                escroll_cat TEXT,
                gid TEXT,
                pension_type TEXT,
                branch_code TEXT,
                branch_name TEXT,
                branch_pincode TEXT,
                branch_state TEXT,
                birth_year INTEGER,
                submitted_status TEXT,
                waiver_upto TEXT,
                submission_mode TEXT,
                verification_type TEXT,
                certificate_submission_date DATE,
                pensioner_pincode TEXT,
                pensioner_district TEXT,
                pensioner_state TEXT,
                age INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_table_sql)
            
            # DoPPW summary table
            create_summary_sql = """
            CREATE TABLE IF NOT EXISTS doppw_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_type TEXT,
                category TEXT,
                count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_sql)
            
            self.conn.commit()
            logger.info("DoPPW pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating DoPPW tables: {e}")
            return False
    
    def calculate_age(self, birth_year):
        """Calculate age from birth year"""
        try:
            if pd.isna(birth_year) or not isinstance(birth_year, int):
                return None
            current_year = datetime.now().year
            return current_year - birth_year
        except:
            return None
    
    def parse_date(self, date_str):
        """Parse date in DD-MM-YYYY format"""
        try:
            return datetime.strptime(date_str, "%d-%m-%Y")
        except:
            return None
    
    def process_doppw_sheet(self, excel_path, sheet_name, file_name):
        """Process DoPPW pensioner data sheet"""
        try:
            # Read the sheet with header
            df = pd.read_excel(excel_path, sheet_name=sheet_name)
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            logger.info(f"Processing {sheet_name}: {len(df)} records")
            
            # Insert data
            cursor = self.conn.cursor()
            
            for _, row in df.iterrows():
                # Skip empty rows
                if pd.isna(row.iloc[0]):
                    continue
                
                # Extract values
                gcode = str(row['GCODE']).strip() if 'GCODE' in row else None
                escroll_cat = str(row['ESCROLL_CAT']).strip() if 'ESCROLL_CAT' in row else None
                gid = str(row['GID']).strip() if 'GID' in row else None
                pension_type = str(row['PENSION_TYPE']).strip() if 'PENSION_TYPE' in row else None
                branch_code = str(row['BRANCH_CODE']).strip() if 'BRANCH_CODE' in row else None
                branch_name = str(row['BRANCH_NAME']).strip() if 'BRANCH_NAME' in row else None
                branch_pincode = str(row['BRANCH_PIN']).strip() if 'BRANCH_PIN' in row else None
                branch_state = str(row['BRANCH_STATE']).strip() if 'BRANCH_STATE' in row else None
                birth_year = int(row['BIRTH_YEAR']) if 'BIRTH_YEAR' in row and not pd.isna(row['BIRTH_YEAR']) else None
                submitted_status = str(row['SUBMITTED_STATUS']).strip() if 'SUBMITTED_STATUS' in row else None
                waiver_upto = str(row['WAIVER_UPTO']).strip() if 'WAIVER_UPTO' in row else None
                submission_mode = str(row['SUBMISSION_MODE']).strip() if 'SUBMISSION_MODE' in row else None
                verification_type = str(row['VERIFICATION_TYPE']).strip() if 'VERIFICATION_TYPE' in row else None
                
                # Parse certificate date
                cert_date = None
                if 'CERTIFICATE_SUBMISSION_DATE' in row and not pd.isna(row['CERTIFICATE_SUBMISSION_DATE']):
                    cert_date = self.parse_date(str(row['CERTIFICATE_SUBMISSION_DATE']))
                
                pensioner_pincode = str(row['PENSIONER_PINCODE']).strip() if 'PENSIONER_PINCODE' in row else None
                pensioner_district = str(row['PENSIONER_DISTNAME']).strip() if 'PENSIONER_DISTNAME' in row else None
                pensioner_state = str(row['PENSIONER_STATENAME']).strip() if 'PENSIONER_STATENAME' in row else None
                
                # Calculate age
                age = self.calculate_age(birth_year) if birth_year else None
                
                insert_sql = """
                INSERT INTO doppw_pensioner_data (
                    file_name, sheet_name, gcode, escroll_cat, gid, pension_type,
                    branch_code, branch_name, branch_pincode, branch_state,
                    birth_year, submitted_status, waiver_upto, submission_mode,
                    verification_type, certificate_submission_date,
                    pensioner_pincode, pensioner_district, pensioner_state, age
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                values = (
                    file_name, sheet_name, gcode, escroll_cat, gid, pension_type,
                    branch_code, branch_name, branch_pincode, branch_state,
                    birth_year, submitted_status, waiver_upto, submission_mode,
                    verification_type, cert_date,
                    pensioner_pincode, pensioner_district, pensioner_state, age
                )
                
                cursor.execute(insert_sql, values)
            
            self.conn.commit()
            logger.info(f"Successfully processed DoPPW sheet: {sheet_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing DoPPW sheet {sheet_name}: {e}")
            return False
    
    def generate_doppw_summary(self):
        """Generate DoPPW summary statistics"""
        try:
            cursor = self.conn.cursor()
            
            # Clear existing summary
            cursor.execute("DELETE FROM doppw_summary")
            
            # Pension type summary
            cursor.execute("""
                INSERT INTO doppw_summary (summary_type, category, count)
                SELECT 'pension_type', pension_type, COUNT(*)
                FROM doppw_pensioner_data
                GROUP BY pension_type
            """)
            
            # ESCROLL category summary
            cursor.execute("""
                INSERT INTO doppw_summary (summary_type, category, count)
                SELECT 'escroll_category', escroll_cat, COUNT(*)
                FROM doppw_pensioner_data
                GROUP BY escroll_cat
            """)
            
            # Submission mode summary
            cursor.execute("""
                INSERT INTO doppw_summary (summary_type, category, count)
                SELECT 'submission_mode', submission_mode, COUNT(*)
                FROM doppw_pensioner_data
                WHERE submission_mode IS NOT NULL
                GROUP BY submission_mode
            """)
            
            # State-wise distribution
            cursor.execute("""
                INSERT INTO doppw_summary (summary_type, category, count)
                SELECT 'pensioner_state', pensioner_state, COUNT(*)
                FROM doppw_pensioner_data
                WHERE pensioner_state IS NOT NULL
                GROUP BY pensioner_state
                ORDER BY COUNT(*) DESC
                LIMIT 10
            """)
            
            # Age group distribution
            cursor.execute("""
                INSERT INTO doppw_summary (summary_type, category, count)
                SELECT 'age_group', 
                       CASE 
                           WHEN age < 60 THEN 'Under 60'
                           WHEN age BETWEEN 60 AND 70 THEN '60-70'
                           WHEN age BETWEEN 71 AND 80 THEN '71-80'
                           WHEN age > 80 THEN 'Over 80'
                           ELSE 'Unknown Age'
                       END as age_group,
                       COUNT(*)
                FROM doppw_pensioner_data
                WHERE age IS NOT NULL
                GROUP BY age_group
            """)
            
            self.conn.commit()
            logger.info("DoPPW summary statistics generated")
            return True
            
        except Exception as e:
            logger.error(f"Error generating DoPPW summary: {e}")
            return False
    
    def process_doppw_file(self, excel_path):
        """Main method to process DoPPW Excel file"""
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return False
        
        if not self.connect_db():
            return False
        
        try:
            file_name = os.path.basename(excel_path)
            
            # Create tables
            if not self.create_doppw_tables():
                return False
            
            # Get all sheets
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            
            logger.info(f"Found {len(sheets)} sheets: {sheets}")
            
            # Process each sheet
            for sheet_name in sheets:
                if not self.process_doppw_sheet(excel_path, sheet_name, file_name):
                    logger.warning(f"Failed to process sheet: {sheet_name}")
            
            # Generate summary statistics
            self.generate_doppw_summary()
            
            logger.info("DoPPW Excel file processing completed successfully")
            return True
            
        finally:
            self.close_db()
    
    def display_doppw_info(self):
        """Display DoPPW database information"""
        if not self.connect_db():
            return
        
        try:
            cursor = self.conn.cursor()
            
            # Total records
            cursor.execute("SELECT COUNT(*) FROM doppw_pensioner_data")
            total_records = cursor.fetchone()[0]
            
            print("\n" + "="*60)
            print("DOPPW PENSIONER DATABASE SUMMARY")
            print("="*60)
            print(f"Total Records: {total_records:,}")
            
            # Pension type breakdown
            print(f"\nPension Type Breakdown:")
            cursor.execute("""
                SELECT pension_type, COUNT(*) as count
                FROM doppw_pensioner_data
                GROUP BY pension_type
                ORDER BY count DESC
            """)
            
            for ptype, count in cursor.fetchall():
                print(f"  {ptype}: {count:,}")
            
            # ESCROLL category breakdown
            print(f"\nESCROLL Category Breakdown:")
            cursor.execute("""
                SELECT escroll_cat, COUNT(*) as count
                FROM doppw_pensioner_data
                GROUP BY escroll_cat
                ORDER BY count DESC
            """)
            
            for category, count in cursor.fetchall():
                print(f"  {category}: {count:,}")
            
            # Submission mode breakdown
            print(f"\nSubmission Mode Breakdown:")
            cursor.execute("""
                SELECT submission_mode, COUNT(*) as count
                FROM doppw_pensioner_data
                WHERE submission_mode IS NOT NULL
                GROUP BY submission_mode
                ORDER BY count DESC
            """)
            
            for mode, count in cursor.fetchall():
                print(f"  {mode}: {count:,}")
            
        except Exception as e:
            logger.error(f"Error displaying DoPPW info: {e}")
        finally:
            self.close_db()

def main():
    """Main function"""
    excel_file = "Excel Files/doppw_data_03102025.xlsx"
    
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    
    processor = DoPPWProcessor()
    
    print(f"Processing DoPPW Excel file: {excel_file}")
    
    if processor.process_doppw_file(excel_file):
        print("✅ DoPPW Excel file processed successfully!")
        processor.display_doppw_info()
    else:
        print("❌ Failed to process DoPPW Excel file")

if __name__ == "__main__":
    main()
