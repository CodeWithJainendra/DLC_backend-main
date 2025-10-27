#!/bin/bash

echo "Initializing DLC Portal Database..."

# Path to the database and SQL file
DB_PATH="database.db"
SQL_FILE="db/init.sql"

# Check if sqlite3 is installed
if ! command -v sqlite3 &> /dev/null; then
    echo "Error: sqlite3 is not installed. Please install it first."
    exit 1
fi

# Initialize the database using the SQL file
sqlite3 "$DB_PATH" < "$SQL_FILE"

# Check if the initialization was successful
if [ $? -eq 0 ]; then
    echo "Database initialization completed successfully!"
    echo "Created tables:"
    sqlite3 "$DB_PATH" ".tables"
    echo -e "\nDatabase schema:"
    sqlite3 "$DB_PATH" ".schema"
else
    echo "Error: Failed to initialize database."
    exit 1
fi