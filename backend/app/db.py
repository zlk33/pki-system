import os
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

# Pobieramy URL z docker-compose.yml
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://pki_admin:pki_password@db:5432/pki_database")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Certificate(Base):
    __tablename__ = "certificates"
    
    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, unique=True, index=True)
    common_name = Column(String)
    organization = Column(String)
    type = Column(String)  # ROOT, INTERMEDIATE, SERVER, CLIENT
    status = Column(String, default="VALID")
    not_before = Column(DateTime)
    not_after = Column(DateTime)
    pem_data = Column(Text)
    revoked_at = Column(DateTime, nullable=True)
    revocation_reason = Column(String, nullable=True)

class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    common_name = Column(String, nullable=False)
    status = Column(String, default="PENDING")  # Możliwe statusy: PENDING, APPROVED, REJECTED
    csr_pem_data = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)