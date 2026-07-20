"""Import every ORM model so Alembic sees complete metadata."""

from nanyee.anti_abuse.models import RateLimitBucket
from nanyee.credentials.models import HostedCredential
from nanyee.identity.models import Session, User
from nanyee.jobs.models import Job
from nanyee.registration.models import RegistrationChallenge

__all__ = [
    "HostedCredential",
    "Job",
    "RateLimitBucket",
    "RegistrationChallenge",
    "Session",
    "User",
]
