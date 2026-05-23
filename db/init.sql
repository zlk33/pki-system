CREATE TABLE IF NOT EXISTS certificates (
    id SERIAL PRIMARY KEY,
    serial_number VARCHAR(128) UNIQUE NOT NULL, -- numer seryjny z Cryptography (int na String/Hex)
    common_name VARCHAR(255) NOT NULL,
    organization VARCHAR(255),
    type VARCHAR(50) NOT NULL, -- np. 'ROOT', 'INTERMEDIATE', 'SERVER', 'CLIENT'
    status VARCHAR(20) NOT NULL DEFAULT 'VALID', -- 'VALID', 'REVOKED', 'EXPIRED'
    not_before TIMESTAMP NOT NULL,
    not_after TIMESTAMP NOT NULL,
    pem_data TEXT NOT NULL, -- pełny certyfikat (żeby nie uciekł z plików systemowych)
    revoked_at TIMESTAMP NULL,
    revocation_reason VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    common_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    csr_pem_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);