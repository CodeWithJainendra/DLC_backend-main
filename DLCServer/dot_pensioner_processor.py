#!/usr/bin/env python3
"""
DoT Pensioner Data Processor
Processes DoT pensioner Excel files with PPO numbers, birth dates, and PIN codes
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

class DoTPensionerProcessor:
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
    
    def create_dot_pensioner_tables(self):
        """Create tables for DoT pensioner data"""
        try:
            cursor = self.conn.cursor()
            
            # DoT pensioner data table
            create_table_sql = """
            CREATE TABLE IF NOT EXISTS dot_pensioner_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name TEXT,
                sheet_name TEXT,
                lc_category TEXT,
                ppo_number TEXT,
                birth_date DATE,
                birth_year INTEGER,
                age INTEGER,
                pensioner_pincode TEXT,
                pda_pincode TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_table_sql)
            
            # DoT summary table
            create_summary_sql = """
            CREATE TABLE IF NOT EXISTS dot_summary (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                summary_type TEXT,
                category TEXT,
                count INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
            cursor.execute(create_summary_sql)
            
            self.conn.commit()
            logger.info("DoT pensioner tables created successfully")
            return True
            
        except Exception as e:
            logger.error(f"Error creating DoT tables: {e}")
            return False
    
    def calculate_age(self, birth_date):
        """Calculate age from birth date"""
        try:
            if pd.isna(birth_date):
                return None
            
            # Convert to datetime if it's not already
            if isinstance(birth_date, str):
                birth_date = pd.to_datetime(birth_date)
            
            today = datetime.now()
            age = today.year - birth_date.year
            
            # Adjust if birthday hasn't occurred this year
            if today.month < birth_date.month or (today.month == birth_date.month and today.day < birth_date.day):
                age -= 1
                
            return age
        except:
            return None
    
    def process_dot_sheet(self, excel_path, sheet_name, file_name):
        """Process DoT pensioner data sheet"""
        try:
            # Read the sheet with proper header detection
            df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
            
            # Find the header row (contains PPO NUMBER)
            header_row = None
            for i in range(min(5, len(df_raw))):
                if 'PPO NUMBER' in str(df_raw.iloc[i].tolist()):
                    header_row = i
                    break
            
            if header_row is None:
                logger.warning(f"Could not find header row in sheet {sheet_name}")
                return False
            
            # Read with proper header
            df = pd.read_excel(excel_path, sheet_name=sheet_name, header=header_row)
            
            # Clean column names
            df.columns = df.columns.str.strip()
            
            # Determine LC category from sheet name
            if 'Nov-25' in sheet_name and 'except' not in sheet_name:
                lc_category = "LC Expiring Nov-2025"
            elif 'except Nov' in sheet_name:
                lc_category = "LC Expiring Except Nov-2025"
            else:
                lc_category = "Unknown"
            
            logger.info(f"Processing {sheet_name}: {len(df)} records, Category: {lc_category}")
            
            # Insert data
            cursor = self.conn.cursor()
            
            for _, row in df.iterrows():
                # Skip empty rows
                if pd.isna(row.iloc[0]):
                    continue
                
                ppo_number = str(row.iloc[0]).strip()
                birth_date = row.iloc[1] if len(row) > 1 else None
                pensioner_pincode = str(row.iloc[2]).strip() if len(row) > 2 and pd.notna(row.iloc[2]) else None
                pda_pincode = str(row.iloc[3]).strip() if len(row) > 3 and pd.notna(row.iloc[3]) else None
                
                # Extract birth year and calculate age
                birth_year = None
                age = None
                
                if pd.notna(birth_date):
                    try:
                        if isinstance(birth_date, datetime):
                            birth_year = birth_date.year
                            age = self.calculate_age(birth_date)
                        else:
                            birth_date_parsed = pd.to_datetime(birth_date)
                            birth_year = birth_date_parsed.year
                            age = self.calculate_age(birth_date_parsed)
                            birth_date = birth_date_parsed
                    except:
                        birth_date = None
                
                insert_sql = """
                INSERT INTO dot_pensioner_data (
                    file_name, sheet_name, lc_category, ppo_number, birth_date,
                    birth_year, age, pensioner_pincode, pda_pincode
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """
                
                values = (
                    file_name, sheet_name, lc_category, ppo_number, birth_date,
                    birth_year, age, pensioner_pincode, pda_pincode
                )
                
                cursor.execute(insert_sql, values)
            
            self.conn.commit()
            logger.info(f"Successfully processed DoT sheet: {sheet_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error processing DoT sheet {sheet_name}: {e}")
            return False
    
    def generate_dot_summary(self):
        """Generate DoT summary statistics"""
        try:
            cursor = self.conn.cursor()
            
            # Clear existing summary
            cursor.execute("DELETE FROM dot_summary")
            
            # LC category summary
            cursor.execute("""
                INSERT INTO dot_summary (summary_type, category, count)
                SELECT 'lc_category', lc_category, COUNT(*)
                FROM dot_pensioner_data
                GROUP BY lc_category
            """)
            
            # Age group summary
            cursor.execute("""
                INSERT INTO dot_summary (summary_type, category, count)
                SELECT 'age_group', 
                       CASE 
                           WHEN age < 60 THEN 'Under 60'
                           WHEN age BETWEEN 60 AND 70 THEN '60-70'
                           WHEN age BETWEEN 71 AND 80 THEN '71-80'
                           WHEN age > 80 THEN 'Over 80'
                           ELSE 'Unknown Age'
                       END as age_group,
                       COUNT(*)
                FROM dot_pensioner_data
                WHERE age IS NOT NULL
                GROUP BY age_group
            """)
            
            # PIN code analysis - top pensioner locations
            cursor.execute("""
                INSERT INTO dot_summary (summary_type, category, count)
                SELECT 'top_pensioner_locations', pensioner_pincode, COUNT(*)
                FROM dot_pensioner_data
                WHERE pensioner_pincode IS NOT NULL AND pensioner_pincode != 'nan'
                GROUP BY pensioner_pincode
                ORDER BY COUNT(*) DESC
                LIMIT 10
            """)
            
            # PIN code analysis - top PDA locations
            cursor.execute("""
                INSERT INTO dot_summary (summary_type, category, count)
                SELECT 'top_pda_locations', pda_pincode, COUNT(*)
                FROM dot_pensioner_data
                WHERE pda_pincode IS NOT NULL AND pda_pincode != 'nan'
                GROUP BY pda_pincode
                ORDER BY COUNT(*) DESC
                LIMIT 10
            """)
            
            self.conn.commit()
            logger.info("DoT summary statistics generated")
            return True
            
        except Exception as e:
            logger.error(f"Error generating DoT summary: {e}")
            return False
    
    def process_dot_file(self, excel_path):
        """Main method to process DoT Excel file"""
        if not os.path.exists(excel_path):
            logger.error(f"Excel file not found: {excel_path}")
            return False
        
        if not self.connect_db():
            return False
        
        try:
            file_name = os.path.basename(excel_path)
            
            # Create tables
            if not self.create_dot_pensioner_tables():
                return False
            
            # Get all sheets
            excel_file = pd.ExcelFile(excel_path)
            sheets = excel_file.sheet_names
            
            logger.info(f"Found {len(sheets)} sheets: {sheets}")
            
            # Process each sheet
            for sheet_name in sheets:
                if not self.process_dot_sheet(excel_path, sheet_name, file_name):
                    logger.warning(f"Failed to process sheet: {sheet_name}")
            
            # Generate summary statistics
            self.generate_dot_summary()
            
            logger.info("DoT Excel file processing completed successfully")
            return True
            
        finally:
            self.close_db()
    
    def display_dot_info(self):
        """Display DoT database information"""
        if not self.connect_db():
            return
        
        try:
            cursor = self.conn.cursor()
            
            # Total records
            cursor.execute("SELECT COUNT(*) FROM dot_pensioner_data")
            total_records = cursor.fetchone()[0]
            
            print("\n" + "="*60)
            print("DOT PENSIONER DATABASE SUMMARY")
            print("="*60)
            print(f"Total PPO Records: {total_records:,}")
            
            # LC Category breakdown
            print(f"\nLC Category Breakdown:")
            cursor.execute("""
                SELECT lc_category, COUNT(*) as count
                FROM dot_pensioner_data
                GROUP BY lc_category
                ORDER BY count DESC
            """)
            
            for category, count in cursor.fetchall():
                print(f"  {category}: {count:,}")
            
            # Age statistics
            cursor.execute("""
                SELECT MIN(age) as min_age, MAX(age) as max_age, 
                       ROUND(AVG(age), 1) as avg_age
                FROM dot_pensioner_data
                WHERE age IS NOT NULL
            """)
            
            age_stats = cursor.fetchone()
            if age_stats[0]:
                print(f"\nAge Statistics:")
                print(f"  Age Range: {age_stats[0]} - {age_stats[1]} years")
                print(f"  Average Age: {age_stats[2]} years")
            
            # Top pensioner locations
            print(f"\nTop 5 Pensioner Locations (by PIN code):")
            cursor.execute("""
                SELECT pensioner_pincode, COUNT(*) as count
                FROM dot_pensioner_data
                WHERE pensioner_pincode IS NOT NULL AND pensioner_pincode != 'nan'
                GROUP BY pensioner_pincode
                ORDER BY count DESC
                LIMIT 5
            """)
            
            for pincode, count in cursor.fetchall():
                print(f"  {pincode}: {count:,} pensioners")
            
            # Top PDA locations
            print(f"\nTop 5 PDA Locations (by PIN code):")
            cursor.execute("""
                SELECT pda_pincode, COUNT(*) as count
                FROM dot_pensioner_data
                WHERE pda_pincode IS NOT NULL AND pda_pincode != 'nan'
                GROUP BY pda_pincode
                ORDER BY count DESC
                LIMIT 5
            """)
            
            for pincode, count in cursor.fetchall():
                print(f"  {pincode}: {count:,} pensioners")
            
        except Exception as e:
            logger.error(f"Error displaying DoT info: {e}")
        finally:
            self.close_db()

def main():
    """Main function"""
    excel_file = "Excel Files/DoT pensioners details data updated.xlsx"
    
    if len(sys.argv) > 1:
        excel_file = sys.argv[1]
    
    processor = DoTPensionerProcessor()
    
    print(f"Processing DoT Excel file: {excel_file}")
    
    if processor.process_dot_file(excel_file):
        print("✅ DoT Excel file processed successfully!")
        processor.display_dot_info()
    else:
        print("❌ Failed to process DoT Excel file")

if __name__ == "__main__":
    main()
