"""
Initialize the PetPulse MySQL schema using mysql-connector-python.
"""

from textwrap import dedent

import mysql.connector

DB_CONFIG = {
    "host": "192.168.31.11",
    "port": 3306,
    "user": "root",
    "password": "123456",
}

DDL = dedent(
    """
    CREATE DATABASE IF NOT EXISTS petpulse DEFAULT CHARSET utf8mb4;
    USE petpulse;

    CREATE TABLE IF NOT EXISTS pets (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      species ENUM('Dog','Cat','Bird','Other') NOT NULL,
      breed VARCHAR(100),
      age INT NOT NULL,
      age_months INT NOT NULL DEFAULT 0,
      weight DECIMAL(5,2) NOT NULL,
      photo_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pet_logs (
      id INT PRIMARY KEY AUTO_INCREMENT,
      pet_id INT NOT NULL,
      type ENUM('Feeding','Drinking','Activity','Sleep','Bathroom','Medical','Note') NOT NULL,
      value VARCHAR(255),
      notes TEXT,
      occurred_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pet_expenses (
      id INT PRIMARY KEY AUTO_INCREMENT,
      pet_id INT NOT NULL,
      category VARCHAR(100) NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      notes TEXT,
      spent_on DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pet_memos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      pet_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      notes TEXT,
      due_on DATETIME,
      is_done BOOLEAN NOT NULL DEFAULT FALSE,
      source ENUM('manual','ai') NOT NULL DEFAULT 'manual',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS pet_photos (
      id INT PRIMARY KEY AUTO_INCREMENT,
      pet_id INT NOT NULL,
      url LONGTEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
    );
    """
).strip()


def initialize_database() -> None:
    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor()
    try:
        for statement in DDL.split(";"):
            stmt = statement.strip()
            if not stmt:
                continue
            cursor.execute(stmt)
        connection.commit()
        print("PetPulse schema initialized successfully.")
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    initialize_database()
