import os
from datetime import datetime

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://pki_admin:pki_password@db:5432/pki_database"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(Text, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    certificates = relationship("Certificate", back_populates="user")
    requests = relationship("Request", back_populates="user")
    signed_documents = relationship("SignedDocument", back_populates="user")
    audit_logs = relationship("AuditLog", back_populates="user")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_email = Column(String, nullable=True)
    actor_first_name = Column(String, nullable=True)
    actor_last_name = Column(String, nullable=True)
    actor_role = Column(String, nullable=True)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=True)
    resource_id = Column(String, nullable=True)
    target_label = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    details = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="audit_logs")


class Certificate(Base):
    __tablename__ = "certificates"

    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, unique=True, index=True, nullable=False)
    common_name = Column(String, nullable=False)
    organization = Column(String, nullable=True)
    type = Column(String, nullable=False)
    status = Column(String, default="VALID", nullable=False)
    not_before = Column(DateTime, nullable=False)
    not_after = Column(DateTime, nullable=False)
    pem_data = Column(Text, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    revocation_reason = Column(String, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_first_name = Column(String, nullable=True)
    owner_last_name = Column(String, nullable=True)
    owner_email = Column(String, nullable=True)

    user = relationship("User", back_populates="certificates")
    signed_documents = relationship("SignedDocument", back_populates="certificate")


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    common_name = Column(String, nullable=False)
    status = Column(String, default="PENDING", nullable=False)
    csr_pem_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    owner_first_name = Column(String, nullable=True)
    owner_last_name = Column(String, nullable=True)
    owner_email = Column(String, nullable=True)

    user = relationship("User", back_populates="requests")


class SignedDocument(Base):
    __tablename__ = "signed_documents"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    certificate_id = Column(Integer, ForeignKey("certificates.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String, nullable=False)
    mime_type = Column(String, nullable=True)
    document_hash = Column(Text, nullable=False)
    signature_pem = Column(Text, nullable=False)
    signed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    timestamp_signature = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("User", back_populates="signed_documents")
    certificate = relationship("Certificate", back_populates="signed_documents")