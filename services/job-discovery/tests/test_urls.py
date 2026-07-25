from job_discovery.urls import normalize_application_url


def test_http_upgraded_to_https():
    assert (
        normalize_application_url("http://www.adzuna.com/land/ad/129698749")
        == "https://www.adzuna.com/land/ad/129698749"
    )


def test_https_preserved():
    assert (
        normalize_application_url("https://jobs.example.com/apply/123?x=1")
        == "https://jobs.example.com/apply/123?x=1"
    )


def test_scheme_less_host_gets_https():
    assert (
        normalize_application_url("careers.example.com/jobs/1")
        == "https://careers.example.com/jobs/1"
    )


def test_garbage_urls_skipped():
    assert normalize_application_url("") is None
    assert normalize_application_url(None) is None
    assert normalize_application_url("   ") is None
    assert normalize_application_url("mailto:hr@example.com") is None
    assert normalize_application_url("javascript:void(0)") is None
    assert normalize_application_url("not a url at all") is None
    assert normalize_application_url("https://example.com/has space") is None
