# AIHUB

AIHUB is a small full-stack app: upload PDFs or images (JPG, PNG), view them next to a prompt, call OpenAI for structured extraction (JSON names), optionally highlight matches in text PDFs, and persist prompts and edited fields in local JSON files under `data/`.

- **Frontend:** React (Vite), Tailwind, `@react-pdf-viewer`
- **Backend:** FastAPI, `pypdf` (text PDFs), PyMuPDF (rasterize scanned PDFs for vision), OpenAI API

## Prerequisites

- **Python** 3.11+ recommended  
- **Node.js** 18+ and npm  
- An **OpenAI API key** and a **vision-capable** model (e.g. `gpt-4o`) if you use images or scanned PDFs

## Repository layout

```
aihub/
├── backend/          # FastAPI app (run from here for uvicorn)
├── frontend/       # Vite + React
├── data/           # documents_registry.json, prompt_responses.json
├── files/          # uploaded binaries (gitignored except .gitkeep)
└── prompt/         # optional notes / specs
```

## First-time setup (new clone)

### 1. Backend environment

From the `backend` folder:

```bash
cd backend
cp .env.example .env
```

Edit **`.env`** and set at least:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your secret key (`sk-...`) |
| `OPENAI_MODEL` | e.g. `gpt-4o` |

Optional variables (see comments in `.env.example`):

- `DOCUMENT_CONTEXT_MAX_CHARS` — max characters of extracted PDF text sent with text-mode completions  
- `VISION_PDF_MAX_PAGES` — max PDF pages rasterized for vision when the PDF has no extractable text  
- `VISION_MAX_IMAGE_SIDE` — longest side in pixels when rasterizing PDF pages  
- `UPLOAD_MAX_MB` — max upload size  

**Never commit `.env`.** It is listed in `backend/.gitignore`. If a key was ever committed or shared, **revoke it** in the OpenAI dashboard and create a new one.

### 2. Install and run the API

Still in `backend` (after editing `.env`):

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8002
```

Keep this terminal open. The API must match the port used by the Vite dev proxy (see below).

### 3. Install and run the frontend

In a **second** terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually **http://localhost:5173**).

The dev server proxies **`/api`** to **`http://127.0.0.1:8002`** (`frontend/vite.config.js`). If you run uvicorn on another port, change the proxy `target` to match.

## Command cheat sheet

| Step | Directory | Commands |
|------|-----------|----------|
| Configure secrets | `backend/` | `cp .env.example .env` → edit `OPENAI_API_KEY`, `OPENAI_MODEL` |
| API | `backend/` | `python3 -m venv .venv` → `source .venv/bin/activate` → `pip install -r requirements.txt` → `uvicorn main:app --reload --host 127.0.0.1 --port 8002` |
| UI (dev) | `frontend/` | `npm install` → `npm run dev` |
| UI (production build) | `frontend/` | `npm run build` → static files in `frontend/dist/` |

## Pushing to GitHub (reference)

From the repository root:

```bash
git init
git branch -M main
git add .
git status    # confirm backend/.env is NOT listed
git commit -m "Initial commit: AIHUB"
git remote add origin git@github.com:marcoapepe/aihub.git
git push -u origin main
```

If the remote already has commits (e.g. a README from GitHub):

```bash
git pull origin main --rebase
git push -u origin main
```

## Git ignore notes

- **Root** `.gitignore`: ignores everything under `files/` except `files/.gitkeep` so uploads are not committed.  
- **`backend/.gitignore`:** `.venv`, `__pycache__`, `.env`, etc.  
- **`frontend/.gitignore`:** `node_modules`, `dist`, `.env`, etc.

## License

Specify your license here if applicable.
