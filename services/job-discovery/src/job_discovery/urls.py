"""Application URL normalization for ingest (HTTPS-only contract)."""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def normalize_application_url(url: str | None) -> str | None:
    """Return an absolute HTTPS apply URL, or None if the value is unusable.

    - Strips whitespace
    - Upgrades ``http://`` → ``https://`` (safe for public apply links)
    - Prepends ``https://`` when a scheme-less host/path is provided
    - Rejects empty, non-http(s), or unparseable values
    """
    if url is None:
        return None
    raw = str(url).strip()
    if not raw:
        return None

    lower = raw.lower()
    if lower.startswith("http://"):
        raw = "https://" + raw[7:]
    elif lower.startswith("https://"):
        pass
    elif lower.startswith("//"):
        raw = "https:" + raw
    else:
        # Reject other schemes (mailto:, javascript:, ftp://, …) before
        # prepending https — urlsplit("mailto:x") has scheme=mailto.
        probe = urlsplit(raw)
        if probe.scheme and probe.scheme.lower() not in ("http", "https"):
            return None
        if probe.scheme:
            # http/https without // should not happen; treat as unusable
            return None
        # Scheme-less host/path
        raw = "https://" + raw.lstrip("/")

    # Reject whitespace that slipped past strip (e.g. mid-URL spaces)
    if any(c.isspace() for c in raw):
        return None

    try:
        parts = urlsplit(raw)
    except ValueError:
        return None

    if parts.scheme.lower() != "https":
        return None
    if not parts.netloc:
        return None

    # Rebuild with lowercase scheme/host; keep path/query/fragment as-is
    return urlunsplit(
        ("https", parts.netloc.lower(), parts.path or "", parts.query, parts.fragment)
    )
