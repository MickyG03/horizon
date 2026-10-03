from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

from config import settings

engine = create_engine(
    f"sqlite:///{settings.db_path}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record) -> None:
    # WAL lets the runner write steps while request handlers read.
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def init_db() -> None:
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    import db.models  # noqa: F401  (registers the tables on SQLModel.metadata)

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
