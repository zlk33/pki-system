import os
from typing import Optional
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from . import db, ca_manager, cert_manager

app = FastAPI(title="Proste PKI - API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class CSRRequestModel(BaseModel):
    common_name: str
    csr_pem: str

class IssueCertificateModel(BaseModel):
    request_id: int

class RequestStatusModel(BaseModel):
    status: str

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

def get_db():
    database = db.SessionLocal()
    try:
        yield database
    finally:
        database.close()

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

@app.get('/api/certificates')
def get_certificates(database: Session = Depends(get_db)):
    certs = database.query(db.Certificate).order_by(db.Certificate.id.desc()).all()
    return [
        {
            'id': c.id,
            'serial_number': c.serial_number,
            'common_name': c.common_name,
            'organization': c.organization,
            'type': c.type,
            'status': c.status,
            'not_before': c.not_before.isoformat() if c.not_before else None,
            'not_after': c.not_after.isoformat() if c.not_after else None,
        }
        for c in certs
    ]

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
