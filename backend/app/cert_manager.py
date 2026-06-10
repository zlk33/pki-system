import datetime
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization

def generate_certificate_from_csr(csr_pem: str, ca_cert_pem: bytes, ca_key_pem: bytes):
    # 1. Wczytujemy dane z formatu tekstowego (PEM) do obiektów zrozumiałych dla biblioteki
    csr = x509.load_pem_x509_csr(csr_pem.encode('utf-8'))
    ca_cert = x509.load_pem_x509_certificate(ca_cert_pem)
    ca_key = serialization.load_pem_private_key(ca_key_pem, password=None)

    # 2. Budujemy nowy certyfikat
    cert_builder = x509.CertificateBuilder().subject_name(
        csr.subject # Bierzemy dane podmiotu (np. Imię) z jego żądania CSR
    ).issuer_name(
        ca_cert.subject # Wystawcą jesteśmy my (czyli Root CA)
    ).public_key(
        csr.public_key() # Bierzemy klucz publiczny użytkownika z jego CSR
    ).serial_number(
        x509.random_serial_number() # Nadajemy unikalny numer seryjny
    ).not_valid_before(
        datetime.datetime.utcnow() # Ważny od teraz
    ).not_valid_after(
        datetime.datetime.utcnow() + datetime.timedelta(days=365) # Ważny przez 1 rok (365 dni)
    )

    # 3. Podpisujemy nowy certyfikat kluczem prywatnym naszego urzędu (Root CA)
    cert = cert_builder.sign(ca_key, hashes.SHA256())

    # 4. Zwracamy gotowy certyfikat w formacie tekstowym (PEM), żeby łatwo zapisać go w bazie
    cert_pem_output = cert.public_bytes(serialization.Encoding.PEM).decode('utf-8')
    
    return cert, cert_pem_output