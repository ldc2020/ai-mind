import os
import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from routes.mindmap import router as mindmap_router

app = FastAPI(title="AI Mind", version="1.0.0")

os.makedirs("data", exist_ok=True)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(mindmap_router, prefix="/api")


@app.get("/")
def index():
    return FileResponse(Path("static/index.html"))

if __name__ == "__main__":
    # 设置窗口标题，方便在任务管理器中区分
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.kernel32.SetConsoleTitleW("AI Mind Server")
    uvicorn.run("main:app", host="127.0.0.1", port=8001, reload=True, reload_excludes=["data/*"])
