# Studenckie PKI

Edukacyjny system zarządzania infrastrukturą klucza publicznego (PKI) z panelem webowym. Projekt uruchamia się lokalnie przez Docker Compose i obejmuje pełny przepływ: Root CA, certyfikaty użytkowników, podpisywanie dokumentów, weryfikację podpisów, CRL oraz dziennik zdarzeń.

**Stack:** Python (FastAPI) + PostgreSQL + Next.js + Docker

**Zespół projektowy:** Jakub Zalewski, Hubert Rachwalik, Jakub Zaborski, Mateusz Rutkowski, Michał Dęby, Robert Graff, Wojciech Bojko

Główna logika kryptograficzna i biznesowa jest zaimplementowana w **Pythonie** (`cryptography`, SQLAlchemy). Frontend pełni rolę panelu użytkownika i administratora.

## Funkcjonalności

### Uwierzytelnianie i role

- rejestracja i logowanie (JWT Bearer),
- pierwszy zarejestrowany użytkownik otrzymuje rolę **admin**,
- role: `admin` (pełny panel) i `user` (własne certyfikaty, podpisy).

### Root CA i certyfikaty

- inicjalizacja Root CA (RSA-2048, certyfikat samopodpisany),
- składanie żądań CSR i ich zatwierdzanie / odrzucanie,
- wystawianie certyfikatu na podstawie CSR,
- wystawianie certyfikatu dla użytkownika przez admina (generacja klucza na serwerze),
- przegląd certyfikatów, pobieranie PEM i klucza prywatnego,
- unieważnianie certyfikatów z podaniem powodu.

### Podpisy dokumentów

- podpisywanie plików (RSA-SHA256, format `studenckie-pki-v2`),
- pobieranie pliku podpisu `.pki.sig.json` (podpis odłączony + znacznik czasu),
- weryfikacja podpisu przez upload oryginału i pliku podpisu,
- historia podpisanych dokumentów w bazie.

### Administracja

- zarządzanie użytkownikami (CRUD, reset hasła, zmiana roli),
- pobieranie **CRL** (Certificate Revocation List) w formacie PEM,
- **dziennik zdarzeń** (audit log) — kto, co i kiedy wykonał w systemie.

## Architektura

```
┌─────────────┐     REST + JWT      ┌──────────────┐     SQL      ┌────────────┐
│  Frontend   │ ◄─────────────────► │   Backend    │ ◄──────────► │ PostgreSQL │
│  Next.js    │   localhost:8000    │   FastAPI    │              │            │
│  :3000      │                     │   Python     │              │            │
└─────────────┘                     └──────┬───────┘              └────────────┘
                                           │
                                    /app/certs (wolumen Docker)
```

| Usługa | Technologia | Port | Rola |
| --- | --- | --- | --- |
| `db` | PostgreSQL 15 | `5432` | Użytkownicy, certyfikaty, żądania, podpisy, audit |
| `backend` | FastAPI + SQLAlchemy + cryptography | `8000` | API, kryptografia, logika PKI |
| `frontend` | Next.js | `3000` | Panel webowy |

### Moduły backendu (`backend/app/`)

| Plik | Odpowiedzialność |
| --- | --- |
| `main.py` | REST API, auth JWT, orchestracja |
| `ca_manager.py` | Generowanie Root CA |
| `cert_manager.py` | Podpisywanie CSR, wystawianie certyfikatów |
| `crl_manager.py` | Generowanie CRL (PEM) |
| `audit.py` | Zapis i odczyt dziennika zdarzeń |
| `db.py` | Modele SQLAlchemy |

### Komponenty frontendu (`frontend/src/app/components/`)

`Dashboard`, `CAInit`, `Certificates`, `IssueCert`, `Requests`, `SignDocuments`, `VerifySignature`, `Users`, `AuditLog`

## Endpointy API

