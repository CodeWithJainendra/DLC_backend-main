#!/usr/bin/env python3
"""
Query Pincode Statistics from newdatabase.db
Shows pensioners by pincode, bank, and age category
"""

import sqlite3
import sys
from datetime import datetime

class PincodeStatsQuery:
    def __init__(self, db_path='newdatabase.db'):
        self.db_path = db_path
        self.conn = None
        
    def connect(self):
        """Connect to database"""
        try:
            self.conn = sqlite3.connect(self.db_path)
            self.conn.row_factory = sqlite3.Row
            print(f"✓ Connected to {self.db_path}")
            return True
        except Exception as e:
            print(f"✗ Error connecting to database: {e}")
            return False
    
    def get_table_info(self):
        """Get information about tables in database"""
        cursor = self.conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = cursor.fetchall()
        
        print("\n" + "="*80)
        print("DATABASE STRUCTURE")
        print("="*80)
        
        for table in tables:
            table_name = table['name']
            print(f"\n📋 Table: {table_name}")
            
            # Get column info
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = cursor.fetchall()
            
            print("   Columns:")
            for col in columns:
                print(f"   - {col['name']} ({col['type']})")
            
            # Get row count
            cursor.execute(f"SELECT COUNT(*) as count FROM {table_name}")
            count = cursor.fetchone()['count']
            print(f"   Total Records: {count:,}")
    
    def query_pincode_summary(self):
        """Get summary statistics by pincode"""
        cursor = self.conn.cursor()
        
        print("\n" + "="*80)
        print("PINCODE SUMMARY STATISTICS")
        print("="*80)
        
        query = """
            SELECT 
                pincode,
                COUNT(DISTINCT bank_name) as bank_count,
                SUM(CAST(age_less_than_80 AS INTEGER)) as total_age_less_80,
                SUM(CAST(age_more_than_80 AS INTEGER)) as total_age_more_80,
                SUM(CAST(grand_total AS INTEGER)) as total_pensioners
            FROM pensioner_data
            WHERE pincode IS NOT NULL AND pincode != ''
            GROUP BY pincode
            ORDER BY total_pensioners DESC
            LIMIT 50
        """
        
        try:
            cursor.execute(query)
            results = cursor.fetchall()
            
            print(f"\n🏆 Top 50 Pincodes by Pensioner Count:\n")
            print(f"{'Rank':<6} {'Pincode':<10} {'Banks':<8} {'Age<80':<12} {'Age>80':<12} {'Total':<12}")
            print("-" * 80)
            
            for idx, row in enumerate(results, 1):
                print(f"{idx:<6} {row['pincode']:<10} {row['bank_count']:<8} "
                      f"{row['total_age_less_80']:>11,} {row['total_age_more_80']:>11,} "
                      f"{row['total_pensioners']:>11,}")
            
            # Overall statistics
            cursor.execute("""
                SELECT 
                    COUNT(DISTINCT pincode) as unique_pincodes,
                    COUNT(DISTINCT bank_name) as unique_banks,
                    SUM(CAST(age_less_than_80 AS INTEGER)) as total_age_less_80,
                    SUM(CAST(age_more_than_80 AS INTEGER)) as total_age_more_80,
                    SUM(CAST(grand_total AS INTEGER)) as total_pensioners
                FROM pensioner_data
                WHERE pincode IS NOT NULL
            """)
            
            stats = cursor.fetchone()
            
            print("\n" + "="*80)
            print("OVERALL STATISTICS")
            print("="*80)
            print(f"📍 Unique Pincodes: {stats['unique_pincodes']:,}")
            print(f"🏦 Unique Banks: {stats['unique_banks']:,}")
            print(f"👥 Age < 80: {stats['total_age_less_80']:,}")
            print(f"👴 Age > 80: {stats['total_age_more_80']:,}")
            print(f"📊 Total Pensioners: {stats['total_pensioners']:,}")
            
        except Exception as e:
            print(f"✗ Error querying data: {e}")
    
    def query_by_pincode(self, pincode):
        """Get detailed statistics for a specific pincode"""
        cursor = self.conn.cursor()
        
        print("\n" + "="*80)
        print(f"DETAILED STATISTICS FOR PINCODE: {pincode}")
        print("="*80)
        
        query = """
            SELECT 
                bank_name,
                bank_ifsc,
                state,
                city,
                SUM(CAST(age_less_than_80 AS INTEGER)) as age_less_80,
                SUM(CAST(age_more_than_80 AS INTEGER)) as age_more_80,
                SUM(CAST(grand_total AS INTEGER)) as total
            FROM pensioner_data
            WHERE pincode = ?
            GROUP BY bank_name, bank_ifsc, state, city
            ORDER BY total DESC
        """
        
        try:
            cursor.execute(query, (pincode,))
            results = cursor.fetchall()
            
            if not results:
                print(f"\n⚠️  No data found for pincode {pincode}")
                return
            
            print(f"\n🏦 Banks serving pincode {pincode}:\n")
            
            total_pensioners = 0
            total_less_80 = 0
            total_more_80 = 0
            
            for idx, row in enumerate(results, 1):
                print(f"\n{idx}. {row['bank_name']}")
                print(f"   IFSC: {row['bank_ifsc']}")
                print(f"   Location: {row['city']}, {row['state']}")
                print(f"   Age < 80: {row['age_less_80']:,}")
                print(f"   Age > 80: {row['age_more_80']:,}")
                print(f"   Total: {row['total']:,}")
                
                total_pensioners += row['total']
                total_less_80 += row['age_less_80']
                total_more_80 += row['age_more_80']
            
            print("\n" + "-"*80)
            print(f"Total Pensioners in Pincode {pincode}: {total_pensioners:,}")
            print(f"Age < 80: {total_less_80:,} ({total_less_80*100/total_pensioners:.1f}%)")
            print(f"Age > 80: {total_more_80:,} ({total_more_80*100/total_pensioners:.1f}%)")
            
        except Exception as e:
            print(f"✗ Error querying pincode: {e}")
    
    def query_by_bank(self, bank_name):
        """Get statistics for a specific bank across all pincodes"""
        cursor = self.conn.cursor()
        
        print("\n" + "="*80)
        print(f"STATISTICS FOR BANK: {bank_name}")
        print("="*80)
        
        query = """
            SELECT 
                pincode,
                state,
                city,
                SUM(CAST(age_less_than_80 AS INTEGER)) as age_less_80,
                SUM(CAST(age_more_than_80 AS INTEGER)) as age_more_80,
                SUM(CAST(grand_total AS INTEGER)) as total
            FROM pensioner_data
            WHERE bank_name LIKE ?
            GROUP BY pincode, state, city
            ORDER BY total DESC
            LIMIT 50
        """
        
        try:
            cursor.execute(query, (f'%{bank_name}%',))
            results = cursor.fetchall()
            
            if not results:
                print(f"\n⚠️  No data found for bank '{bank_name}'")
                return
            
            print(f"\n📍 Top 50 Pincodes for {bank_name}:\n")
            print(f"{'Rank':<6} {'Pincode':<10} {'Location':<30} {'Age<80':<12} {'Age>80':<12} {'Total':<12}")
            print("-" * 100)
            
            total_pensioners = 0
            
            for idx, row in enumerate(results, 1):
                location = f"{row['city']}, {row['state']}" if row['city'] and row['state'] else "N/A"
                print(f"{idx:<6} {row['pincode']:<10} {location:<30} "
                      f"{row['age_less_80']:>11,} {row['age_more_80']:>11,} "
                      f"{row['total']:>11,}")
                total_pensioners += row['total']
            
            print("\n" + "-"*100)
            print(f"Total Pensioners for {bank_name}: {total_pensioners:,}")
            
        except Exception as e:
            print(f"✗ Error querying bank: {e}")
    
    def export_to_csv(self, output_file='pincode_stats.csv'):
        """Export pincode statistics to CSV"""
        cursor = self.conn.cursor()
        
        print(f"\n📤 Exporting data to {output_file}...")
        
        query = """
            SELECT 
                pincode,
                bank_name,
                bank_ifsc,
                state,
                city,
                age_less_than_80,
                age_more_than_80,
                grand_total
            FROM pensioner_data
            WHERE pincode IS NOT NULL
            ORDER BY pincode, bank_name
        """
        
        try:
            cursor.execute(query)
            results = cursor.fetchall()
            
            with open(output_file, 'w') as f:
                # Write header
                f.write("Pincode,Bank Name,IFSC,State,City,Age<80,Age>80,Total\n")
                
                # Write data
                for row in results:
                    f.write(f"{row['pincode']},{row['bank_name']},{row['bank_ifsc']},"
                           f"{row['state']},{row['city']},{row['age_less_than_80']},"
                           f"{row['age_more_than_80']},{row['grand_total']}\n")
            
            print(f"✓ Exported {len(results):,} records to {output_file}")
            
        except Exception as e:
            print(f"✗ Error exporting data: {e}")
    
    def close(self):
        """Close database connection"""
        if self.conn:
            self.conn.close()
            print("\n✓ Database connection closed")

