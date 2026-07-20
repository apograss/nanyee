import hmac
import secrets
from datetime import date, datetime
from pathlib import Path

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from starlette.middleware.sessions import SessionMiddleware

from smu_reserver.cabins import DEFAULT_CABINS
from smu_reserver.config import Settings, get_settings
from smu_reserver.db import Database
from smu_reserver.models import NewTask, TaskStatus
from smu_reserver.repository import TaskRepository
from smu_reserver.security import CredentialCipher, PasswordHasher
from smu_reserver.settings_repository import AdminRepository, CredentialRepository

PACKAGE_DIR = Path(__file__).parent
STATUS_LABELS = {
    TaskStatus.WAITING: "等待",
    TaskStatus.PREFLIGHT: "预检",
    TaskStatus.RUNNING: "抢约中",
    TaskStatus.AUTH_REFRESH: "登录续期",
    TaskStatus.PAUSED_AUTH: "登录暂停",
    TaskStatus.PAUSED_REVIEW: "待人工确认",
    TaskStatus.SUCCEEDED: "成功",
    TaskStatus.FAILED_TIMEOUT: "超时失败",
    TaskStatus.FAILED_VALIDATION: "参数失败",
    TaskStatus.CANCELLED: "已取消",
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    database = Database(settings.database_path)
    database.initialize()
    cipher = CredentialCipher(settings.credential_key.get_secret_value())
    admin_repository = AdminRepository(database, PasswordHasher())
    credential_repository = CredentialRepository(database, cipher)
    task_repository = TaskRepository(database)
    if settings.admin_password and not admin_repository.has_password():
        admin_repository.set_password(settings.admin_password.get_secret_value())

    app = FastAPI(title="SMU 学习舱自动预约", docs_url=None, redoc_url=None)
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.app_secret_key.get_secret_value(),
        same_site="lax",
        https_only=settings.app_env == "production",
    )
    templates = Jinja2Templates(directory=PACKAGE_DIR / "templates")
    app.mount("/static", StaticFiles(directory=PACKAGE_DIR / "static"), name="static")
    app.state.admin_repository = admin_repository
    app.state.credential_repository = credential_repository
    app.state.task_repository = task_repository
    app.state.settings = settings

    def require_admin(request: Request) -> RedirectResponse | None:
        if request.session.get("admin") is not True:
            return RedirectResponse("/login", status_code=303)
        return None

    def csrf_token(request: Request) -> str:
        token = request.session.get("csrf")
        if not isinstance(token, str):
            token = secrets.token_urlsafe(24)
            request.session["csrf"] = token
        return token

    def verify_csrf(request: Request, submitted: str) -> None:
        expected = request.session.get("csrf")
        if not isinstance(expected, str) or not hmac.compare_digest(expected, submitted):
            raise HTTPException(status_code=403, detail="CSRF validation failed")

    @app.get("/health/live")
    def health_live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/login", response_class=HTMLResponse)
    def login_page(request: Request, error: str | None = None):
        return templates.TemplateResponse(
            request=request,
            name="login.html",
            context={"error": error, "csrf": csrf_token(request)},
        )

    @app.post("/login")
    def login(request: Request, password: str = Form(...), csrf: str = Form(default="")):
        verify_csrf(request, csrf)
        if not admin_repository.verify_password(password):
            return templates.TemplateResponse(
                request=request,
                name="login.html",
                context={"error": "密码错误"},
                status_code=401,
            )
        request.session.clear()
        request.session["admin"] = True
        csrf_token(request)
        return RedirectResponse("/", status_code=303)

    @app.post("/logout")
    def logout(request: Request, csrf: str = Form(default="")):
        verify_csrf(request, csrf)
        request.session.clear()
        return RedirectResponse("/login", status_code=303)

    @app.get("/", response_class=HTMLResponse)
    def task_list(request: Request):
        if redirect := require_admin(request):
            return redirect
        tasks = task_repository.list_tasks()
        return templates.TemplateResponse(
            request=request,
            name="tasks.html",
            context={
                "tasks": tasks,
                "status_labels": STATUS_LABELS,
                "csrf": csrf_token(request),
            },
        )

    @app.get("/tasks/new", response_class=HTMLResponse)
    def new_task(request: Request):
        if redirect := require_admin(request):
            return redirect
        return templates.TemplateResponse(
            request=request,
            name="task_form.html",
            context={
                "cabins": DEFAULT_CABINS,
                "today": date.today().isoformat(),
                "csrf": csrf_token(request),
            },
        )

    @app.post("/tasks")
    def create_task(
        request: Request,
        target_date: str = Form(...),
        start_time: str = Form(...),
        end_time: str = Form(...),
        title: str = Form(...),
        attempt_from: str = Form(...),
        attempt_until: str = Form(...),
        cabin_ids: str = Form(...),
        csrf: str = Form(default=""),
    ):
        if redirect := require_admin(request):
            return redirect
        verify_csrf(request, csrf)
        task_repository.create_task(
            NewTask(
                target_date=date.fromisoformat(target_date),
                start_time=datetime.strptime(start_time, "%H:%M").time(),
                end_time=datetime.strptime(end_time, "%H:%M").time(),
                title=title,
                attempt_from=datetime.fromisoformat(attempt_from),
                attempt_until=datetime.fromisoformat(attempt_until),
                cabin_ids=[int(value) for value in cabin_ids.split(",") if value.strip()],
            )
        )
        return RedirectResponse("/", status_code=303)

    @app.post("/tasks/{task_id}/cancel")
    def cancel_task(request: Request, task_id: int, csrf: str = Form(default="")):
        if redirect := require_admin(request):
            return redirect
        verify_csrf(request, csrf)
        task_repository.set_status(task_id, TaskStatus.CANCELLED)
        return RedirectResponse("/", status_code=303)

    @app.get("/settings", response_class=HTMLResponse)
    def settings_page(request: Request):
        if redirect := require_admin(request):
            return redirect
        return templates.TemplateResponse(
            request=request,
            name="settings.html",
            context={
                "credentials_saved": credential_repository.has_login(),
                "csrf": csrf_token(request),
            },
        )

    @app.post("/settings/credentials")
    def save_credentials(
        request: Request,
        account: str = Form(...),
        password: str = Form(...),
        csrf: str = Form(default=""),
    ):
        if redirect := require_admin(request):
            return redirect
        verify_csrf(request, csrf)
        credential_repository.save_login(account.strip(), password)
        return RedirectResponse("/settings", status_code=303)

    return app


app = create_app()
