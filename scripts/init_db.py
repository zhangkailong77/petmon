"""
Initialize the PetPulse MySQL schema using mysql-connector-python.
"""

from textwrap import dedent
import mysql.connector
from mysql.connector import errorcode

DB_CONFIG = {
    "host": "192.168.31.11",
    "port": 3306,
    "user": "root",
    "password": "123456",
}

# 1. 移除末尾的 ALTER 语句，只保留建表语句
DDL = dedent(
    """
    CREATE DATABASE IF NOT EXISTS petpulse DEFAULT CHARSET utf8mb4;
    USE petpulse;

    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL UNIQUE,
      hashed_password VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NULL,
      nickname VARCHAR(50) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email (email)
    );

    -- 注意：这里保留 owner_id 是为了新环境安装时直接创建完整表
    CREATE TABLE IF NOT EXISTS pets (
      id INT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(100) NOT NULL,
      species ENUM('Dog','Cat','Bird','Other') NOT NULL,
      breed VARCHAR(100),
      age INT NOT NULL,
      age_months INT NOT NULL DEFAULT 0,
      weight DECIMAL(5,2) NOT NULL,
      photo_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      owner_id INT NULL,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
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

    CREATE TABLE IF NOT EXISTS verification_codes (
      id INT PRIMARY KEY AUTO_INCREMENT,
      email VARCHAR(255) NOT NULL,
      code VARCHAR(6) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NOT NULL,
      is_used BOOLEAN DEFAULT FALSE,
      INDEX idx_email (email)
    );
    """
).strip()


def initialize_database() -> None:
    connection = mysql.connector.connect(**DB_CONFIG)
    cursor = connection.cursor()
    try:
        # 第一步：执行基础建表语句
        # 注意：这里我们通过 split(';') 简单分割，如果 SQL 内部有分号可能会有问题，但在当前 DDL 中是安全的
        for statement in DDL.split(";"):
            stmt = statement.strip()
            if not stmt:
                continue
            try:
                cursor.execute(stmt)
            except mysql.connector.Error as err:
                print(f"Executing statement failed: {err}")
                print(f"Statement: {stmt}")
                raise err
        
        print("Base schema checked/initialized.")

        # 第二步：单独处理迁移逻辑（保留数据，只加列）
        # 即使 pets 表已经存在，我们也尝试添加 owner_id 列
        # 如果列已经存在，MySQL 会报错 1060 (Duplicate column name)，我们捕获并忽略它
        
        print("Checking for schema updates (migrations)...")
        
        # 尝试添加 owner_id 列
        try:
            cursor.execute("ALTER TABLE pets ADD COLUMN owner_id INT NULL")
            print("  - Added 'owner_id' column to 'pets'.")
        except mysql.connector.Error as err:
            if err.errno == errorcode.ER_DUP_FIELDNAME:
                print("  - 'owner_id' column already exists (Skipped).")
            else:
                print(f"  - Error adding column: {err}")

        # 尝试添加外键约束
        # MySQL 添加外键如果重复通常会报错误，或者我们通过判断列是否成功添加来推断
        # 最稳妥的方式是尝试添加，如果报 Constraint 名字重复则忽略
        try:
            cursor.execute("ALTER TABLE pets ADD CONSTRAINT fk_pets_owner_id FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL")
            print("  - Added foreign key constraint 'fk_pets_owner_id'.")
        except mysql.connector.Error as err:
            # 1826: Duplicate foreign key constraint name
            # 1061: Duplicate key name
            if err.errno in (1826, 1061, errorcode.ER_DUP_KEYNAME): 
                print("  - Foreign key constraint already exists (Skipped).")
            else:
                # 注意：如果 constraint 名字不一样但逻辑一样，MySQL 可能会允许添加，导致重复
                # 这里假设你的约束名 fk_pets_owner_id 是固定的
                print(f"  - Note on Constraint: {err}")

        connection.commit()
        print("PetPulse schema initialized successfully.")

    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    initialize_database()