<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PetPulse

Full-stack pet wellness dashboard with a FastAPI + MySQL backend and Gemini-powered insights.

## Prerequisites

- Node.js 18+ / npm (frontend)
- Python 3.11+ / pip (backend)
- Access to a MySQL instance (default config expects `192.168.150.27:3308`, user/password `root`)

## Database

Create the schema once before running the API (adjust database/user as needed):

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

## Backend setup (`server/`)

```bash
cd server
python -m venv .venv
.venv\Scripts\activate      # 在 macOS/Linux 上使用 `source .venv/bin/activate`
pip install -r requirements.txt
cp .env.example .env
```

`.env` 中的默认值指向 `192.168.150.27:3308`，如有变化请自行修改并填入真实的 `GEMINI_API_KEY`。完成后启动 FastAPI：

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 4000
```

接口会暴露在 `http://localhost:4000/api/*`，前端的 Gemini 分析/聊天都通过这些路由调用，密钥不会泄漏到浏览器。

## Frontend setup

```bash
npm install
cp .env.local .env.local.example # optional backup
```

Ensure `.env.local` has the API base (defaults to `/api` via Vite proxy) and any other overrides:

```
VITE_API_BASE_URL=/api
```

Then run Vite:

```bash
npm run dev
```

Visit http://localhost:3000. The dev server proxies `/api` calls to `http://localhost:4000` automatically.

## Deploying

1. 部署 FastAPI：把 `server/` 打包到你自己的 Python 运行环境或 Docker 镜像，设置好 `.env` 并确保能访问 MySQL。
2. 前端执行 `npm run build`，将 `dist/` 托管到任何静态服务器，把 `VITE_API_BASE_URL` 指向 FastAPI 的域名。
3. 确保 Gemini 密钥只配置在服务端；如果跨域，请在 `.env` 的 `CORS_ORIGINS` 中加入前端来源。

## Available Scripts

| Location | Script | Description |
| --- | --- | --- |
| `/` | `npm run dev` | Start the Vite dev server |
| `/` | `npm run build` | Build production assets |
| `/server` | `uvicorn app.main:app --reload --port 4000` | Run the FastAPI server locally |
| `/scripts` | `python init_db.py` | Initialize the MySQL schema |

## Notes

- Frontend state now persists in MySQL; reloading will show previously entered data.
- Gemini endpoints (`/api/gemini/*`) require a valid `GEMINI_API_KEY` in `server/.env`.
- Update `VITE_API_PROXY` or `VITE_API_BASE_URL` if your API runs on a different host/port.
