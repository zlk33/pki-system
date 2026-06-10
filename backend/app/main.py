import os
from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from . import db, ca_manager, cert_manager
from pydantic import BaseModel

app = FastAPI(title="Proste PKI - API")

# Kształt danych jakich oczekujemy od frontendu.
class CSRRequestModel(BaseModel):
    common_name: str
    csr_pem: str

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

@app.post("/api/certs/request")
def submit_certificate_request(request_data: CSRRequestModel, database: Session = Depends(get_db)):
    # Tworzymy nowy wpis w bazie danych używając modelu dodanego w db.py
    new_request = db.Request(
        common_name=request_data.common_name,
        csr_pem_data=request_data.csr_pem
    )

    # Dodajemy do sesji i zapisujemy
    database.add(new_request)
    database.commit()

    return {
        "message": "Żądanie certyfikatu zostało pomyślnie zapisane i oczekuje na zatwierdzenie.",
        "status": "PENDING"
    }

@app.post("/api/certs/approve/{request_id}")
def approve_certificate_request(request_id: int, database: Session = Depends(get_db)):
    # 1. Pobieramy wniosek o podanym ID z bazy danych
    cert_request = database.query(db.Request).filter(db.Request.id == request_id).first()
    if not cert_request:
        raise HTTPException(status_code=404, detail="Nie znaleziono takiego wniosku")
    if cert_request.status != "PENDING":
        raise HTTPException(status_code=400, detail="Ten wniosek został już rozpatrzony")

    # 2. Pobieramy nasz główny certyfikat (Root CA) z bazy
    root_ca = database.query(db.Certificate).filter(db.Certificate.type == "ROOT").first()
    if not root_ca:
        raise HTTPException(status_code=500, detail="Błąd: Brak Root CA w bazie. Najpierw zainicjuj urząd!")

    # 3. Odczytujemy klucz prywatny Root CA z dysku
    try:
        with open("/app/certs/root_ca.key", "rb") as f:
            root_key_pem = f.read()
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Błąd: Nie znaleziono klucza prywatnego Root CA na dysku")

    # 4. Używamy narzędzia do wygenerowania certyfikatu
    try:
           cert_obj, cert_pem_output = cert_manager.generate_certificate_from_csr(
               csr_pem=cert_request.csr_pem_data,
               ca_cert_pem=root_ca.pem_data.encode('utf-8'),
               ca_key_pem=root_key_pem
           )
    except Exception as e:
           # Jeśli biblioteka odrzuci CSR, nie wywalamy serwera, tylko zwracamy błąd 400
           raise HTTPException(status_code=400, detail=f"Odrzucono: Wniosek CSR jest nieprawidłowy kryptograficznie. Szegóły: {str(e)}")

    # 5. Zapisujemy gotowy, podpisany certyfikat w bazie danych
    db_cert = db.Certificate(
        serial_number=str(cert_obj.serial_number),
        common_name=cert_request.common_name,
        type="SERVER", # Na razie domyślnie wydajemy certyfikaty serwerowe
        not_before=cert_obj.not_valid_before,
        not_after=cert_obj.not_valid_after,
        pem_data=cert_pem_output
    )
    database.add(db_cert)

    # 6. Zmieniamy status wniosku na zatwierdzony
    cert_request.status = "APPROVED"

    # Zapisujemy wszystko
    database.commit()

    return {
        "message": f"Wniosek ID {request_id} zatwierdzony. Certyfikat wygenerowany pomyślnie!",
        "serial_number": str(cert_obj.serial_number)
    }