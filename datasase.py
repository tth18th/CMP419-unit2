import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.types import Integer, String, DECIMAL
from sqlalchemy.exc import SQLAlchemyError

# Database configuration
DB_USER = 'root'
DB_PASSWORD = ''
DB_HOST = 'localhost'
DB_NAME = 'food_production'

# Create a database engine
engine = create_engine(f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/')

# Define the data types for the SQL table
dtype = {
    'entity': String(255),
    'year': Integer(),
    'maize_production_tonnes': DECIMAL(15, 2),
    'rice_production_tonnes': DECIMAL(15, 2),
    'yams_production_tonnes': DECIMAL(15, 2),
    'wheat_production_tonnes': DECIMAL(15, 2),
    'tomatoes_production_tonnes': DECIMAL(15, 2),
    'tea_production_tonnes': DECIMAL(15, 2),
    'sweet_potatoes_production_tonnes': DECIMAL(15, 2),
    'sunflower_seed_production_tonnes': DECIMAL(15, 2),
    'sugar_cane_production_tonnes': DECIMAL(15, 2),
    'soybeans_production_tonnes': DECIMAL(15, 2),
    'rye_production_tonnes': DECIMAL(15, 2),
    'potatoes_production_tonnes': DECIMAL(15, 2),
    'oranges_production_tonnes': DECIMAL(15, 2),
    'peas_dry_production_tonnes': DECIMAL(15, 2),
    'palm_oil_production_tonnes': DECIMAL(15, 2),
    'grapes_production_tonnes': DECIMAL(15, 2),
    'coffee_green_production_tonnes': DECIMAL(15, 2),
    'cocoa_beans_production_tonnes': DECIMAL(15, 2),
    'meat_chicken_production_tonnes': DECIMAL(15, 2),
    'bananas_production_tonnes': DECIMAL(15, 2),
    'avocados_production_tonnes': DECIMAL(15, 2),
    'apples_production_tonnes': DECIMAL(15, 2),
}

# Function to save cleaned data to MySQL
def save_data_to_mysql(df):
    try:
        # Create the database if it does not exist
        with engine.connect() as connection:
            connection.execute(text(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}"))
            connection.execute(text(f"USE {DB_NAME}"))  # Use the created database

        # Create a new engine with the database included
        engine_with_db = create_engine(f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')

        # Save the DataFrame to the MySQL database
        df.to_sql('production_data', engine_with_db, if_exists='replace', index=False, dtype=dtype)
        print("Data added to the database successfully!")
    except SQLAlchemyError as e:
        print(f"Error occurred: {e}")

def main():
    # Load your cleaned data into a DataFrame
    df = pd.read_csv("food_data.csv")
    save_data_to_mysql(df)

if __name__ == "__main__":
    main()