### Auth

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Rejestracja (pierwszy user = admin) |
| `POST` | `/api/auth/login` | Logowanie, zwraca JWT |
| `GET` | `/api/auth/me` | Dane zalogowanego użytkownika |

### Użytkownicy (admin)

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/api/users` | Lista użytkowników |
| `POST` | `/api/users` | Utworzenie użytkownika |
| `PATCH` | `/api/users/{user_id}` | Edycja (rola, dane) |
| `POST` | `/api/users/{user_id}/reset-password` | Reset hasła |
| `DELETE` | `/api/users/{user_id}` | Usunięcie użytkownika |

### PKI

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `POST` | `/api/ca/init` | Inicjalizacja Root CA |
| `POST` | `/api/certs/request` | Złożenie żądania CSR |
| `GET` | `/api/requests` | Lista żądań CSR |
| `POST` | `/api/requests/{request_id}/reject` | Odrzucenie żądania |
| `GET` | `/api/certificates` | Lista certyfikatów |
| `GET` | `/api/certificates/{certificate_id}/private-key` | Pobranie klucza PEM |
| `POST` | `/api/certificates/issue` | Wystawienie certyfikatu z requestu |
| `POST` | `/api/certs/approve/{request_id}` | Zatwierdzenie CSR i wystawienie |
| `POST` | `/api/certificates/issue-for-user` | Wystawienie certyfikatu dla użytkownika |
| `POST` | `/api/certificates/{certificate_id}/revoke` | Unieważnienie certyfikatu |
| `GET` | `/api/crl` | Pobranie CRL (PEM) |

### Dokumenty i podpisy

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/api/documents` | Lista podpisanych dokumentów |
| `POST` | `/api/documents/sign` | Podpisanie pliku |
| `GET` | `/api/documents/{document_id}/package` | Pobranie pakietu podpisu |
| `POST` | `/api/documents/verify` | Weryfikacja (metadane z bazy) |
| `POST` | `/api/documents/verify-package` | Weryfikacja uploadem plików |

### Audyt

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `GET` | `/api/audit-logs` | Dziennik zdarzeń (admin) |

Interaktywna dokumentacja: http://localhost:8000/docs

## Struktura bazy danych

| Tabela | Zawartość |
| --- | --- |
| `users` | Konta, hasła (hash), role |
| `certificates` | Certyfikaty PEM, status, unieważnienie, właściciel |
| `requests` | Żądania CSR (`PENDING` / `APPROVED` / `REJECTED`) |
| `signed_documents` | Metadane podpisów dokumentów |
| `audit_logs` | Historia operacji w systemie |

Schemat początkowy: `db/init.sql`

## Uruchomienie

### Wymagania

- Docker
- Docker Compose

### Start

```bash
docker compose up --build
```

| Usługa | Adres |
| --- | --- |
| Panel webowy | http://localhost:3000 |
| API (Swagger) | http://localhost:8000/docs |

Zmienna środowiskowa frontendu:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### Restart po zmianach

```bash
docker compose down
docker compose up --build
```

## Scenariusz użytkowania

1. **Rejestracja** — pierwszy użytkownik zostaje administratorem.
2. **Root CA** — admin inicjalizuje urząd certyfikacji (jednorazowo).
3. **Użytkownicy** — admin tworzy konta lub użytkownicy rejestrują się sami.
4. **Certyfikat** — admin wystawia certyfikat dla użytkownika *lub* użytkownik składa CSR i czeka na zatwierdzenie.
5. **Podpis** — użytkownik wgrywa dokument, pobiera plik `.pki.sig.json`.
6. **Weryfikacja** — na dowolnym komputerze: upload oryginału + pliku podpisu.
7. **CRL** — admin pobiera listę unieważnionych certyfikatów.
8. **Audit** — admin przegląda dziennik wszystkich operacji.

## Format podpisu (`studenckie-pki-v2`)

Plik `.pki.sig.json` zawiera m.in.:

- hash SHA-256 dokumentu,
- podpis RSA-SHA256,
- podpis znacznika czasu (`signed_at`),
- certyfikat PEM podpisującego.

