import os
import pandas as pd
import json
from sqlalchemy import create_engine, text

# PostgreSQL configuration
DB_USER = "food_r5q8_user"
DB_PASSWORD = "ulYWFiHIB0MbPWgXlFKJkHtAGZvX91he"
DB_HOST = "dpg-d095boadbo4c73964li0-a.oregon-postgres.render.com"
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
DEFAULT_CONNECTION_STRING = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/postgres"
DATABASE_EXISTS_CHECK_STRING = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine_default = create_engine(DEFAULT_CONNECTION_STRING, echo=True)
engine_target = create_engine(DATABASE_EXISTS_CHECK_STRING, echo=False)


def database_exists(engine, db_name):
    with engine.connect() as conn:
        result = conn.execute(
            text(f"SELECT 1 FROM pg_database WHERE datname='{db_name}'")
        ).fetchone()
        return bool(result)


def create_database():
    if not database_exists(engine_default, DB_NAME):
        with engine_default.connect() as conn:
            conn.execution_options(isolation_level="AUTOCOMMIT").execute(
                text(f"CREATE DATABASE {DB_NAME}")
            )
        print(f"Database '{DB_NAME}' created.")
    else:
        print(f"Database '{DB_NAME}' already exists.")


def load_csv_to_table(table_name, csv_path, if_exists="replace"):
    df = pd.read_csv(csv_path)

    # Round float columns
    for col in df.select_dtypes(include=['float64']).columns:
        df[col] = df[col].round(0).astype(int)

    df.to_sql(table_name, con=engine_target, if_exists=if_exists, index=False)
    print(f"Loaded {csv_path} into table: {table_name}")


def load_json_to_table(table_name, json_path):
    with open(json_path, 'r') as f:
        data = json.load(f)

    records = []
    for crop_type, regions in data.items():
        for region, production in regions.items():
            records.append({
                'crop_type': crop_type,
                'region': region,
                'production': production
            })

    df = pd.DataFrame(records)
    df.to_sql(table_name, con=engine_target, if_exists='replace', index=False)
    print(f"Loaded {json_path} into table: {table_name}")


if __name__ == "__main__":
    print("Starting database setup...")

    # Step 1: Create the database if not exists
    create_database()

    # Step 2: Load tables
    load_csv_to_table("processed_data", CSV_FILES["processed"])
    load_csv_to_table("yearly_production", CSV_FILES["yearly"])
    load_csv_to_table("decade_production", CSV_FILES["decade"])
    load_csv_to_table("food_stats", CSV_FILES["stats"])
    load_json_to_table("top_producers", JSON_FILE)

    print("Database setup complete!")

    # Close all connections
    engine_target.dispose()
    engine_default.dispose()