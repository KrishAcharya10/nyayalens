"""
Shared Postgres connection helper for services/ml scripts. Reads
DATABASE_URL from the repo-root .env (the same one apps/api and
packages/db use) so credentials live in exactly one place.
"""

import pathlib
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import psycopg2
import psycopg2.extras
from dotenv import dotenv_values

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


def _database_url() -> str:
    # encoding="utf-8-sig" tolerates a leading BOM (this repo's .env was
    # written by a tool that adds one on Windows) while behaving
    # identically to utf-8 when there isn't one.
    values = dotenv_values(REPO_ROOT / ".env", encoding="utf-8-sig")
    url = values.get("DATABASE_URL")
    if not url:
        raise RuntimeError(f"DATABASE_URL not found in {REPO_ROOT / '.env'}")

    # Prisma's connection-string convention adds ?schema=public, which is
    # not a libpq DSN parameter - psycopg2 rejects it outright. Strip it;
    # the default search_path already includes "public", so dropping it
    # changes nothing about which schema is used.
    parsed = urlparse(url)
    remaining_query = {k: v for k, v in parse_qs(parsed.query).items() if k != "schema"}
    return urlunparse(parsed._replace(query=urlencode(remaining_query, doseq=True)))


def get_connection():
    return psycopg2.connect(_database_url(), cursor_factory=psycopg2.extras.RealDictCursor)
