# DODAJ DO backend/app/main.py
from cryptography import x509
from cryptography.exceptions import InvalidSignature


@app.post("/api/documents/verify")
async def verify_document_signature(
    signed_document_id: int,
    file: UploadFile = File(...),
    database: Session = Depends(get_db),
    current_user: db.User = Depends(get_current_user),
):
    signed_doc = database.query(db.SignedDocument).filter(db.SignedDocument.id == signed_document_id).first()
    if not signed_doc:
        raise HTTPException(status_code=404, detail="Nie znaleziono podpisanego dokumentu")

    cert = database.query(db.Certificate).filter(db.Certificate.id == signed_doc.certificate_id).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Nie znaleziono certyfikatu użytego do podpisu")

    data = await file.read()
    calculated_hash = hashlib.sha256(data).hexdigest()
    hash_matches = calculated_hash == signed_doc.document_hash

    cert_obj = x509.load_pem_x509_certificate(cert.pem_data.encode("utf-8"))
    public_key = cert_obj.public_key()
    signature_bytes = bytes.fromhex(signed_doc.signature_pem)

    cryptographic_valid = False
    verify_error = None
    try:
        public_key.verify(signature_bytes, data, padding.PKCS1v15(), hashes.SHA256())
        cryptographic_valid = True
    except InvalidSignature:
        verify_error = "Podpis kryptograficzny jest nieprawidłowy"
    except Exception as e:
        verify_error = f"Błąd weryfikacji podpisu: {str(e)}"

    cert_time_valid = True
    now = datetime.utcnow()
    if cert.not_before and now < cert.not_before:
        cert_time_valid = False
    if cert.not_after and now > cert.not_after:
        cert_time_valid = False

    cert_status_valid = cert.status == "VALID"
    overall_valid = hash_matches and cryptographic_valid and cert_time_valid and cert_status_valid

    return {
        "valid": overall_valid,
        "hash_matches": hash_matches,
        "signature_valid": cryptographic_valid,
        "certificate_status_valid": cert_status_valid,
        "certificate_time_valid": cert_time_valid,
        "signed_document_id": signed_doc.id,
        "file_name": signed_doc.file_name,
        "certificate": {
            "id": cert.id,
            "common_name": cert.common_name,
            "serial_number": cert.serial_number,
            "owner_email": cert.owner_email,
            "status": cert.status,
            "not_before": cert.not_before.isoformat() if cert.not_before else None,
            "not_after": cert.not_after.isoformat() if cert.not_after else None,
        },
        "message": "Podpis poprawny" if overall_valid else (verify_error or "Weryfikacja nie powiodła się"),
    }
