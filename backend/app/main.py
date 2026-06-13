import os
from datetime import datetime
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from . import db, ca_manager, cert_manager

app = FastAPI(title='Proste PKI - API')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:3000'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

class CSRRequestModel(BaseModel):
    common_name: str
    csr_pem: str

class IssueCertificateModel(BaseModel):
    request_id: int

class RevokeCertificateModel(BaseModel):
    reason: str

class RequestOut(BaseModel):
    id: int
    common_name: str
    status: str
    created_at: Optional[str] = None

class CertificateOut(BaseModel):
    id: int
    serial_number: str
    common_name: Optional[str] = None
    organization: Optional[str] = None
    type: Optional[str] = None
    status: str
    not_before: Optional[str] = None
    not_after: Optional[str] = None
    pem_data: Optional[str] = None
    revoked_at: Optional[str] = None
    revocation_reason: Optional[str] = None

def get_db():
    database = db.SessionLocal()
    try:
        yield database
    finally:
        database.close()

def serialize_certificate(cert: db.Certificate):
    return {
        'id': cert.id,
        'serial_number': cert.serial_number,
        'common_name': cert.common_name,
        'organization': cert.organization,
        'type': cert.type,
        'status': cert.status,
        'not_before': cert.not_before.isoformat() if cert.not_before else None,
        'not_after': cert.not_after.isoformat() if cert.not_after else None,
        'pem_data': cert.pem_data,
        'revoked_at': cert.revoked_at.isoformat() if cert.revoked_at else None,
        'revocation_reason': cert.revocation_reason,
    }

os.makedirs('/app/certs', exist_ok=True)

@app.post('/api/ca/init')
def init_root_ca(database: Session = Depends(get_db)):
    existing_ca = database.query(db.Certificate).filter(db.Certificate.type == 'ROOT').first()
    if existing_ca:
        raise HTTPException(status_code=400, detail='Root CA zostało już zainicjowane!')

    cert, cert_pem, key_pem = ca_manager.generate_root_ca()

    db_cert = db.Certificate(
        serial_number=str(cert.serial_number),
        common_name='Studenckie Root CA',
        organization='Studenckie PKI',
        type='ROOT',
        status='VALID',
        not_before=cert.not_valid_before_utc.replace(tzinfo=None),
        not_after=cert.not_valid_after_utc.replace(tzinfo=None),
        pem_data=cert_pem,
    )
    database.add(db_cert)
    database.commit()

    with open('/app/certs/root_ca.key', 'w') as f:
        f.write(key_pem)

    return {
        'message': 'Root CA utworzone pomyślnie!',
        'serial_number': str(cert.serial_number),
    }

@app.post('/api/certs/request')
def submit_certificate_request(request_data: CSRRequestModel, database: Session = Depends(get_db)):
    new_request = db.Request(
        common_name=request_data.common_name,
        csr_pem_data=request_data.csr_pem,
        status='PENDING',
    )
    database.add(new_request)
    database.commit()
    database.refresh(new_request)

    return {
        'message': 'Żądanie certyfikatu zostało pomyślnie zapisane i oczekuje na zatwierdzenie.',
        'status': 'PENDING',
        'request_id': new_request.id,
    }

@app.get('/api/requests')
def get_requests(database: Session = Depends(get_db)):
    requests = database.query(db.Request).order_by(db.Request.id.desc()).all()
    return [
        {
            'id': r.id,
            'common_name': r.common_name,
            'status': r.status,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        }
        for r in requests
    ]

@app.post('/api/requests/{request_id}/reject')
def reject_request(request_id: int, database: Session = Depends(get_db)):
    cert_request = database.query(db.Request).filter(db.Request.id == request_id).first()
    if not cert_request:
        raise HTTPException(status_code=404, detail='Nie znaleziono takiego wniosku')
    if cert_request.status != 'PENDING':
        raise HTTPException(status_code=400, detail='Tylko oczekujące wnioski można odrzucić')

    cert_request.status = 'REJECTED'
    database.commit()

    return {
        'message': f'Wniosek ID {request_id} został odrzucony.',
        'status': cert_request.status,
    }

