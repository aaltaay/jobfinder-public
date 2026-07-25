from job_discovery.geo import is_us_focused
from job_discovery.models import NormalizedJob


def _job(location: str, arrangement: str = "remote") -> NormalizedJob:
    return NormalizedJob(
        title="Senior Software Engineer",
        company="Acme",
        application_url="https://example.com/j/1",
        location=location,
        work_arrangement=arrangement,  # type: ignore[arg-type]
        source="greenhouse",
        source_primary="greenhouse",
    )


def test_us_remote():
    assert is_us_focused(_job("Remote - USA"))


def test_canada_and_us():
    assert is_us_focused(_job("Remote, Canada; Remote, US"))


def test_london_rejected():
    assert not is_us_focused(_job("London, England", "onsite"))


def test_remote_france_rejected():
    assert not is_us_focused(_job("Remote, France", "remote"))


def test_sf_kept():
    assert is_us_focused(_job("San Francisco", "hybrid"))
