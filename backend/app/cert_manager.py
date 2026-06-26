import datetime
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def _to_pem_bytes(pem: str | bytes) -> bytes:
    if isinstance(pem, bytes):
        return pem
    return pem.encode("utf-8")


def generate_certificate_from_csr(
    csr_pem: str | bytes,
    ca_cert_pem: bytes,
    ca_key_pem: bytes,
    validity_days: int = 365,
):
    csr = x509.load_pem_x509_csr(_to_pem_bytes(csr_pem))
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem)
    ca_key = serialization.load_pem_private_key(ca_key_pem, password=None)

    cert_builder = x509.CertificateBuilder().subject_name(
        csr.subject
    ).issuer_name(
        ca_cert.subject
    ).public_key(
        csr.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=validity_days)
    )

    cert = cert_builder.sign(ca_key, hashes.SHA256())
    cert_pem_output = cert.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    return cert, cert_pem_output


def generate_user_key_and_csr(common_name: str, email: str, first_name: str, last_name: str):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    name_parts = [
        x509.NameAttribute(NameOID.COMMON_NAME, common_name),
        x509.NameAttribute(NameOID.EMAIL_ADDRESS, email),
    ]

    given_name = first_name.strip()
    surname = last_name.strip()
    if given_name:
        name_parts.append(x509.NameAttribute(NameOID.GIVEN_NAME, given_name))
    if surname:
        name_parts.append(x509.NameAttribute(NameOID.SURNAME, surname))

    subject = x509.Name(name_parts)
    csr = x509.CertificateSigningRequestBuilder().subject_name(subject).sign(private_key, hashes.SHA256())

    csr_pem = csr.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('utf-8')

    return csr_pem, key_pem
