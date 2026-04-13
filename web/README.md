# TexasSolver Web Demo

This folder contains an interactive web UI that calls the TexasSolver algorithm through `release/api.dll`.

## 1) Build backend DLL (once, or after code changes)

```powershell
powershell -ExecutionPolicy Bypass -File .\web\build-api.ps1
```

## 2) Start web server

```powershell
powershell -ExecutionPolicy Bypass -File .\web\run-web.ps1
```

Then open: `http://127.0.0.1:8080`

## API endpoints

- `POST /api/solve` start a solving job
- `GET /api/status` check running state
- `GET /api/log` get `tmp_log.txt` tail
- `GET /api/result` get result preview

Result files are generated into `web/runtime/`.
