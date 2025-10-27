#!/usr/bin/env python3
"""
Batch Process All DLC Portal Files
Processes multiple Excel files in DLC Portal format
"""

import os
import sys
from dlc_portal_processor import DLCPortalProcessor

# Define all DLC Portal files to process
DLC_FILES = [
    # State DLC Portal Files
    {'file': '../Excel Files/21Oct/ASSAM DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/BIHAR DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/CHHATTISGARH DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/GUJARAT DLC PORTAL DATA.xlsx', 'sheet': 'HOS'},
    {'file': '../Excel Files/21Oct/JHARKHAND DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/KARNATAKA DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1 (2)'},
    {'file': '../Excel Files/21Oct/PUNJAB DLC PORTAL DATA.xlsx', 'sheet': None},
    {'file': '../Excel Files/21Oct/TELANGANA DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/UP DLC PORTAL DATA.xlsx', 'sheet': 'Sheet1'},
    {'file': '../Excel Files/21Oct/NE DLC PORTAL DATA.xlsx', 'sheet': None},
    
    # Other DLC format files
    {'file': '../Excel Files/21Oct/Bandhan Bank for Information for DLC Dashboard.xlsx', 'sheet': 'Sheet1'},
]

def main():
    """Process all DLC Portal files"""
    print("="*80)
    print("BATCH PROCESSING - DLC PORTAL FILES")
    print("="*80)
    
    # Initialize processor
    processor = DLCPortalProcessor(db_path='dlc_portal_database.db')
    
    if not processor.connect():
        print("✗ Failed to connect to database")
        return
    
    total_inserted = 0
    processed_files = 0
    failed_files = []
    
    try:
        for file_info in DLC_FILES:
            file_path = file_info['file']
            sheet_name = file_info['sheet']
            
            # Check if file exists
            if not os.path.exists(file_path):
                print(f"\n⚠️  File not found: {file_path}")
                failed_files.append(file_path)
                continue
            
            # Process file
            try:
                inserted = processor.process_excel_file(file_path, sheet_name)
                total_inserted += inserted
                processed_files += 1
            except Exception as e:
                print(f"\n✗ Error processing {file_path}: {e}")
                failed_files.append(file_path)
        
        # Final statistics
        print("\n" + "="*80)
        print("BATCH PROCESSING COMPLETE")
        print("="*80)
        print(f"✓ Files Processed: {processed_files}/{len(DLC_FILES)}")
        print(f"✓ Total Records Inserted: {total_inserted:,}")
        
        if failed_files:
            print(f"\n⚠️  Failed Files ({len(failed_files)}):")
            for f in failed_files:
                print(f"  - {f}")
        
        # Show overall statistics
        processor.get_statistics()
        
    finally:
        processor.close()

if __name__ == "__main__":
    main()