Oryginalny dokument nie jest modyfikowany — to podpis odłączony (detached signature).

## Dokumentacja i prezentacja

W repozytorium znajdują się materiały do obrony projektu:

| Plik | Opis |
| --- | --- |
| `docs/PREZENTACJA.md` | Skrypt do wygłoszenia (16 slajdów) |
| `scripts/generate_presentation.py` | Generator prezentacji **PPTX** ze slajdami i miejscami na zdjęcia |
| `scripts/generate_documentation.py` | Generator HTML + PDF ze strukturą i kodem wszystkich plików |

### Generowanie prezentacji PPTX

**Windows (dwuklik):**

```text
scripts\generate_presentation.bat
```

**Ręcznie:**

```bash
pip install -r scripts/requirements-docs.txt
python scripts/generate_presentation.py
```

Wynik: `docs/generated/studenckie-pki-prezentacja.pptx`

Otwórz plik w PowerPoint, kliknij szare pole po prawej stronie slajdu i wstaw zdjęcie / zrzut ekranu. Notatki do wygłoszenia są w zakładce **Notatki** pod każdym slajdem.

### Generowanie PDF z kodem źródłowym

**Windows (dwuklik):**

```text
scripts\generate_documentation.bat
```

**Ręcznie (krok po kroku):**

1. Otwórz terminal w katalogu projektu (`C:\uth\pki-system`).
2. Zainstaluj zależności (jednorazowo):

```bash
pip install -r scripts/requirements-docs.txt
```

3. Uruchom generator:

```bash
python scripts/generate_documentation.py
```

Wynik:

- `docs/generated/studenckie-pki-dokumentacja.html` — pełna dokumentacja (prezentacja + README + drzewo plików + kod każdego pliku)
- `docs/generated/studenckie-pki-dokumentacja.pdf` — wersja PDF (automatycznie, jeśli działa `fpdf2` lub przeglądarka Edge/Chrome)

**Jeśli PDF nie powstanie automatycznie:** otwórz plik `.html` w przeglądarce → **Ctrl+P** → wybierz „Zapisz jako PDF” → Zapisz.

**Wymagania:** Python 3.10+ (zainstalowany i dostępny jako `python` w PATH).

## Zaimplementowane funkcjonalności

| Funkcjonalność | Status |
| --- | --- |
| Docker Compose | ✅ |
| PostgreSQL | ✅ |
| Backend Python (FastAPI) | ✅ |
| Uwierzytelnianie JWT + role | ✅ |
| Zarządzanie użytkownikami | ✅ |
| Root CA | ✅ |
| CSR, wystawianie certyfikatów | ✅ |
| Unieważnianie certyfikatów | ✅ |
| CRL (PEM) | ✅ |
| Podpisywanie dokumentów | ✅ |
| Weryfikacja podpisów (upload) | ✅ |
| Dziennik zdarzeń (audit log) | ✅ |
| Pobieranie klucza prywatnego PEM | ✅ |
| Panel Next.js (desktop + mobile) | ✅ |

## Ograniczenia (świadome uproszczenia)

| Aspekt | Uwagi |
| --- | --- |
| Klucz Root CA | Przechowywany w pliku na wolumenie Docker (brak HSM) |
| Klucze użytkowników | Generowane na serwerze w trybie `issue-for-user` |
| OCSP | Nie zaimplementowano — tylko CRL |
| Intermediate CA | Brak wielopoziomowego łańcucha |
| TSA | Znacznik czasu podpisywany kluczem użytkownika (demo) |

Projekt ma charakter **edukacyjny** — demonstruje przepływ PKI, nie jest gotowy do produkcji.

## Możliwe rozszerzenia

- Intermediate CA i pełny łańcuch certyfikacji,
- OCSP responder,
- eksport PKCS#12,
- zewnętrzny TSA (RFC 3161),
- przechowywanie kluczy w HSM / Vault.