def main():
    """Main function"""
    print("="*80)
    print("PINCODE STATISTICS QUERY TOOL")
    print("="*80)
    
    # Check if database file is provided
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'newdatabase.db'
    
    query_tool = PincodeStatsQuery(db_path)
    
    if not query_tool.connect():
        return
    
    try:
        # Show table info
        query_tool.get_table_info()
        
        # Show pincode summary
        query_tool.query_pincode_summary()
        
        # Interactive mode
        print("\n" + "="*80)
        print("INTERACTIVE QUERY MODE")
        print("="*80)
        print("\nCommands:")
        print("  1. Type a pincode (e.g., 110001) to see details")
        print("  2. Type 'bank:' followed by bank name (e.g., bank:SBI)")
        print("  3. Type 'export' to export data to CSV")
        print("  4. Type 'quit' to exit")
        
        while True:
            try:
                user_input = input("\n> ").strip()
                
                if user_input.lower() == 'quit':
                    break
                elif user_input.lower() == 'export':
                    query_tool.export_to_csv()
                elif user_input.lower().startswith('bank:'):
                    bank_name = user_input[5:].strip()
                    query_tool.query_by_bank(bank_name)
                elif user_input.isdigit() and len(user_input) == 6:
                    query_tool.query_by_pincode(user_input)
                else:
                    print("Invalid input. Please enter a 6-digit pincode, 'bank:BankName', 'export', or 'quit'")
                    
            except KeyboardInterrupt:
                print("\n\nExiting...")
                break
            except Exception as e:
                print(f"Error: {e}")
        
    finally:
        query_tool.close()

if __name__ == "__main__":
    main()
