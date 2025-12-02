<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PetPulse 全栈指南（中文）

React + Vite 前端配合 FastAPI + MySQL 后端，通过 Gemini 实现健康分析、智能录入与对话功能。所有 AI 请求都走服务端，浏览器不会暴露密钥。

## 环境要求

- Node.js 18+、npm —— 构建/调试前端
- Python 3.11+、pip —— 运行 FastAPI
- 可访问的 MySQL（默认 `192.168.150.27:3308/root/root`，可自行修改）
- Gemini API Key（仅在服务端 `.env` 中使用）

## 数据库初始化

在 MySQL 中执行以下 SQL（可根据需要调整库名/表结构）：

```sql
CREATE DATABASE IF NOT EXISTS petpulse DEFAULT CHARSET utf8mb4;
USE petpulse;

CREATE TABLE IF NOT EXISTS pets (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  species ENUM('Dog','Cat','Bird','Other') NOT NULL,
  breed VARCHAR(100),
  age INT NOT NULL,
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

CREATE TABLE IF NOT EXISTS pet_photos (
  id INT PRIMARY KEY AUTO_INCREMENT,
  pet_id INT NOT NULL,
  url LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE
);
```

（也可直接运行 `scripts/init_db.py`，脚本默认连接上方数据库配置。）

## 后端（`server/`）搭建

1. 进入 `server` 目录并创建虚拟环境：
   ```bash
   cd server
   python -m venv .venv
   .venv\Scripts\activate        # macOS/Linux 使用 `source .venv/bin/activate`
   pip install -r requirements.txt
   cp .env.example .env
   ```
2. 修改 `.env` 中的数据库地址、账号和 `GEMINI_API_KEY`。
3. 启动 FastAPI：
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 4000
   ```
   如果控制台没有报错，说明已连接上 MySQL，并在 `http://localhost:4000/api/*` 暴露 REST 接口与 Gemini 代理路由。

## 前端搭建

1. 在项目根目录安装依赖：
   ```bash
   npm install
   ```
2. `.env.local` 已设置 `VITE_API_BASE_URL=/api`，Vite dev server 会把 `/api` 代理到 `http://localhost:4000`。如需自定义 API 源，可修改该值或 `VITE_API_PROXY`。
3. 启动前端：
   ```bash
   npm run dev
   ```
   打开 http://localhost:3000 ，即可与 FastAPI 后端交互。

## 调试与常见问题

1. 先启动 MySQL，再启动 FastAPI（`uvicorn`），最后运行 Vite。
2. 浏览器如出现 404/500，可查看 `server` 控制台日志；确保 `.env` 中的数据库和 Gemini 配置正确。
3. AI 功能报错通常是 `GEMINI_API_KEY` 缺失、配额不足或机器无法访问外网。
4. 如需跨域访问，将前端地址加入 `server/.env` 的 `CORS_ORIGINS`。

## 部署建议

1. 使用 Docker 或常规 Python 环境部署 `server/`，配置好 `.env` 并确保能访问 MySQL。
2. 前端运行 `npm run build`，把 `dist/` 托管到任意静态平台，并将 `VITE_API_BASE_URL` 改为线上 API 地址。
3. Gemini 密钥只放在后端 `.env`，不要写入前端。

## 目录概览

```
petpulse/
├─ App.tsx               # React 主界面
├─ services/             # 与后端交互的封装
├─ scripts/init_db.py    # Python 初始化数据库脚本
├─ server/
│   ├─ app/              # FastAPI 代码
│   │   ├─ main.py
│   │   ├─ config.py
│   │   ├─ database.py
│   │   ├─ models.py
│   │   ├─ schemas.py
│   │   └─ routers/
│   ├─ requirements.txt
│   └─ .env.example
├─ README.md             # 英文文档
└─ README_zh.md          # 中文文档
```

祝开发顺利！如需扩展（用户体系、权限、更多报表等），可在现有 FastAPI/数据库基础上继续演进。***
