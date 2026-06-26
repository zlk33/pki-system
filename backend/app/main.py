import hashlib
import json
import os
import time
from datetime import datetime, timedelta
from typing import Optional

from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException, Header, UploadFile, File, Form
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel, EmailStr
from jose import jwt, JWTError
from passlib.context import CryptContext

from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import rsa, padding

from . import db, ca_manager, cert_manager, audit, crl_manager


app = FastAPI(title="Studenckie PKI - API")

@app.on_event("startup")
def run_migrations():
    last_error = None
    for _ in range(30):
        try:
            with db.engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                ))
                conn.execute(text(
                    "ALTER TABLE signed_documents ADD COLUMN IF NOT EXISTS timestamp_signature TEXT"
                ))
                conn.execute(text(
                    "UPDATE signed_documents SET signed_at = created_at WHERE signed_at IS NULL"
                ))
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS audit_logs (
                        id SERIAL PRIMARY KEY,
                        user_id INTEGER NULL REFERENCES users(id) ON DELETE SET NULL,
                        action VARCHAR(100) NOT NULL,
                        resource_type VARCHAR(50) NULL,
                        resource_id VARCHAR(128) NULL,
                        details TEXT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_email VARCHAR(255)"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_first_name VARCHAR(120)"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_last_name VARCHAR(120)"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50)"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS target_label VARCHAR(255)"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS summary TEXT"
                ))
                conn.execute(text(
                    "ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS metadata_json TEXT"
                ))
            return
        except OperationalError as exc:
            last_error = exc
            time.sleep(1)

    if last_error:
        raise last_error

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("/app/certs", exist_ok=True)

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class RegisterModel(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str


class LoginModel(BaseModel):
    email: EmailStr
    password: str


class CSRRequestModel(BaseModel):
    common_name: str
    csr_pem: str


class IssueCertificateModel(BaseModel):
    request_id: int


class IssueForUserModel(BaseModel):
    user_id: int
    common_name: str
    organization: str
    country: Optional[str] = ""
    state: Optional[str] = ""
    locality: Optional[str] = ""
    type: str = "CLIENT"
    validity_days: int = 365


class RevokeCertificateModel(BaseModel):
    reason: str = "unspecified"


class CreateUserModel(BaseModel):
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    role: str = "user"


class UpdateUserModel(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    role: Optional[str] = None


class ResetPasswordModel(BaseModel):
    password: str


def get_db():
    database = db.SessionLocal()
    try:
        yield database
    finally:
        database.close()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(data: dict, expires_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(minutes=expires_minutes)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    database: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Brak tokenu autoryzacji")

    token = authorization.replace("Bearer ", "").strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Nieprawidłowy token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Nieprawidłowy token")

    user = database.query(db.User).filter(db.User.id == int(user_id)).first()
    if not user:
        raise HTTPException(status_code=401, detail="Użytkownik nie istnieje")

    return user


def require_admin(user=Depends(get_current_user)):
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Brak uprawnień administratora")
    return user


def user_to_dict(user: db.User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }


def count_admins(database: Session) -> int:
    return database.query(db.User).filter(db.User.role == "admin").count()


def ensure_not_last_admin(database: Session, target: db.User, new_role: Optional[str] = None) -> None:
    if target.role == "admin":
        becoming_user = new_role == "user" if new_role else True
        if becoming_user and count_admins(database) <= 1:
            raise HTTPException(status_code=400, detail="Nie można usunąć ostatniego administratora")


def certificate_to_dict(cert: db.Certificate) -> dict:
    has_private_key = False
    if cert.user_id and cert.type != "ROOT":
        has_private_key = os.path.exists(get_user_cert_key_path(cert.user_id, cert.id))

    return {
        "id": cert.id,
        "serial_number": cert.serial_number,
        "common_name": cert.common_name,
        "organization": cert.organization,
        "type": cert.type,
        "status": cert.status,
        "not_before": cert.not_before.isoformat() if cert.not_before else None,
        "not_after": cert.not_after.isoformat() if cert.not_after else None,
        "pem_data": cert.pem_data,
        "revoked_at": cert.revoked_at.isoformat() if cert.revoked_at else None,
        "revocation_reason": cert.revocation_reason,
        "user_id": cert.user_id,
        "owner_first_name": cert.owner_first_name,
        "owner_last_name": cert.owner_last_name,
        "owner_email": cert.owner_email,
        "has_private_key": has_private_key,
    }


def get_user_cert_key_path(user_id: int, cert_id: int) -> str:
    return f"/app/certs/user_{user_id}_cert_{cert_id}.key"


SIGNATURE_PACKAGE_FORMAT = "studenckie-pki-v2"
SUPPORTED_SIGNATURE_FORMATS = {"studenckie-pki-v1", "studenckie-pki-v2"}


def format_signed_at(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat() + "Z"


def build_timestamp_payload(document_hash: str, signed_at: str) -> bytes:
    return json.dumps(
        {"document_hash_sha256": document_hash, "signed_at": signed_at},
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def create_timestamp_signature(private_key, document_hash: str, signed_at: str) -> str:
    payload = build_timestamp_payload(document_hash, signed_at)
    signature = private_key.sign(payload, padding.PKCS1v15(), hashes.SHA256())
    return signature.hex()


def build_signature_package(signed_doc: db.SignedDocument, cert: db.Certificate) -> dict:
    signed_at_dt = signed_doc.signed_at or signed_doc.created_at
    signed_at = format_signed_at(signed_at_dt) if signed_at_dt else None
    package = {
        "format": SIGNATURE_PACKAGE_FORMAT,
        "signed_document_id": signed_doc.id,
        "file_name": signed_doc.file_name,
        "document_hash_sha256": signed_doc.document_hash,
        "signature_hex": signed_doc.signature_pem,
        "certificate_pem": cert.pem_data,
        "certificate_serial_number": cert.serial_number,
        "certificate_common_name": cert.common_name,
        "certificate_owner_email": cert.owner_email,
        "signed_at": signed_at,
    }
    if signed_doc.timestamp_signature:
        package["timestamp_signature_hex"] = signed_doc.timestamp_signature
    return package


def signature_package_filename(file_name: str) -> str:
    return f"{file_name}.pki.sig.json"


def parse_signature_package(raw: bytes) -> dict:
    try:
        package = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise HTTPException(status_code=400, detail=f"Nieprawidłowy plik podpisu: {str(e)}")

    if package.get("format") not in SUPPORTED_SIGNATURE_FORMATS:
        raise HTTPException(status_code=400, detail="Nieobsługiwany format pliku podpisu")

    required = (
        "file_name",
        "document_hash_sha256",
        "signature_hex",
        "certificate_pem",
        "certificate_serial_number",
    )
    for field in required:
        if not package.get(field):
            raise HTTPException(status_code=400, detail=f"Brak wymaganego pola w pliku podpisu: {field}")

    if package.get("format") == SIGNATURE_PACKAGE_FORMAT:
        for field in ("signed_at", "timestamp_signature_hex"):
            if not package.get(field):
                raise HTTPException(status_code=400, detail=f"Brak wymaganego pola w pliku podpisu: {field}")

    return package


def run_signature_verification(
    file_data: bytes,
    document_hash: str,
    signature_hex: str,
    cert_pem: str,
    cert_record: Optional[db.Certificate],
    file_name: str,
    signed_document_id: Optional[int] = None,
    signed_at: Optional[str] = None,
    timestamp_signature_hex: Optional[str] = None,
    require_timestamp: bool = False,
) -> dict:
    calculated_hash = hashlib.sha256(file_data).hexdigest()
    hash_matches = calculated_hash == document_hash

    cert_obj = x509.load_pem_x509_certificate(cert_pem.encode("utf-8"))
    public_key = cert_obj.public_key()
    signature_bytes = bytes.fromhex(signature_hex)

    cryptographic_valid = False
    verify_error = None
    try:
        public_key.verify(signature_bytes, file_data, padding.PKCS1v15(), hashes.SHA256())
        cryptographic_valid = True
    except InvalidSignature:
        verify_error = "Podpis kryptograficzny jest nieprawidłowy"
    except Exception as e:
        verify_error = f"Błąd weryfikacji podpisu: {str(e)}"

    now = datetime.utcnow()
    if cert_record:
        not_before = cert_record.not_before
        not_after = cert_record.not_after
        cert_status_valid = cert_record.status == "VALID"
        cert_info = {
            "id": cert_record.id,
            "common_name": cert_record.common_name,
            "serial_number": cert_record.serial_number,
            "owner_email": cert_record.owner_email,
            "status": cert_record.status,
            "not_before": cert_record.not_before.isoformat() if cert_record.not_before else None,
            "not_after": cert_record.not_after.isoformat() if cert_record.not_after else None,
        }
    else:
        not_before = cert_obj.not_valid_before_utc.replace(tzinfo=None)
        not_after = cert_obj.not_valid_after_utc.replace(tzinfo=None)
        cert_status_valid = True
        cert_info = {
            "id": None,
            "common_name": None,
            "serial_number": str(cert_obj.serial_number),
            "owner_email": None,
            "status": "UNKNOWN",
            "not_before": not_before.isoformat() if not_before else None,
            "not_after": not_after.isoformat() if not_after else None,
        }

    cert_time_valid = True
    if not_before and now < not_before:
        cert_time_valid = False
    if not_after and now > not_after:
        cert_time_valid = False

    timestamp_valid = None
    timestamp_verify_error = None
    if timestamp_signature_hex and signed_at:
        try:
            public_key.verify(
                bytes.fromhex(timestamp_signature_hex),
                build_timestamp_payload(document_hash, signed_at),
                padding.PKCS1v15(),
                hashes.SHA256(),
            )
            timestamp_valid = True
        except InvalidSignature:
            timestamp_valid = False
            timestamp_verify_error = "Podpis znacznika czasu jest nieprawidłowy"
        except Exception as e:
            timestamp_valid = False
            timestamp_verify_error = f"Błąd weryfikacji znacznika czasu: {str(e)}"
    elif require_timestamp:
        timestamp_valid = False
        timestamp_verify_error = "Brak kryptograficznego znacznika czasu w pliku podpisu"

    overall_valid = hash_matches and cryptographic_valid and cert_time_valid and cert_status_valid
    if timestamp_valid is False:
        overall_valid = False

    message = "Podpis poprawny"
    if not overall_valid:
        message = verify_error or timestamp_verify_error or "Weryfikacja nie powiodła się"

    return {
        "valid": overall_valid,
        "hash_matches": hash_matches,
        "signature_valid": cryptographic_valid,
        "timestamp_valid": timestamp_valid,
        "certificate_status_valid": cert_status_valid,
        "certificate_time_valid": cert_time_valid,
        "signed_document_id": signed_document_id,
        "signed_at": signed_at,
        "file_name": file_name,
        "certificate": cert_info,
        "message": message,
    }


@app.post("/api/auth/register")
def register(payload: RegisterModel, database: Session = Depends(get_db)):
    existing = database.query(db.User).filter(db.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Użytkownik z tym adresem e-mail już istnieje")

    role = "admin" if database.query(db.User).count() == 0 else "user"

    user = db.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=role,
    )
    database.add(user)
    database.flush()
    audit.record(
        database,
        user,
        "USER_REGISTERED",
        resource_type="user",
        resource_id=user.id,
        target_label=user.email,
        summary=f"{audit.format_actor(user)} zarejestrował nowe konto (rola: {user.role})",
        metadata={"role": user.role, "email": user.email},
    )
    database.commit()
    database.refresh(user)

    return {
        "message": "Konto zostało utworzone",
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
        },
    }


@app.post("/api/auth/login")
def login(payload: LoginModel, database: Session = Depends(get_db)):
    user = database.query(db.User).filter(db.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Nieprawidłowy e-mail lub hasło")

    token = create_access_token({"sub": str(user.id), "role": user.role})

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
        },
    }


@app.get("/api/auth/me")
def me(user=Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": user.role,
    }


@app.get("/api/users")
def get_users(
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    users = database.query(db.User).order_by(db.User.id.asc()).all()
    return [user_to_dict(u) for u in users]


@app.post("/api/users")
def create_user(
    payload: CreateUserModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    existing = database.query(db.User).filter(db.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Użytkownik z tym adresem e-mail już istnieje")

    role = payload.role.lower()
    if role not in {"admin", "user"}:
        raise HTTPException(status_code=400, detail="Rola musi być admin lub user")

    user = db.User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=role,
    )
    database.add(user)
    database.flush()
    audit.record(
        database,
        admin,
        "USER_CREATED",
        resource_type="user",
        resource_id=user.id,
        target_label=user.email,
        summary=f"{audit.format_actor(admin)} utworzył konto użytkownika {user.email} (rola: {user.role})",
        metadata={
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
        },
    )
    database.commit()
    database.refresh(user)

    return {"message": "Użytkownik został utworzony", "user": user_to_dict(user)}


@app.patch("/api/users/{user_id}")
def update_user(
    user_id: int,
    payload: UpdateUserModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    target = database.query(db.User).filter(db.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    before = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "role": target.role,
    }

    if payload.role is not None:
        role = payload.role.lower()
        if role not in {"admin", "user"}:
            raise HTTPException(status_code=400, detail="Rola musi być admin lub user")
        ensure_not_last_admin(database, target, new_role=role)
        target.role = role

    if payload.first_name is not None:
        target.first_name = payload.first_name
    if payload.last_name is not None:
        target.last_name = payload.last_name

    after = {
        "first_name": target.first_name,
        "last_name": target.last_name,
        "role": target.role,
    }
    changes = {
        field: {"from": before[field], "to": after[field]}
        for field in before
        if before[field] != after[field]
    }

    audit.record(
        database,
        admin,
        "USER_UPDATED",
        resource_type="user",
        resource_id=target.id,
        target_label=target.email,
        summary=f"{audit.format_actor(admin)} zaktualizował użytkownika {target.email}",
        metadata={"changes": changes} if changes else {"note": "brak wykrytych zmian pól"},
    )
    database.commit()
    database.refresh(target)

    return {"message": "Dane użytkownika zostały zaktualizowane", "user": user_to_dict(target)}


@app.post("/api/users/{user_id}/reset-password")
def reset_user_password(
    user_id: int,
    payload: ResetPasswordModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="Hasło musi mieć co najmniej 6 znaków")

    target = database.query(db.User).filter(db.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    target.password_hash = hash_password(payload.password)
    audit.record(
        database,
        admin,
        "USER_PASSWORD_RESET",
        resource_type="user",
        resource_id=target.id,
        target_label=target.email,
        summary=f"{audit.format_actor(admin)} zresetował hasło użytkownika {target.email}",
    )
    database.commit()

    return {"message": f"Hasło użytkownika {target.email} zostało zresetowane"}


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    target = database.query(db.User).filter(db.User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")
    if target.id == admin.id:
        raise HTTPException(status_code=400, detail="Nie możesz usunąć własnego konta")

    ensure_not_last_admin(database, target)

    email = target.email
    target_id = target.id
    deleted_role = target.role
    database.delete(target)
    audit.record(
        database,
        admin,
        "USER_DELETED",
        resource_type="user",
        resource_id=target_id,
        target_label=email,
        summary=f"{audit.format_actor(admin)} usunął konto użytkownika {email}",
        metadata={"deleted_email": email, "deleted_role": deleted_role},
    )
    database.commit()

    return {"message": f"Użytkownik {email} został usunięty"}


@app.get("/api/audit-logs")
def get_audit_logs(
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    logs = database.query(db.AuditLog).order_by(db.AuditLog.id.desc()).limit(200).all()
    return [audit.log_to_dict(log) for log in logs]


@app.get("/api/crl")
def get_crl(database: Session = Depends(get_db), user=Depends(get_current_user)):
    root_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if not root_ca:
        raise HTTPException(status_code=404, detail="Brak Root CA w systemie")

    try:
        with open("/app/certs/root_ca.key", "rb") as f:
            root_key_pem = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Nie znaleziono klucza prywatnego Root CA")

    revoked = database.query(db.Certificate).filter(db.Certificate.status == "REVOKED").all()
    crl_pem = crl_manager.generate_crl_pem(root_ca.pem_data, root_key_pem, revoked)

    audit.record(
        database,
        user,
        "CRL_DOWNLOADED",
        resource_type="crl",
        target_label="studenckie-pki.crl.pem",
        summary=f"{audit.format_actor(user)} pobrał listę CRL ({len(revoked)} unieważnionych certyfikatów)",
        metadata={"revoked_count": len(revoked)},
    )
    database.commit()

    return Response(
        content=crl_pem.encode("utf-8"),
        media_type="application/pkix-crl",
        headers={"Content-Disposition": 'attachment; filename="studenckie-pki.crl.pem"'},
    )


@app.post("/api/ca/init")
def init_root_ca(
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    existing_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if existing_ca:
        raise HTTPException(status_code=400, detail="Root CA zostało już zainicjowane!")

    cert, cert_pem, key_pem = ca_manager.generate_root_ca()

    db_cert = db.Certificate(
        serial_number=str(cert.serial_number),
        common_name="Studenckie Root CA",
        organization="Studenckie PKI",
        type="ROOT",
        not_before=cert.not_valid_before_utc.replace(tzinfo=None),
        not_after=cert.not_valid_after_utc.replace(tzinfo=None),
        pem_data=cert_pem,
    )
    database.add(db_cert)
    database.flush()
    audit.record(
        database,
        admin,
        "CA_INITIALIZED",
        resource_type="certificate",
        resource_id=db_cert.id,
        target_label=db_cert.common_name,
        summary=f"{audit.format_actor(admin)} zainicjował Root CA (serial: {db_cert.serial_number})",
        metadata={"serial_number": db_cert.serial_number, "type": "ROOT"},
    )
    database.commit()

    with open("/app/certs/root_ca.key", "w") as f:
        f.write(key_pem)

    return {
        "message": "Root CA utworzone pomyślnie!",
        "serial_number": str(cert.serial_number),
    }


@app.post("/api/certs/request")
def submit_certificate_request(
    request_data: CSRRequestModel,
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    new_request = db.Request(
        common_name=request_data.common_name,
        csr_pem_data=request_data.csr_pem,
        user_id=user.id,
        owner_first_name=user.first_name,
        owner_last_name=user.last_name,
        owner_email=user.email,
    )
    database.add(new_request)
    database.flush()
    audit.record(
        database,
        user,
        "CSR_SUBMITTED",
        resource_type="request",
        resource_id=new_request.id,
        target_label=new_request.common_name,
        summary=f"{audit.format_actor(user)} przesłał żądanie CSR dla {new_request.common_name}",
        metadata={"common_name": new_request.common_name, "owner_email": user.email},
    )
    database.commit()
    database.refresh(new_request)

    return {
        "message": "Żądanie certyfikatu zostało zapisane i oczekuje na zatwierdzenie.",
        "status": "PENDING",
        "request_id": new_request.id,
    }


@app.get("/api/requests")
def get_requests(
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = database.query(db.Request).order_by(db.Request.id.desc())

    if user.role != "admin":
        query = query.filter(db.Request.user_id == user.id)

    requests = query.all()

    return [
        {
            "id": r.id,
            "common_name": r.common_name,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user_id": r.user_id,
            "owner_first_name": r.owner_first_name,
            "owner_last_name": r.owner_last_name,
            "owner_email": r.owner_email,
        }
        for r in requests
    ]


@app.get("/api/certificates")
def get_certificates(
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = database.query(db.Certificate).order_by(db.Certificate.id.desc())

    if user.role != "admin":
        query = query.filter(
            (db.Certificate.user_id == user.id) | (db.Certificate.type == "ROOT")
        )

    certs = query.all()

    return [certificate_to_dict(c) for c in certs]


@app.get("/api/certificates/{certificate_id}/private-key")
def download_certificate_private_key(
    certificate_id: int,
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu")
    if cert.type == "ROOT":
        raise HTTPException(status_code=400, detail="Klucz Root CA nie jest dostępny do pobrania")
    if user.role != "admin" and cert.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do tego certyfikatu")

    if not cert.user_id:
        raise HTTPException(status_code=404, detail="Brak klucza prywatnego dla tego certyfikatu")

    key_path = get_user_cert_key_path(cert.user_id, cert.id)
    if not os.path.exists(key_path):
        raise HTTPException(status_code=404, detail="Klucz prywatny nie jest przechowywany na serwerze dla tego certyfikatu")

    with open(key_path, "r", encoding="utf-8") as f:
        key_pem = f.read()

    safe_name = cert.common_name.replace(" ", "_").replace("/", "_")
    audit.record(
        database,
        user,
        "PRIVATE_KEY_DOWNLOADED",
        resource_type="certificate",
        resource_id=cert.id,
        target_label=cert.common_name,
        summary=f"{audit.format_actor(user)} pobrał klucz prywatny certyfikatu {cert.common_name}",
        metadata={
            "serial_number": cert.serial_number,
            "owner_email": cert.owner_email,
            "certificate_type": cert.type,
        },
    )
    database.commit()

    return Response(
        content=key_pem.encode("utf-8"),
        media_type="application/x-pem-file",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.key"'},
    )


@app.post("/api/certificates/issue")
def issue_certificate(
    payload: IssueCertificateModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    request_id = payload.request_id

    cert_request = database.query(db.Request).filter(db.Request.id == request_id).first()
    if not cert_request:
        raise HTTPException(status_code=404, detail="Nie znaleziono takiego wniosku")
    if cert_request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Ten wniosek został już rozpatrzony")

    root_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if not root_ca:
        raise HTTPException(status_code=500, detail="Brak Root CA w bazie. Najpierw zainicjuj urząd.")

    try:
        with open("/app/certs/root_ca.key", "rb") as f:
            root_key_pem = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Nie znaleziono klucza prywatnego Root CA na dysku")

    try:
        cert_obj, cert_pem_output = cert_manager.generate_certificate_from_csr(
            csr_pem=cert_request.csr_pem_data,
            ca_cert_pem=root_ca.pem_data.encode("utf-8"),
            ca_key_pem=root_key_pem,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Nieprawidłowy CSR: {str(e)}")

    db_cert = db.Certificate(
        serial_number=str(cert_obj.serial_number),
        common_name=cert_request.common_name,
        organization=None,
        type="CLIENT",
        status="VALID",
        not_before=cert_obj.not_valid_before_utc.replace(tzinfo=None),
        not_after=cert_obj.not_valid_after_utc.replace(tzinfo=None),
        pem_data=cert_pem_output,
        user_id=cert_request.user_id,
        owner_first_name=cert_request.owner_first_name,
        owner_last_name=cert_request.owner_last_name,
        owner_email=cert_request.owner_email,
    )
    database.add(db_cert)

    cert_request.status = "APPROVED"
    database.flush()
    audit.record(
        database,
        admin,
        "CSR_APPROVED",
        resource_type="certificate",
        resource_id=db_cert.id,
        target_label=db_cert.common_name,
        summary=f"{audit.format_actor(admin)} zatwierdził CSR i wystawił certyfikat {db_cert.common_name} dla {cert_request.owner_email}",
        metadata={
            "request_id": cert_request.id,
            "serial_number": db_cert.serial_number,
            "owner_email": cert_request.owner_email,
        },
    )
    database.commit()

    return {
        "message": f"Wniosek ID {request_id} zatwierdzony. Certyfikat wygenerowany pomyślnie!",
        "serial_number": str(cert_obj.serial_number),
    }


@app.post("/api/certs/approve/{request_id}")
def approve_certificate_request(
    request_id: int,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    return issue_certificate(IssueCertificateModel(request_id=request_id), database, admin)


@app.post("/api/certificates/issue-for-user")
def issue_certificate_for_user(
    payload: IssueForUserModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    user = database.query(db.User).filter(db.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Nie znaleziono użytkownika")

    root_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if not root_ca:
        raise HTTPException(status_code=500, detail="Brak Root CA w bazie. Najpierw zainicjuj urząd.")

    try:
        with open("/app/certs/root_ca.key", "rb") as f:
            root_key_pem = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Nie znaleziono klucza prywatnego Root CA na dysku")

    if payload.validity_days < 1 or payload.validity_days > 3650:
        raise HTTPException(status_code=400, detail="validity_days musi być w zakresie 1-3650")

    cert_type = payload.type.upper()
    if cert_type not in {"SERVER", "CLIENT", "INTERMEDIATE"}:
        raise HTTPException(status_code=400, detail="Nieprawidłowy typ certyfikatu")

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    subject_attrs = [
        x509.NameAttribute(NameOID.COMMON_NAME, payload.common_name),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, payload.organization),
    ]
    if payload.country:
        subject_attrs.append(x509.NameAttribute(NameOID.COUNTRY_NAME, payload.country))
    if payload.state:
        subject_attrs.append(x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, payload.state))
    if payload.locality:
        subject_attrs.append(x509.NameAttribute(NameOID.LOCALITY_NAME, payload.locality))

    csr = (
        x509.CertificateSigningRequestBuilder()
        .subject_name(x509.Name(subject_attrs))
        .sign(private_key, hashes.SHA256())
    )

    try:
        cert_obj, cert_pem_output = cert_manager.generate_certificate_from_csr(
            csr_pem=csr.public_bytes(serialization.Encoding.PEM).decode("utf-8"),
            ca_cert_pem=root_ca.pem_data.encode("utf-8"),
            ca_key_pem=root_key_pem,
            validity_days=payload.validity_days,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Błąd generowania certyfikatu: {str(e)}")

    db_cert = db.Certificate(
        serial_number=str(cert_obj.serial_number),
        common_name=payload.common_name,
        organization=payload.organization,
        type=cert_type,
        status="VALID",
        not_before=cert_obj.not_valid_before_utc.replace(tzinfo=None),
        not_after=cert_obj.not_valid_after_utc.replace(tzinfo=None),
        pem_data=cert_pem_output,
        user_id=user.id,
        owner_first_name=user.first_name,
        owner_last_name=user.last_name,
        owner_email=user.email,
    )
    database.add(db_cert)
    database.flush()
    audit.record(
        database,
        admin,
        "CERT_ISSUED_FOR_USER",
        resource_type="certificate",
        resource_id=db_cert.id,
        target_label=db_cert.common_name,
        summary=f"{audit.format_actor(admin)} wystawił certyfikat {db_cert.common_name} ({db_cert.type}) dla {user.email}",
        metadata={
            "serial_number": db_cert.serial_number,
            "certificate_type": db_cert.type,
            "owner_email": user.email,
            "validity_days": payload.validity_days,
        },
    )
    database.commit()
    database.refresh(db_cert)

    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    key_path = f"/app/certs/user_{user.id}_cert_{db_cert.id}.key"
    with open(key_path, "w") as f:
        f.write(key_pem)

    return {
        "message": f"Certyfikat dla użytkownika ID {payload.user_id} został wystawiony pomyślnie.",
        "certificate": {
            "id": db_cert.id,
            "serial_number": db_cert.serial_number,
            "common_name": db_cert.common_name,
            "organization": db_cert.organization,
            "type": db_cert.type,
            "status": db_cert.status,
            "pem_data": db_cert.pem_data,
        },
    }


@app.post("/api/requests/{request_id}/reject")
def reject_certificate_request(
    request_id: int,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    cert_request = database.query(db.Request).filter(db.Request.id == request_id).first()
    if not cert_request:
        raise HTTPException(status_code=404, detail="Nie znaleziono takiego wniosku")
    if cert_request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Ten wniosek został już rozpatrzony")

    cert_request.status = "REJECTED"
    audit.record(
        database,
        admin,
        "CSR_REJECTED",
        resource_type="request",
        resource_id=cert_request.id,
        target_label=cert_request.common_name,
        summary=f"{audit.format_actor(admin)} odrzucił żądanie CSR {cert_request.common_name} (wnioskodawca: {cert_request.owner_email})",
        metadata={"owner_email": cert_request.owner_email},
    )
    database.commit()

    return {"message": f"Wniosek ID {request_id} został odrzucony"}


@app.post("/api/certificates/{certificate_id}/revoke")
def revoke_certificate(
    certificate_id: int,
    payload: RevokeCertificateModel,
    database: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu")
    if cert.type == "ROOT":
        raise HTTPException(status_code=400, detail="Nie można unieważnić certyfikatu Root CA")
    if cert.status == "REVOKED":
        raise HTTPException(status_code=400, detail="Certyfikat został już unieważniony")

    cert.status = "REVOKED"
    cert.revoked_at = datetime.utcnow()
    cert.revocation_reason = payload.reason or "unspecified"
    audit.record(
        database,
        admin,
        "CERT_REVOKED",
        resource_type="certificate",
        resource_id=cert.id,
        target_label=cert.common_name,
        summary=f"{audit.format_actor(admin)} unieważnił certyfikat {cert.common_name} (powód: {cert.revocation_reason})",
        metadata={
            "serial_number": cert.serial_number,
            "revocation_reason": cert.revocation_reason,
            "owner_email": cert.owner_email,
        },
    )
    database.commit()

    return {
        "message": f"Certyfikat ID {certificate_id} został unieważniony",
        "certificate_id": certificate_id,
        "revoked_at": cert.revoked_at.isoformat(),
        "revocation_reason": cert.revocation_reason,
    }


@app.get("/api/documents")
def get_signed_documents(
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    query = database.query(db.SignedDocument).order_by(db.SignedDocument.id.desc())

    if user.role != "admin":
        query = query.filter(db.SignedDocument.user_id == user.id)

    documents = query.all()

    return [
        {
            "id": d.id,
            "user_id": d.user_id,
            "certificate_id": d.certificate_id,
            "file_name": d.file_name,
            "mime_type": d.mime_type,
            "document_hash": d.document_hash,
            "signed_at": (d.signed_at or d.created_at).isoformat() if (d.signed_at or d.created_at) else None,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in documents
    ]


@app.post("/api/documents/sign")
async def sign_document(
    certificate_id: int = Form(...),
    file: UploadFile = File(...),
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu")
    if cert.type == "ROOT":
        raise HTTPException(status_code=400, detail="Nie można podpisywać dokumentów certyfikatem Root CA")
    if cert.status != "VALID":
        raise HTTPException(status_code=400, detail="Certyfikat nie jest ważny")
    if user.role != "admin" and cert.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do tego certyfikatu")

    key_path = get_user_cert_key_path(cert.user_id, cert.id)
    if not os.path.exists(key_path):
        raise HTTPException(
            status_code=400,
            detail="Brak klucza prywatnego na serwerze. Podpisywanie jest dostępne tylko dla certyfikatów wystawionych przez administratora.",
        )

    data = await file.read()
    document_hash = hashlib.sha256(data).hexdigest()

    with open(key_path, "rb") as f:
        private_key = serialization.load_pem_private_key(f.read(), password=None)

    signature = private_key.sign(data, padding.PKCS1v15(), hashes.SHA256())
    signed_at_dt = datetime.utcnow()
    signed_at_iso = format_signed_at(signed_at_dt)
    timestamp_signature = create_timestamp_signature(private_key, document_hash, signed_at_iso)

    signed_doc = db.SignedDocument(
        user_id=user.id,
        certificate_id=cert.id,
        file_name=file.filename or "document",
        mime_type=file.content_type,
        document_hash=document_hash,
        signature_pem=signature.hex(),
        signed_at=signed_at_dt,
        timestamp_signature=timestamp_signature,
    )
    database.add(signed_doc)
    database.flush()
    audit.record(
        database,
        user,
        "DOCUMENT_SIGNED",
        resource_type="document",
        resource_id=signed_doc.id,
        target_label=signed_doc.file_name,
        summary=f"{audit.format_actor(user)} podpisał dokument {signed_doc.file_name} certyfikatem {cert.common_name}",
        metadata={
            "certificate_id": cert.id,
            "certificate_common_name": cert.common_name,
            "document_hash": signed_doc.document_hash,
            "signed_at": signed_at_iso,
        },
    )
    database.commit()
    database.refresh(signed_doc)

    package = build_signature_package(signed_doc, cert)

    return {
        "message": "Dokument został podpisany pomyślnie",
        "file_name": signed_doc.file_name,
        "signed_document_id": signed_doc.id,
        "document_hash": signed_doc.document_hash,
        "signature_package": package,
        "signature_package_filename": signature_package_filename(signed_doc.file_name),
    }


@app.get("/api/documents/{document_id}/package")
def download_signature_package(
    document_id: int,
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    signed_doc = database.query(db.SignedDocument).filter(db.SignedDocument.id == document_id).first()
    if not signed_doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono podpisanego dokumentu")
    if user.role != "admin" and signed_doc.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do tego dokumentu")

    cert = database.query(db.Certificate).filter(db.Certificate.id == signed_doc.certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu użytego do podpisu")

    package = build_signature_package(signed_doc, cert)
    filename = signature_package_filename(signed_doc.file_name)
    content = json.dumps(package, indent=2, ensure_ascii=False)

    return Response(
        content=content.encode("utf-8"),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/documents/verify")
async def verify_document_signature(
    signed_document_id: int = Form(...),
    file: UploadFile = File(...),
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    signed_doc = database.query(db.SignedDocument).filter(db.SignedDocument.id == signed_document_id).first()
    if not signed_doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono podpisanego dokumentu")
    if user.role != "admin" and signed_doc.user_id != user.id:
        raise HTTPException(status_code=403, detail="Brak dostępu do tego dokumentu")

    cert = database.query(db.Certificate).filter(db.Certificate.id == signed_doc.certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu użytego do podpisu")

    data = await file.read()
    signed_at_dt = signed_doc.signed_at or signed_doc.created_at
    signed_at_iso = format_signed_at(signed_at_dt) if signed_at_dt else None

    return run_signature_verification(
        file_data=data,
        document_hash=signed_doc.document_hash,
        signature_hex=signed_doc.signature_pem,
        cert_pem=cert.pem_data,
        cert_record=cert,
        file_name=signed_doc.file_name,
        signed_document_id=signed_doc.id,
        signed_at=signed_at_iso,
        timestamp_signature_hex=signed_doc.timestamp_signature,
        require_timestamp=bool(signed_doc.timestamp_signature),
    )


@app.post("/api/documents/verify-package")
async def verify_signature_package(
    file: UploadFile = File(...),
    signature_file: UploadFile = File(...),
    database: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    package = parse_signature_package(await signature_file.read())
    data = await file.read()

    cert_record = (
        database.query(db.Certificate)
        .filter(db.Certificate.serial_number == package["certificate_serial_number"])
        .first()
    )

    return run_signature_verification(
        file_data=data,
        document_hash=package["document_hash_sha256"],
        signature_hex=package["signature_hex"],
        cert_pem=package["certificate_pem"],
        cert_record=cert_record,
        file_name=package["file_name"],
        signed_document_id=package.get("signed_document_id"),
        signed_at=package.get("signed_at"),
        timestamp_signature_hex=package.get("timestamp_signature_hex"),
        require_timestamp=package.get("format") == SIGNATURE_PACKAGE_FORMAT,
    )