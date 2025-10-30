import json
import sqlite3
import pandas as pd
import argparse

def create_table_if_not_exists(conn):
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS pensioners_live_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        PPO TEXT,
        pensioner_type TEXT,
        disbursing_agency TEXT,
        disbursing_authority TEXT,
        pensioner_DLC_type TEXT,
        pensioner_YearOfBirth TEXT,
        pensioner_district TEXT,
        pensioner_pin TEXT,
        pensioner_state TEXT,
        pensioner_subtype TEXT,
        inserted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        fetch_id INTEGER NOT NULL
    );
    """
    # TODO: In real, fetch_id is a mandatory field to identify the data fetch batch, and has a FK relation with api_fetch_status
    try:
        conn.execute(create_table_sql)
        conn.commit()
        print("Ensured table pensioners_live_data exists.")
    except sqlite3.Error as e:
        print(f"Error creating table: {e}")

def read_json_unchunked(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        try:
            json_object = json.load(f)
            json_object = pd.read_json(file_path)
            data = json_object["data"]
            df = pd.DataFrame(data)
            return df
        except Exception as e:
            print(f"Error: {e}")
            return None
        except FileNotFoundError:
            print(f"Error: File not found at {file_path}")
            return None
        except ValueError as e:
            print(f"Error: Failed to parse JSON file. {e}")
            return None
    

def write_dataframe_to_table(conn, table_name, df, column_mapping):
    try:
        # Rename DataFrame columns based on the mapping
        print(df.columns)
        df = df.rename(mapper=column_mapping)
        print(df.columns)

        # Write to the database table
        df.to_sql(table_name, conn, if_exists="append", index=False)
        print(f"Inserted {len(df)} records into {table_name}.")
    except Exception as e:
        print(f"Error: Failed to write DataFrame to the table. {e}")

def create_db_connection(db_path):
    try:
        conn = sqlite3.connect(db_path)
        print("Database connection established.")
        return conn
    except sqlite3.Error as e:
        print(f"Error: Unable to connect to the database. {e}")
        return None

def stream_json_chunks(file_path, chunk_size=1000):
    with open(file_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
        meta = {
        "inserted_at": raw.get("date"),
        "fetch_id": 2,
    }

    data = raw["data"]
    total = len(data)

    for i in range(0, total, chunk_size):
        chunk = data[i:i + chunk_size]
        df = pd.DataFrame(chunk)

        for key, value in meta.items():
            df[key] = value

        yield df

def update_all_pensioners_table_with_LC_date(conn, ppo_list, inserted_at_timestamp):
    print("Updating all_pensioners table with LC_date...")
    BATCH_SIZE = 100
    BATCH_COUNT = 1 #(len(ppo_list) // BATCH_SIZE) + 1
    try:    
        cursor = conn.cursor()
        for i in range(0, BATCH_COUNT):
            chunk = ppo_list[i:i + BATCH_SIZE]
            
            ppos_in_chunk = ",".join(['\''+ppo+'\'' for ppo in chunk])
            sql = f"""
            UPDATE all_pensioners
            SET LC_date = '{inserted_at_timestamp}'
            WHERE PPO IN ({ppos_in_chunk});
            """
            cursor.execute(sql)
    
    except sqlite3.Error as e:
        print(f"Error updating all_pensioners table: {e}")
        raise
    
def write_chunk_to_db(df, conn, table_name, column_mapping):
    try:
        df_old_columns = df.columns.tolist()
        # print(df_old_columns)
        new_columns_to_match_db_table = [column_mapping[col] for col in df_old_columns]
        # print(new_columns_to_match_db_table)
        df.columns = new_columns_to_match_db_table
        
        # Write to the database table
        df.to_sql(table_name, conn, if_exists="append", index=False)
        print(f"Inserted {len(df)} records into {table_name}.")

        ppos = df["PPO"].tolist()
        update_all_pensioners_table_with_LC_date(conn, ppos, column_mapping["inserted_at"])
        conn.commit()
        
    except Exception as e:
        print(f"Error inserting chunk: {e}")
        conn.rollback()
    

def insert_into_live_pensioners_table(conn, json_file_path, column_mapping):
    create_table_if_not_exists(conn)
    try:
        for df_chunk in stream_json_chunks(json_file_path):
            write_chunk_to_db(df_chunk, conn, "pensioners_live_data", column_mapping)
        conn.close()
    except:
        print("Error during insertion or closing the database connection.")
        if conn is not None:
            conn.close()


def parse_args():
    parser = argparse.ArgumentParser(
        description="Insert pensioner data from JSON into SQLite database."
    )
    parser.add_argument(
        "--json",
        required=True,
        help="Path to the input JSON file containing pensioner data."
    )
    parser.add_argument(
        "--db",
        required=True,
        help="Path to the SQLite database file (.db) where data will be inserted."
    )
    return parser.parse_args()

def main():
    args = parse_args()
    json_file_path = args.json
    db_path = args.db

    column_mapping = {
    "PPO": "PPO",
    "type_of_pensioner": "pensioner_type",
    "central_govt_pensioner_type": "pensioner_subtype",
    "disbursing_agency": "disbursing_agency",
    "disbursing_authority": "disbursing_authority",
    "pensioner_DLC_type": "pensioner_DLC_type",
    "pensioner_YearOfBirth": "pensioner_YearOfBirth",
    "pensioner_district": "pensioner_district",
    "pensioner_pin": "pensioner_pin",
    "pensioner_state": "pensioner_state",
    "inserted_at": "inserted_at",
    "fetch_id": "fetch_id" #TODO: Update fetch_id appropriately to satisfy the FK constraint
    }

    conn = create_db_connection(db_path)
    insert_into_live_pensioners_table(conn, json_file_path, column_mapping)
    

if __name__ == "__main__":
    # json_file_path = "sample-data-from-jeevan-praman.json"
    # db_path = "../../updated_db/updated_db.db"
    main()