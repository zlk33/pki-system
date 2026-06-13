import datetime
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID


def generate_certificate_from_csr(csr_pem: str, ca_cert_pem: bytes, ca_key_pem: bytes):
    csr = x509.load_pem_x509_csr(csr_pem.encode('utf-8'))
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
        datetime.datetime.utcnow() + datetime.timedelta(days=365)
    )

    cert = cert_builder.sign(ca_key, hashes.SHA256())
    cert_pem_output = cert.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    return cert, cert_pem_output


def generate_key_and_certificate(common_name: str, organization: str, cert_type: str, ca_cert_pem: bytes, ca_key_pem: bytes):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem)
    ca_key = serialization.load_pem_private_key(ca_key_pem, password=None)

    subject_attributes = [x509.NameAttribute(NameOID.COMMON_NAME, common_name)]
    if organization.strip():
        subject_attributes.insert(0, x509.NameAttribute(NameOID.ORGANIZATION_NAME, organization.strip()))

    subject = x509.Name(subject_attributes)

    builder = x509.CertificateBuilder().subject_name(
        subject
    ).issuer_name(
        ca_cert.subject
    ).public_key(
        private_key.public_key()
    ).serial_number(
        x509.random_serial_number()
    ).not_valid_before(
        datetime.datetime.utcnow()
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=365)
    )

    builder = builder.add_extension(
        x509.BasicConstraints(ca=False, path_length=None),
        critical=True,
    )

    if cert_type == 'SERVER':
        builder = builder.add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]),
            critical=False,
        )
    elif cert_type == 'CLIENT':
        builder = builder.add_extension(
            x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.CLIENT_AUTH]),
            critical=False,
        )

    cert = builder.sign(ca_key, hashes.SHA256())

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode('utf-8')

    return cert, cert_pem, key_pem
