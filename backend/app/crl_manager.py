import datetime
from typing import Iterable

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

from . import db

REASON_MAP = {
    "unspecified": x509.ReasonFlags.unspecified,
    "keyCompromise": x509.ReasonFlags.key_compromise,
    "cACompromise": x509.ReasonFlags.ca_compromise,
    "affiliationChanged": x509.ReasonFlags.affiliation_changed,
    "superseded": x509.ReasonFlags.superseded,
    "cessationOfOperation": x509.ReasonFlags.cessation_of_operation,
}


def generate_crl_pem(ca_cert_pem: str, ca_key_pem: bytes, revoked_certs: Iterable[db.Certificate]) -> str:
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem.encode("utf-8"))
    ca_key = serialization.load_pem_private_key(ca_key_pem, password=None)

    now = datetime.datetime.utcnow()
    builder = (
        x509.CertificateRevocationListBuilder()
        .issuer_name(ca_cert.subject)
        .last_update(now)
        .next_update(now + datetime.timedelta(days=7))
    )

    for cert in revoked_certs:
        serial = int(cert.serial_number)
        revoked_at = cert.revoked_at or now
        revoked_builder = (
            x509.RevokedCertificateBuilder()
            .serial_number(serial)
            .revocation_date(revoked_at)
        )
        reason = REASON_MAP.get(cert.revocation_reason or "")
        if reason is not None:
            revoked_builder = revoked_builder.add_extension(
                x509.CRLReason(reason),
                critical=False,
            )
        builder = builder.add_revoked_certificate(revoked_builder.build())

    crl = builder.sign(ca_key, hashes.SHA256())
    return crl.public_bytes(serialization.Encoding.PEM).decode("utf-8")
