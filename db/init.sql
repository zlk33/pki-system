CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user', -- 'admin', 'user'
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    revocation_reason VARCHAR(255) NULL,
    user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    owner_first_name VARCHAR(120) NULL,
    owner_last_name VARCHAR(120) NULL,
    owner_email VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS requests (
    id SERIAL PRIMARY KEY,
    common_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING', -- 'PENDING', 'APPROVED', 'REJECTED'
    csr_pem_data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    owner_first_name VARCHAR(120) NULL,
    owner_last_name VARCHAR(120) NULL,
    owner_email VARCHAR(255) NULL
);

CREATE TABLE IF NOT EXISTS signed_documents (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NULL,
    document_hash TEXT NOT NULL,
    signature_pem TEXT NOT NULL,
    signed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    timestamp_signature TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_certificates_serial_number ON certificates(serial_number);
CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_user_id ON signed_documents(user_id);
CREATE INDEX IF NOT EXISTS idx_signed_documents_certificate_id ON signed_documents(certificate_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255) NULL,
    actor_first_name VARCHAR(120) NULL,
    actor_last_name VARCHAR(120) NULL,
    actor_role VARCHAR(50) NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NULL,
    resource_id VARCHAR(128) NULL,
    target_label VARCHAR(255) NULL,
    summary TEXT NULL,
    details TEXT NULL,
    metadata_json TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);