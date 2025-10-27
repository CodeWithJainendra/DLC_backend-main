#!/usr/bin/env python3
"""
Complete Pensioner Database Analysis
Analyzes all database files and counts total pensioners across all tables
"""

import sqlite3
import os
from datetime import datetime

# Database files to analyze
database_files = [
    '/data1/jainendra/DLC_backend-main/DLC_Database.db',
    '/data1/jainendra/DLC_backend-main/dlc_database.db',
    '/data1/jainendra/DLC_backend-main/DLCServer/database.db',
    '/data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata/dlc_portal_database.db',
    '/data1/jainendra/DLC_backend-main/DLCServer/Insertexceldata/pensioner_dlc_portal.db'
]

def analyze_database(db_path):
    """Analyze a single database file"""
    if not os.path.exists(db_path):
        return None
    
    file_size = os.path.getsize(db_path)
    if file_size == 0:
        return {
            'path': db_path,
            'size_mb': 0,
            'status': 'EMPTY',
            'tables': [],
            'total_records': 0
        }
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get all tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        tables = cursor.fetchall()
        
        table_info = []
        total_records = 0
        
        for (table_name,) in tables:
            try:
                # Get row count
                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cursor.fetchone()[0]
                
                # Get column info
                cursor.execute(f"PRAGMA table_info({table_name})")
                columns = cursor.fetchall()
                column_names = [col[1] for col in columns]
                
                table_info.append({
                    'name': table_name,
                    'records': count,
                    'columns': len(column_names),
                    'column_names': column_names
                })
                
                total_records += count
                
            except Exception as e:
                table_info.append({
                    'name': table_name,
                    'records': 0,
                    'error': str(e)
                })
        
        conn.close()
        
        return {
            'path': db_path,
            'size_mb': round(file_size / (1024 * 1024), 2),
            'status': 'OK',
            'tables': table_info,
            'total_records': total_records
        }
        
    except Exception as e:
        return {
            'path': db_path,
            'size_mb': round(file_size / (1024 * 1024), 2),
            'status': 'ERROR',
            'error': str(e),
            'tables': [],
            'total_records': 0
        }

def main():
    print("=" * 100)
    print("COMPLETE PENSIONER DATABASE ANALYSIS")
    print("=" * 100)
    print(f"Analysis Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 100)
    print()
    
    all_databases = []
    grand_total = 0
    
    for db_path in database_files:
        print(f"\n{'=' * 100}")
        print(f"DATABASE: {os.path.basename(db_path)}")
        print(f"Path: {db_path}")
        print(f"{'=' * 100}")
        
        result = analyze_database(db_path)
        
        if result is None:
            print("❌ FILE NOT FOUND")
            continue
        
        all_databases.append(result)
        
        print(f"Status: {result['status']}")
        print(f"Size: {result['size_mb']} MB")
        
        if result['status'] == 'EMPTY':
            print("⚠️  Database is empty (0 bytes)")
            continue
        
        if result['status'] == 'ERROR':
            print(f"❌ Error: {result.get('error', 'Unknown error')}")
            continue
        
        print(f"\nTotal Tables: {len(result['tables'])}")
        print(f"Total Records: {result['total_records']:,}")
        grand_total += result['total_records']
        
        if result['tables']:
            print(f"\n{'Table Name':<40} {'Records':>15} {'Columns':>10}")
            print("-" * 70)
            
            # Sort tables by record count (descending)
            sorted_tables = sorted(result['tables'], key=lambda x: x.get('records', 0), reverse=True)
            
            for table in sorted_tables:
                records = table.get('records', 0)
                columns = table.get('columns', 0)
                print(f"{table['name']:<40} {records:>15,} {columns:>10}")
                
                # Show column names for pensioner tables
                if records > 0 and 'pensioner' in table['name'].lower():
                    col_names = table.get('column_names', [])
                    if col_names:
                        print(f"  └─ Columns: {', '.join(col_names[:10])}")
                        if len(col_names) > 10:
                            print(f"     ... and {len(col_names) - 10} more columns")
    
    # Summary
    print("\n" + "=" * 100)
    print("FINAL SUMMARY")
    print("=" * 100)
    
    active_dbs = [db for db in all_databases if db['status'] == 'OK' and db['total_records'] > 0]
    
    print(f"\nTotal Databases Analyzed: {len(database_files)}")
    print(f"Active Databases (with data): {len(active_dbs)}")
    print(f"\n🎯 GRAND TOTAL PENSIONER RECORDS: {grand_total:,}")
    
    if active_dbs:
        print("\n" + "-" * 100)
        print("DATABASE BREAKDOWN:")
        print("-" * 100)
        for db in sorted(active_dbs, key=lambda x: x['total_records'], reverse=True):
            percentage = (db['total_records'] / grand_total * 100) if grand_total > 0 else 0
            print(f"{os.path.basename(db['path']):<50} {db['total_records']:>15,} ({percentage:>6.2f}%)")
    
    # Identify pensioner-specific tables across all databases
    print("\n" + "-" * 100)
    print("PENSIONER TABLES SUMMARY:")
    print("-" * 100)
    
    pensioner_tables = []
    for db in all_databases:
        if db['status'] == 'OK':
            for table in db['tables']:
                if table.get('records', 0) > 0:
                    pensioner_tables.append({
                        'database': os.path.basename(db['path']),
                        'table': table['name'],
                        'records': table['records']
                    })
    
    # Sort by record count
    pensioner_tables.sort(key=lambda x: x['records'], reverse=True)
    
    print(f"{'Database':<40} {'Table':<40} {'Records':>15}")
    print("-" * 100)
    for pt in pensioner_tables:
        print(f"{pt['database']:<40} {pt['table']:<40} {pt['records']:>15,}")
    
    print("\n" + "=" * 100)
    print(f"✅ Analysis Complete!")
    print(f"📊 Total Pensioner Records Found: {grand_total:,}")
    print("=" * 100)

if __name__ == "__main__":
    main()
