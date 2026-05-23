import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from . import db, ca_manager

app = FastAPI(title="Proste PKI - API")

# Funkcja wstrzykująca połączenie z bazą do endpointów
def get_db():
    database = db.SessionLocal()
    try:
        yield database
    finally:
        database.close()

# Upewniamy się, że folder certs istnieje
os.makedirs("/app/certs", exist_ok=True)

@app.post("/api/ca/init")
def init_root_ca(database: Session = Depends(get_db)):
    # Sprawdzamy czy Root CA już widnieje w bazie
    existing_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if existing_ca:
        raise HTTPException(status_code=400, detail="Root CA zostało już zainicjowane!")

    # Generujemy Root CA
    cert, cert_pem, key_pem = ca_manager.generate_root_ca()

    # Zapisujemy certyfikat w relacyjnej bazie
    db_cert = db.Certificate(
        serial_number=str(cert.serial_number),
        common_name="Studenckie Root CA",
        organization="Studenckie PKI",
        type="ROOT",
        not_before=cert.not_valid_before,
        not_after=cert.not_valid_after,
        pem_data=cert_pem
    )
    database.add(db_cert)
    database.commit()

    # KRYTYCZNE: Klucz prywatny Root CA zapisujemy na dysku (wolumen Dockera) 
    # Nie zapisujemy go do bazy danych ze względów bezpieczeństwa
    with open("/app/certs/root_ca.key", "w") as f:
        f.write(key_pem)

    return {
        "message": "Root CA utworzone pomyślnie!",
        "serial_number": str(cert.serial_number)
    }