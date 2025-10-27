#!/usr/bin/env python3
"""
Query DLC Portal Database
Interactive tool to query and analyze DLC pensioner data
"""

import sqlite3
import sys
from datetime import datetime

class DLCDataQuery:
    def __init__(self, db_path='dlc_portal_database.db'):
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
            print(f"✗ Error connecting: {e}")
            return False
    
    def query_by_pincode(self, pincode):
        """Get all pensioners for a specific pincode"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print(f"PENSIONERS IN PINCODE: {pincode}")
        print(f"{'='*80}\n")
        
        # Get summary
        cursor.execute('''
            SELECT * FROM pincode_summary
            WHERE pincode = ?
        ''', (pincode,))
        
        summary = cursor.fetchone()
        
        if not summary:
            print(f"⚠️  No data found for pincode {pincode}")
            return
        
        print(f"📍 Location: {summary['district']}, {summary['state']}")
        print(f"👥 Total Pensioners: {summary['total_pensioners']:,}")
        print(f"\n📊 Age Category Breakdown:")
        print(f"  Age < 60:  {summary['age_less_than_60']:,}")
        print(f"  Age 60-70: {summary['age_60_to_70']:,}")
        print(f"  Age 70-80: {summary['age_70_to_80']:,}")
        print(f"  Age > 80:  {summary['age_more_than_80']:,}")
        print(f"  Age N/A:   {summary['age_not_available']:,}")
        
        # Get PSA breakdown
        print(f"\n🏛️  PSA Type Breakdown:")
        cursor.execute('''
            SELECT psa_type, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE pensioner_pincode_clean = ?
            GROUP BY psa_type
            ORDER BY count DESC
        ''', (pincode,))
        
        for row in cursor.fetchall():
            if row['psa_type']:
                print(f"  {row['psa_type']}: {row['count']:,}")
    
    def query_by_district(self, district):
        """Get statistics for a district"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print(f"DISTRICT ANALYSIS: {district.upper()}")
        print(f"{'='*80}\n")
        
        # Get total pensioners
        cursor.execute('''
            SELECT COUNT(*) as total
            FROM dlc_pensioner_data
            WHERE pensioner_district LIKE ?
        ''', (f'%{district}%',))
        
        total = cursor.fetchone()['total']
        print(f"👥 Total Pensioners: {total:,}")
        
        # Get pincode breakdown
        print(f"\n📍 Pincode-wise Breakdown:")
        cursor.execute('''
            SELECT pincode, total_pensioners,
                   age_less_than_60, age_60_to_70, age_70_to_80, age_more_than_80
            FROM pincode_summary
            WHERE district LIKE ?
            ORDER BY total_pensioners DESC
        ''', (f'%{district}%',))
        
        print(f"{'Pincode':<10} {'Total':<10} {'<60':<8} {'60-70':<8} {'70-80':<8} {'>80':<8}")
        print("-" * 60)
        
        for row in cursor.fetchall():
            print(f"{row['pincode']:<10} {row['total_pensioners']:<10} "
                  f"{row['age_less_than_60']:<8} {row['age_60_to_70']:<8} "
                  f"{row['age_70_to_80']:<8} {row['age_more_than_80']:<8}")
    
    def query_by_state(self, state):
        """Get statistics for a state"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print(f"STATE ANALYSIS: {state.upper()}")
        print(f"{'='*80}\n")
        
        # Get total pensioners
        cursor.execute('''
            SELECT COUNT(*) as total
            FROM dlc_pensioner_data
            WHERE pensioner_state LIKE ?
        ''', (f'%{state}%',))
        
        total = cursor.fetchone()['total']
        print(f"👥 Total Pensioners: {total:,}")
        
        # Get district breakdown
        print(f"\n🏛️  District-wise Breakdown:")
        cursor.execute('''
            SELECT pensioner_district, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE pensioner_state LIKE ?
            GROUP BY pensioner_district
            ORDER BY count DESC
            LIMIT 20
        ''', (f'%{state}%',))
        
        for idx, row in enumerate(cursor.fetchall(), 1):
            if row['pensioner_district']:
                print(f"  {idx}. {row['pensioner_district']}: {row['count']:,}")
        
        # Age category breakdown
        print(f"\n📊 Age Category Breakdown:")
        cursor.execute('''
            SELECT age_category, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE pensioner_state LIKE ?
            GROUP BY age_category
            ORDER BY count DESC
        ''', (f'%{state}%',))
        
        for row in cursor.fetchall():
            print(f"  {row['age_category']}: {row['count']:,}")
    
    def query_by_psa(self, psa_type):
        """Get statistics for a PSA type"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print(f"PSA ANALYSIS: {psa_type.upper()}")
        print(f"{'='*80}\n")
        
        # Get total pensioners
        cursor.execute('''
            SELECT COUNT(*) as total
            FROM dlc_pensioner_data
            WHERE psa_type LIKE ?
        ''', (f'%{psa_type}%',))
        
        total = cursor.fetchone()['total']
        print(f"👥 Total Pensioners: {total:,}")
        
        # Get state breakdown
        print(f"\n🗺️  State-wise Breakdown:")
        cursor.execute('''
            SELECT pensioner_state, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE psa_type LIKE ?
            GROUP BY pensioner_state
            ORDER BY count DESC
            LIMIT 15
        ''', (f'%{psa_type}%',))
        
        for idx, row in enumerate(cursor.fetchall(), 1):
            if row['pensioner_state']:
                print(f"  {idx}. {row['pensioner_state']}: {row['count']:,}")
    
    def query_age_analysis(self):
        """Get detailed age analysis"""
        cursor = self.conn.cursor()
        
        print(f"\n{'='*80}")
        print(f"AGE ANALYSIS")
        print(f"{'='*80}\n")
        
        # Overall age distribution
        cursor.execute('''
            SELECT age_category, COUNT(*) as count,
                   ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM dlc_pensioner_data), 2) as percentage
            FROM dlc_pensioner_data
            GROUP BY age_category
            ORDER BY count DESC
        ''')
        
        print(f"{'Age Category':<25} {'Count':<15} {'Percentage':<10}")
        print("-" * 50)
        
        for row in cursor.fetchall():
            print(f"{row['age_category']:<25} {row['count']:<15,} {row['percentage']:<10}%")
        
        # Average age by state
        print(f"\n📊 Average Age by State (Top 10):")
        cursor.execute('''
            SELECT pensioner_state, AVG(age) as avg_age, COUNT(*) as count
            FROM dlc_pensioner_data
            WHERE age IS NOT NULL AND pensioner_state IS NOT NULL
            GROUP BY pensioner_state
            ORDER BY count DESC
            LIMIT 10
        ''')
        
        for row in cursor.fetchall():
            print(f"  {row['pensioner_state']}: {row['avg_age']:.1f} years (n={row['count']:,})")
    
    def export_to_csv(self, output_file='dlc_export.csv'):
        """Export data to CSV"""
        cursor = self.conn.cursor()
        
        print(f"\n📤 Exporting data to {output_file}...")
        
        cursor.execute('''
            SELECT 
                ppo_number, birth_year, age, age_category,
                psa_type, psa_division, psa_area,
                pensioner_pincode_clean, pensioner_district, pensioner_state,
                branch_pincode_clean, branch_district, branch_state
            FROM dlc_pensioner_data
            ORDER BY pensioner_state, pensioner_district, pensioner_pincode_clean
        ''')
        
        with open(output_file, 'w') as f:
            # Write header
            f.write("PPO Number,Birth Year,Age,Age Category,PSA Type,PSA Division,PSA Area,")
            f.write("Pensioner Pincode,Pensioner District,Pensioner State,")
            f.write("Branch Pincode,Branch District,Branch State\n")
            
            # Write data
            for row in cursor.fetchall():
                f.write(f"{row['ppo_number']},{row['birth_year']},{row['age']},{row['age_category']},")
                f.write(f"{row['psa_type']},{row['psa_division']},{row['psa_area']},")
                f.write(f"{row['pensioner_pincode_clean']},{row['pensioner_district']},{row['pensioner_state']},")
                f.write(f"{row['branch_pincode_clean']},{row['branch_district']},{row['branch_state']}\n")
        
        print(f"✓ Export complete!")
    
    def close(self):
        """Close connection"""
        if self.conn:
            self.conn.close()

