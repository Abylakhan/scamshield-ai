from collections.abc import Iterator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

_settings = get_settings()
engine = create_engine(
    _settings.database_url,
    connect_args={"check_same_thread": False} if _settings.database_url.startswith("sqlite") else {},
)
if _settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):  # concurrent readers + a writer, wait instead of failing on locks
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.close()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    from .models import Scan  # registers the table on Base.metadata

    Base.metadata.create_all(bind=engine)
    _add_missing_columns(Scan)


def _add_missing_columns(Scan) -> None:
    """Minimal forward migration for existing SQLite files: add new nullable columns in place."""
    existing = {c["name"] for c in inspect(engine).get_columns(Scan.__tablename__)}
    with engine.begin() as conn:
        for col in Scan.__table__.columns:
            if col.name not in existing:
                conn.execute(text(f'ALTER TABLE {Scan.__tablename__} ADD COLUMN "{col.name}" {col.type.compile(engine.dialect)}'))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
