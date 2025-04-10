import pandas as pd
import numpy as np
import os
import logging
from datetime import datetime
import json
import re

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("data_processing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


def clean_and_process_data(input_file="world food production.csv", output_dir="processed_data"):
    try:
        os.makedirs(output_dir, exist_ok=True)
        logger.info(f"Output directory: {output_dir}")

        logger.info(f"Loading data from {input_file}")
        try:
            df = pd.read_csv(input_file)
            logger.info(f"Successfully loaded data with shape: {df.shape}")
        except Exception as e:
            logger.error(f"Error loading data: {e}")
            return None

        # Clean column names
        original_columns = df.columns.tolist()
        df.columns = [re.sub(r'\s+', '_', col.strip()) for col in df.columns]  # Replace spaces with underscores
        df.columns = [re.sub(r'\(.*?\)', '', col) for col in df.columns]  # Remove parentheses and their contents
        df.columns = [col.strip('_') for col in df.columns]  # Strip leading/trailing underscores
        df.columns = [col.replace('__', '_') for col in df.columns]  # Replace double underscores with single
        logger.info(f"Modified columns: {df.columns.tolist()}")
        logger.info(f"Original columns were: {original_columns}")

        # Identify columns
        entity_col = next((col for col in df.columns if 'entity' in col.lower()), 'Entity')
        year_col = next((col for col in df.columns if 'year' in col.lower()), 'Year')

        # Convert year to numeric and drop invalid
        df[year_col] = pd.to_numeric(df[year_col], errors='coerce')
        df = df[df[year_col].between(1900, datetime.now().year)]
        df[year_col] = df[year_col].astype('int')

        # Identify numeric production columns
        numeric_cols = [col for col in df.columns if 'production' in col.lower()]
        for col in numeric_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce')

        # Remove exact duplicates
        initial_count = len(df)
        df = df.drop_duplicates()
        logger.info(f"Removed {initial_count - len(df)} exact duplicates")

        # Cap outliers
        for col in numeric_cols:
            if df[col].dtype in [np.float64, np.int64]:
                floor = df[col].quantile(0.01)
                ceiling = df[col].quantile(0.99)
                df[col] = np.where(df[col] < floor, floor, df[col])
                df[col] = np.where(df[col] > ceiling, ceiling, df[col])
                logger.info(f"Capped outliers in {col}")

        # Round all production-related float columns to 2 decimal places
        df = df.round({col: 0 for col in numeric_cols})
        logger.info("Rounded all production values to 2 decimal places")

        # Save cleaned data
        timestamp = datetime.now().strftime("%Y%m%d_%H%M")
        output_path = os.path.join(output_dir, f"processed_{timestamp}.csv")
        df.to_csv(output_path, index=False)
        logger.info(f"Saved processed data to {output_path}")

        # === Additional Statistics and Outputs ===

        # 1. Basic statistics
        stats_df = df[numeric_cols].describe().round(0)
        stats_file = os.path.join(output_dir, "food_production_statistics.csv")
        stats_df.to_csv(stats_file)
        logger.info(f"Saved basic statistics to {stats_file}")

        # 2. Time series aggregation
        if year_col in df.columns and entity_col in df.columns:
            yearly_prod = df.groupby(year_col)[numeric_cols].mean().reset_index()
            yearly_prod[numeric_cols] = yearly_prod[numeric_cols].round(0)
            yearly_file = os.path.join(output_dir, "yearly_production.csv")
            yearly_prod.to_csv(yearly_file, index=False)
            logger.info(f"Saved yearly aggregation to {yearly_file}")

            # Create a decade column for aggregation only
            df['decade'] = (df[year_col] // 10 * 10).astype('Int64')
            decade_prod = df.groupby('decade')[numeric_cols].mean().reset_index()
            decade_prod[numeric_cols] = decade_prod[numeric_cols].round(0)
            decade_file = os.path.join(output_dir, "decade_production.csv")
            decade_prod.to_csv(decade_file, index=False)
            logger.info(f"Saved decade aggregation to {decade_file}")

        # 3. Top producers by food type
        if entity_col in df.columns:
            latest_year = df[year_col].max()
            latest_data = df[df[year_col] == latest_year]
            top_producers = {}

            for food in numeric_cols:
                top = latest_data.sort_values(by=food, ascending=False)[[entity_col, food]].head(10)
                top[food] = top[food].round(0)
                top_producers[food] = top.set_index(entity_col)[food].to_dict()

            top_file = os.path.join(output_dir, "top_producers.json")
            with open(top_file, 'w') as f:
                json.dump(top_producers, f, indent=4)
            logger.info(f"Saved top producers to {top_file}")

        # Preservation stats
        preservation_stats = {
            'original_rows': initial_count,
            'final_rows': len(df),
            'duplicates_removed': initial_count - len(df),
            'columns_preserved': list(df.columns)
        }
        report_path = os.path.join(output_dir, f"preservation_report_{timestamp}.json")
        with open(report_path, 'w') as f:
            json.dump(preservation_stats, f, indent=4)
        logger.info(f"Saved preservation report to {report_path}")

        return df

    except Exception as e:
        logger.error(f"Processing failed: {str(e)}", exc_info=True)
        return None


if __name__ == "__main__":
    processed_data = clean_and_process_data()
    logger.info("Processing completed" if processed_data is not None else "Processing failed")
