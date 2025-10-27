import sqlite3

# Sample data for testing
sample_data = [
    {'pincode': '123456', 'district': 'Sample District', 'state': 'Sample State', 'city': 'Sample City'},
    {'pincode': '654321', 'district': 'Another District', 'state': 'Another State', 'city': 'Another City'}
]

class PincodeDataProcessor:
    def __init__(self, db_path):
        self.conn = sqlite3.connect(db_path)

    def insert_pincode_master(self, pincode, district=None, state=None, city=None, source='Test'):
        cursor = self.conn.cursor()
        try:
            cursor.execute('''
                INSERT INTO pincode_master (pincode, district, state, city, data_source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(pincode) DO UPDATE SET
                    district = COALESCE(excluded.district, district),
                    state = COALESCE(excluded.state, state),
                    city = COALESCE(excluded.city, city),
                    updated_at = CURRENT_TIMESTAMP
            ''', (pincode, district, state, city, source))
            self.conn.commit()
            print(f'Successfully inserted/updated pincode: {pincode}')
        except Exception as e:
            print(f'Error inserting pincode {pincode}: {e}')

# Path to the database
db_path = '/path/to/your/database.db'

# Create an instance of the processor
processor = PincodeDataProcessor(db_path)

# Test the insertion with sample data
for data in sample_data:
    processor.insert_pincode_master(**data)