@app.get('/api/certificates')
def get_certificates(database: Session = Depends(get_db)):
    certs = database.query(db.Certificate).order_by(db.Certificate.id.desc()).all()
    return [serialize_certificate(c) for c in certs]

@app.get('/api/certificates/{certificate_id}')
def get_certificate_details(certificate_id: int, database: Session = Depends(get_db)):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail='Nie znaleziono certyfikatu')
    return serialize_certificate(cert)

@app.get('/api/certificates/{certificate_id}/pem', response_class=PlainTextResponse)
def get_certificate_pem(certificate_id: int, database: Session = Depends(get_db)):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail='Nie znaleziono certyfikatu')
    return cert.pem_data or ''

@app.post('/api/certificates/issue')
def issue_certificate(payload: IssueCertificateModel, database: Session = Depends(get_db)):
    request_id = payload.request_id

    cert_request = database.query(db.Request).filter(db.Request.id == request_id).first()
    if not cert_request:
        raise HTTPException(status_code=404, detail='Nie znaleziono takiego wniosku')
    if cert_request.status != 'PENDING':
        raise HTTPException(status_code=400, detail='Ten wniosek został już rozpatrzony')

    root_ca = database.query(db.Certificate).filter(db.Certificate.type == 'ROOT').first()
    if not root_ca:
        raise HTTPException(status_code=500, detail='Brak Root CA w bazie. Najpierw zainicjuj urząd.')

    try:
        with open('/app/certs/root_ca.key', 'rb') as f:
            root_key_pem = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail='Nie znaleziono klucza prywatnego Root CA na dysku')

    try:
        cert_obj, cert_pem_output = cert_manager.generate_certificate_from_csr(
            csr_pem=cert_request.csr_pem_data,
            ca_cert_pem=root_ca.pem_data.encode('utf-8'),
            ca_key_pem=root_key_pem,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f'Nieprawidłowy CSR: {str(e)}')

    db_cert = db.Certificate(
        serial_number=str(cert_obj.serial_number),
        common_name=cert_request.common_name,
        organization='Studenckie PKI',
        type='SERVER',
        status='VALID',
        not_before=cert_obj.not_valid_before_utc.replace(tzinfo=None),
        not_after=cert_obj.not_valid_after_utc.replace(tzinfo=None),
        pem_data=cert_pem_output,
    )
    database.add(db_cert)

    cert_request.status = 'APPROVED'
    database.commit()

    return {
        'message': f'Wniosek ID {request_id} zatwierdzony. Certyfikat wygenerowany pomyślnie!',
        'serial_number': str(cert_obj.serial_number),
    }

@app.post('/api/certs/approve/{request_id}')
def approve_certificate_request(request_id: int, database: Session = Depends(get_db)):
    return issue_certificate(IssueCertificateModel(request_id=request_id), database)

@app.post('/api/certificates/{certificate_id}/revoke')
def revoke_certificate(certificate_id: int, payload: RevokeCertificateModel, database: Session = Depends(get_db)):
    cert = database.query(db.Certificate).filter(db.Certificate.id == certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail='Nie znaleziono certyfikatu')
    if cert.type == 'ROOT':
        raise HTTPException(status_code=400, detail='Nie można unieważnić Root CA z poziomu panelu')
    if cert.status == 'REVOKED':
        raise HTTPException(status_code=400, detail='Certyfikat został już unieważniony')

    reason = payload.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail='Powód unieważnienia jest wymagany')

    cert.status = 'REVOKED'
    cert.revoked_at = datetime.utcnow()
    cert.revocation_reason = reason
    database.commit()
    database.refresh(cert)

    return {
        'message': f'Certyfikat {cert.common_name or cert.serial_number} został unieważniony.',
        'revoked_at': cert.revoked_at.isoformat() if cert.revoked_at else None,
        'revocation_reason': cert.revocation_reason,
    }
