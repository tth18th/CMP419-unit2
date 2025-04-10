import os
import traceback
import pandas as pd
from flask import Flask, jsonify, request
from flask.cli import load_dotenv
from flask_cors import CORS
from sqlalchemy import create_engine, text, inspect

load_dotenv()
app = Flask(__name__)
CORS(app)

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'sql8.freesqldatabase.com'),
    'database': os.getenv('DB_NAME', 'sql8772301'),
    'user': os.getenv('DB_USER', 'sql8772301'),
    'password': os.getenv('DB_PASSWORD', 'x8cHUiD8rm'),
    'port': os.getenv('DB_PORT', '3306')
}

# Create SQLAlchemy engine
DATABASE_URI = f"mysql+pymysql://{DB_CONFIG['user']}:{DB_CONFIG['password']}@{DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}"
engine = create_engine(DATABASE_URI)


@app.route('/', methods=['GET'])
def serve_index():
    # Serve the index.html from the static folder
    return app.send_static_file('index.html')


def safe_query(query, params=None):
    """Execute a safe database query with error handling."""
    try:
        with engine.connect() as conn:
            result = pd.read_sql(text(query), conn, params=params)
        return result
    except Exception as e:
        app.logger.error(f"Database error: {str(e)}")
        return pd.DataFrame()


