import os
import pandas as pd
import json
from sqlalchemy import create_engine, text

# PostgreSQL configuration
DB_USER = "food_r5q8_user"
DB_PASSWORD = "ulYWFiHIB0MbPWgXlFKJkHtAGZvX91he"
DB_HOST = "dpg-d095boadbo4c73964li0-a"
DB_PORT = "5432"
DB_NAME = "food_r5q8"

# Paths to CSV files
CSV_FILES = {
    "processed": "processed_data/processed_20250420_0003.csv",
    "yearly": "processed_data/yearly_production.csv",
    "decade": "processed_data/decade_production.csv",
    "stats": "processed_data/food_production_statistics.csv",
}

# Path to JSON file
JSON_FILE = "processed_data/top_producers.json"

# Global database connection string
CONNECTION_STRING = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(CONNECTION_STRING, echo=True)



def create_database():
    # Create the database if it doesn't exist
    with engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))
    print(f"Database {DB_NAME} created (if not exists).")


def load_csv_to_table(table_name, csv_path, if_exists="replace"):

    df = pd.read_csv(csv_path)
    for col in df.select_dtypes(include=['float64']).columns:
        df[col] = df[col].round(0)

    db_engine = create_engine(f"{CONNECTION_STRING}/{DB_NAME}", echo=False)
    df.to_sql(table_name, con=db_engine, if_exists=if_exists, index=False)
    print(f"Loaded {csv_path} into table: {table_name}")


def load_json_to_table(table_name, json_path):
    # Read the JSON file
    with open(json_path, 'r') as f:
        data = json.load(f)

    # Transform the JSON data into a DataFrame
    records = []
    for crop_type, regions in data.items():
        for region, production in regions.items():
            records.append({
                'crop_type': crop_type,
                'region': region,
                'production': production
            })

    df = pd.DataFrame(records)

    db_engine = create_engine(f"{CONNECTION_STRING}/{DB_NAME}", echo=False)
    df.to_sql(table_name, con=db_engine, if_exists='replace', index=False)
    print(f"Loaded {json_path} into table: {table_name}")


if __name__ == "__main__":
    # Create the database first
    create_database()
    # Now, load each CSV into its own table.
    load_csv_to_table("processed_data", CSV_FILES["processed"])
    load_csv_to_table("yearly_production", CSV_FILES["yearly"])
    load_csv_to_table("decade_production", CSV_FILES["decade"])
    load_csv_to_table("food_stats", CSV_FILES["stats"])
    # Load JSON data into MySQL
    load_json_to_table("top_producers", JSON_FILE)

    # Dispose of engine (close all connections)
    engine.dispose()
