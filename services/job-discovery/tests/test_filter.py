from job_discovery.filter import Profile, matches_profile
from job_discovery.models import NormalizedJob


def _profile() -> Profile:
    return Profile(
        titles=["Senior Software Engineer", "Staff Platform Engineer"],
        include_keywords=["typescript", "python", "react", "platform"],
        exclude_keywords=["intern", "junior"],
    )


def test_matches_senior_typescript():
    job = NormalizedJob(
        title="Senior Software Engineer",
        company="Acme",
        application_url="https://example.com/jobs/1",
        description="Build TypeScript services",
        source="greenhouse",
        source_primary="greenhouse",
    )
    assert matches_profile(job, _profile())


def test_excludes_intern():
    job = NormalizedJob(
        title="Senior Software Engineer Intern",
        company="Acme",
        application_url="https://example.com/jobs/2",
        description="TypeScript internship",
        source="greenhouse",
        source_primary="greenhouse",
    )
    assert not matches_profile(job, _profile())


def test_rejects_unrelated_juniorish():
    job = NormalizedJob(
        title="Marketing Coordinator",
        company="Acme",
        application_url="https://example.com/jobs/3",
        description="Brand campaigns",
        source="remoteok",
        source_primary="remoteok",
    )
    assert not matches_profile(job, _profile())
