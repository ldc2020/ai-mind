import sys
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from routes.mindmap import router as mindmap_router
from config.settings import settings, default_document_path

app = FastAPI(title=settings["app_name"], version=settings["version"])

settings["data_dir"].mkdir(parents=True, exist_ok=True)

app.mount("/static", StaticFiles(directory=settings["static_dir"]), name="static")
app.include_router(mindmap_router, prefix="/api")


@app.exception_handler(ValueError)
async def invalid_value(request, exc):
    """无效文档标识等输入错误返回 400，不向客户端暴露磁盘路径。"""
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.middleware("http")
async def refresh_static_configuration(request, call_next):
    """要求浏览器重新验证静态文件，修改配置后不必手工更新版本号。"""
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/api/default-document":
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/default-document")
def default_document():
    """前后端共享的新建导图模板，不含用户配置或密钥。"""
    return FileResponse(default_document_path())


@app.get("/api/health")
def health():
    """启动器用就绪状态代替固定等待时长，不读取用户文档。"""
    return {"application": settings["app_name"], "version": settings["version"], "ready": True}


@app.get("/")
def index():
    return FileResponse(settings["static_dir"] / "index.html", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    if sys.platform == "win32":
        import ctypes
        ctypes.windll.kernel32.SetConsoleTitleW("AI Mind Server")
    # 用环境变量或 config/local.json 覆盖；生产运行请关闭热重载。
    uvicorn.run("main:app", host=settings["host"], port=settings["port"],
                reload=settings["reload"], log_level=settings["log_level"],
                reload_dirs=[str(Path(__file__).resolve().parent)] if settings["reload"] else None,
                reload_excludes=[str(settings["data_dir"] / "*")])