# ---------------------------
# Fixed Data Endpoints
# ---------------------------
@app.route('/api/data', methods=['GET'])
def get_all_data():
    """Return all data from the processed_data table."""
    try:
        query = text("SELECT * FROM `processed_data`")
        df = pd.read_sql(query, engine)
        app.logger.info("Successfully fetched all data")
        return jsonify(df.to_dict(orient='records')), 200
    except Exception as e:
        app.logger.error(f"Error fetching all data: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/api/data/<country>/<int:year>', methods=['GET'])
def get_country_year_data(country, year):
    """Get production data for specific country and year."""
    try:
        query = text("""
            SELECT * 
            FROM `processed_data` 
            WHERE `Entity` = :country AND `Year` = :year
        """)
        df = pd.read_sql(query, engine, params={'country': country, 'year': year})
        if not df.empty:
            # Convert row to dict. Exclude Entity and Year from numeric production keys.
            data = df.iloc[0].to_dict()
            clean_data = {
                k: float(v) if isinstance(v, (int, float)) else v
                for k, v in data.items() if k not in ['Entity', 'Year']
            }
            app.logger.info(f"Data found for {country} ({year})")
            return jsonify(clean_data), 200
        else:
            app.logger.warning(f"No data found for {country} ({year})")
            return jsonify({"message": "No data found"}), 404
    except Exception as e:
        app.logger.error(f"Error fetching country-year data: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/api/data/yearly', methods=['GET'])
def get_yearly_data():
    try:
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('yearly_production')]
        production_columns = [col for col in columns if col.endswith('_Production')]

        # Create dynamic query parts for all production columns
        sum_parts = [f"SUM(`{col}`) AS `{col.replace('_Production', '')}`" for col in production_columns]

        query_str = f"""
            SELECT `Year`,
                   {', '.join(sum_parts)}
            FROM `yearly_production`
            GROUP BY `Year`
            ORDER BY `Year`
        """
        query = text(query_str)
        df = pd.read_sql(query, engine)

        return jsonify(df.to_dict(orient='records'))

    except Exception as e:
        app.logger.error(f"Yearly data error: {str(e)}")
        traceback.print_exc()  # Print traceback for debugging
        return jsonify({"error": "Failed to fetch yearly data"}), 500


def get_valid_product_columns():
    with engine.connect() as conn:
        df = pd.read_sql_table('processed_data', conn)
    return [col for col in df.columns if col not in ['entity', 'year']]


VALID_PRODUCTS = get_valid_product_columns()


@app.route('/api/scatter/<product1>/<product2>', methods=['GET'])
def get_scatter_data(product1, product2):
    """Get data for scatter plot"""
    try:
        if product1 not in VALID_PRODUCTS or product2 not in VALID_PRODUCTS:
            return jsonify({"error": "Invalid product name(s)"}), 400

        query = text(f"""
            SELECT entity, `{product1}`, `{product2}`
            FROM processed_data
            WHERE year = (SELECT MAX(year) FROM production_data)
        """)
        df = pd.read_sql(query, engine)
        return jsonify(df.to_dict(orient='records')), 200
    except Exception as e:
        app.logger.error(f"Scatter plot error: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@app.route('/api/stats', methods=['GET'])
def get_production_stats():
    """Get statistical summary data"""
    try:
        query = text("SELECT * FROM food_stats")
        df = pd.read_sql(query, engine)
        app.logger.info(f"Stats DataFrame: {df}")
        stat_column = df.columns[0]
        stats_data = {}
        for _, row in df.iterrows():
            stat_name = row[stat_column]  # Get the statistic name from first column
            stats_data[stat_name] = {
                col: float(row[col]) if isinstance(row[col], (int, float)) else row[col]
                for col in df.columns[1:]  # Skip the first column (stat names)
            }

        return jsonify(stats_data)
    except Exception as e:
        app.logger.error(f"Stats data error: {str(e)}")
        return jsonify({"error": "Failed to fetch statistics"}), 500


@app.route('/api/data/decade', methods=['GET'])
def get_decade_data_for_product():
    """Get decade data for a specific product"""
    try:
        product = request.args.get('product')

        if not product:
            return jsonify({"error": "Missing product parameter"}), 400

        # Construct the SQL query dynamically
        query = text(f"""
            SELECT decade, AVG(`{product}`) AS production
            FROM decade_production
            GROUP BY decade
            ORDER BY decade
        """)
        df = pd.read_sql(query, engine)

        if df.empty:
            return jsonify({"message": "No data found for the specified product."}), 404

        return jsonify(df.to_dict(orient='records')), 200
    except Exception as e:
        app.logger.error(f"Decade data error: {str(e)}")
        return jsonify({"error": "Failed to fetch decade data"}), 500


@app.route('/api/data/stats', methods=['GET'])
def get_stats_for_product():
    """Get stats for a specific product"""
    try:
        product = request.args.get('product')

        if not product:
            return jsonify({"error": "Missing product parameter"}), 400

        if not product.endswith('_Production'):
            return jsonify({"error": "Invalid product name format"}), 400
        # Use parameterized query with processed_data table
        query = text(f"""
            SELECT 
                COUNT(`{product}`) AS count,
                MIN(`{product}`) AS min,
                MAX(`{product}`) AS max,
                AVG(`{product}`) AS mean,
                STDDEV(`{product}`) AS std,
                AVG(`{product}`) - STDDEV(`{product}`) AS lower_bound,
                AVG(`{product}`) + STDDEV(`{product}`) AS upper_bound
            FROM food_stats
            WHERE `{product}` IS NOT NULL
        """)

        df = pd.read_sql(query, engine)

        if df.empty or pd.isna(df.iloc[0]['mean']):
            return jsonify({"error": "No data available for this product"}), 404

        result = df.iloc[0].to_dict()
        return jsonify({
            "mean": result['mean'],
            "std": result['std'],
            "min": result['min'],
            "max": result['max'],
            "lower_bound": result['lower_bound'],
            "upper_bound": result['upper_bound']
        }), 200

    except Exception as e:
        app.logger.error(f"Stats error: {str(e)}")
        return jsonify({"error": "Failed to fetch stats"}), 500


@app.route('/api/countries', methods=['GET'])
def get_countries():
    """Get list of all available countries."""
    try:
        query = text("SELECT DISTINCT `Entity` FROM `processed_data` ORDER BY `Entity`")
        df = pd.read_sql(query, engine)
        return jsonify(df['Entity'].tolist())
    except Exception as e:
        app.logger.error(f"Countries error: {str(e)}")
        return jsonify({"error": "Failed to fetch countries"}), 500


@app.route('/api/years', methods=['GET'])
def get_years():
    """Get list of all available years."""
    try:
        query = text("SELECT DISTINCT `Year` FROM `processed_data` ORDER BY `Year` DESC")
        df = pd.read_sql(query, engine)
        return jsonify(df['Year'].astype(int).tolist())
    except Exception as e:
        app.logger.error(f"Years error: {str(e)}")
        return jsonify({"error": "Failed to fetch years"}), 500


@app.route('/api/products', methods=['GET'])
def get_products():
    """Get list of all production metrics (columns) from processed_data."""
    try:
        query = text("SHOW COLUMNS FROM `processed_data`")
        df = pd.read_sql(query, engine)
        products = [col['Field'] for col in df.to_dict('records')
                    if '_Production' in col['Field']]
        return jsonify(products)
    except Exception as e:
        app.logger.error(f"Products error: {str(e)}")
        return jsonify({"error": "Failed to fetch products"}), 500


@app.route('/api/trend/<country>/<product>', methods=['GET'])
def get_production_trend(country, product):
    """Get historical trend for specific country and product."""
    try:
        product_column = f"`{product}`"
        query = text(f"""
            SELECT `Year`, {product_column} AS production
            FROM `processed_data`
            WHERE `Entity` = :country
            ORDER BY `Year`
        """)
        df = pd.read_sql(query, engine, params={'country': country})
        return jsonify(df.to_dict(orient='records'))
    except Exception as e:
        app.logger.error(f"Trend data error: {str(e)}")
        return jsonify({"error": "Failed to fetch trend data"}), 500


@app.route('/api/map/<int:year>/<product>', methods=['GET'])
def get_global_distribution(year, product):
    """Get global production distribution for specific year and product."""
    try:
        product_column = f"`{product}`"
        query = text(f"""
            SELECT `Entity`, {product_column} AS value
            FROM `processed_data`
            WHERE `Year` = :year
        """)
        df = pd.read_sql(query, engine, params={'year': year})
        return jsonify(df.to_dict(orient='records'))
    except Exception as e:
        app.logger.error(f"Map data error: {str(e)}")
        return jsonify({"error": "Failed to fetch map data"}), 500


@app.route('/api/stacked/<int:year>', methods=['GET'])
def get_stacked_data(year):
    """Get production distribution data for a stacked chart for a given year."""
    try:
        query = text("""
            SELECT `Entity`, 
                   `Maize_Production` AS Maize,
                   `Rice_Production` AS Rice,
                   `Wheat_Production` AS Wheat
            FROM `processed_data`
            WHERE `Year` = :year
        """)
        df = pd.read_sql(query, engine, params={'year': year})
        return jsonify(df.to_dict(orient='records'))
    except Exception as e:
        app.logger.error(f"Stacked data error: {str(e)}")
        return jsonify({"error": "Failed to fetch stacked data"}), 500


@app.route('/api/data/bubble', methods=['GET'])
def get_bubble_data():
    try:
        # Use SQLAlchemy to inspect the table and get column names
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('processed_data')
                   if col['name'].endswith('_Production')]
        production_cols = ', '.join([f"SUM(`{col}`) AS `{col}`" for col in columns])
        query = text(f"""
            SELECT `Entity`, {production_cols}
            FROM `processed_data`
            GROUP BY `Entity`
        """)
        df = pd.read_sql(query, engine)
        records = []
        for _, row in df.iterrows():
            country = row['Entity']
            total_production = sum(row[col] for col in columns if pd.notna(row[col]))

            if total_production == 0:
                continue

            crop_data = {col.replace('_Production', ''): float(row[col]) if pd.notna(row[col]) else 0
                         for col in columns}
            sorted_crops = sorted(crop_data.items(), key=lambda x: x[1], reverse=True)[:3]

            records.append({
                "country": country,
                "total_production": float(total_production),
                "top_crops": [{"name": crop, "value": value} for crop, value in sorted_crops if value > 0]
            })

        return jsonify(records)
    except Exception as e:
        app.logger.error(f"Bubble chart error: {str(e)}")
        traceback.print_exc()  # Add detailed error info
        return jsonify({"error": "Failed to fetch bubble data"}), 500


@app.route('/api/top_producers', methods=['GET'])
def get_top_producers():
    try:
        # Get query parameters
        crop_type = request.args.get('crop_type', 'Maize_Production')  # Changed from 'product' to 'crop_type'
        limit = request.args.get('limit', 10, type=int)
        query = text("""
            SELECT region, production AS production_value
            FROM `top_producers`
            WHERE crop_type = :crop_type
            ORDER BY production_value DESC
            LIMIT :limit
        """)
        df = pd.read_sql(query, engine, params={'crop_type': crop_type, 'limit': limit})

        return jsonify(df.to_dict(orient='records')), 200
    except Exception as e:
        app.logger.error(f"Top producers API error: {str(e)}")
        return jsonify({"error": f"Failed to fetch top producers: {str(e)}"}), 500


@app.route('/api/products/list', methods=['GET'])
def get_product_list():
    try:
        # Get unique list of crop types
        query = text("""
            SELECT DISTINCT crop_type
            FROM `top_producers`
            ORDER BY crop_type
        """)
        df = pd.read_sql(query, engine)

        return jsonify(df['crop_type'].tolist()), 200
    except Exception as e:
        app.logger.error(f"Product list API error: {str(e)}")
        return jsonify({"error": f"Failed to fetch product list: {str(e)}"}), 500


@app.route('/api/country-trends/<country>', methods=['GET'])
def get_country_trends(country):
    try:
        query = text("""
            SELECT *
            FROM processed_data
            WHERE Entity = :Entity
            ORDER BY Year ASC
        """)
        with engine.connect() as conn:
            df = pd.read_sql(query, conn, params={"Entity": country})

        if df.empty:
            return jsonify([])
        df = df.drop(columns=['Entity'])
        result = df.to_dict(orient='records')
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