def main():
    """Main interactive function"""
    print("="*80)
    print("DLC PORTAL DATA QUERY TOOL")
    print("="*80)
    
    db_path = sys.argv[1] if len(sys.argv) > 1 else 'dlc_portal_database.db'
    
    query = DLCDataQuery(db_path)
    
    if not query.connect():
        return
    
    try:
        print("\n" + "="*80)
        print("INTERACTIVE QUERY MODE")
        print("="*80)
        print("\nCommands:")
        print("  pincode:XXXXXX    - Query by pincode (e.g., pincode:783301)")
        print("  district:NAME     - Query by district (e.g., district:Dhubri)")
        print("  state:NAME        - Query by state (e.g., state:Assam)")
        print("  psa:TYPE          - Query by PSA type (e.g., psa:SPOs)")
        print("  age               - Show age analysis")
        print("  export            - Export to CSV")
        print("  quit              - Exit")
        
        while True:
            try:
                user_input = input("\n> ").strip()
                
                if user_input.lower() == 'quit':
                    break
                elif user_input.lower() == 'age':
                    query.query_age_analysis()
                elif user_input.lower() == 'export':
                    query.export_to_csv()
                elif user_input.lower().startswith('pincode:'):
                    pincode = user_input.split(':', 1)[1].strip()
                    query.query_by_pincode(pincode)
                elif user_input.lower().startswith('district:'):
                    district = user_input.split(':', 1)[1].strip()
                    query.query_by_district(district)
                elif user_input.lower().startswith('state:'):
                    state = user_input.split(':', 1)[1].strip()
                    query.query_by_state(state)
                elif user_input.lower().startswith('psa:'):
                    psa = user_input.split(':', 1)[1].strip()
                    query.query_by_psa(psa)
                else:
                    print("Invalid command. Type 'quit' to exit.")
            
            except KeyboardInterrupt:
                print("\n\nExiting...")
                break
            except Exception as e:
                print(f"Error: {e}")
    
    finally:
        query.close()

if __name__ == "__main__":
    main()
