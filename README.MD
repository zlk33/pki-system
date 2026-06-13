# Studenckie PKI

Studenckie PKI to edukacyjny system zarządzania infrastrukturą klucza publicznego, zbudowany jako aplikacja webowa uruchamiana przez Docker Compose. Warstwa interfejsu użytkownika została przygotowana w Next.js, jednak zasadnicza logika projektu została zaimplementowana po stronie backendu w Pythonie z użyciem FastAPI, SQLAlchemy oraz biblioteki `cryptography`, ponieważ to backend realizuje generowanie kluczy, obsługę CSR, podpisywanie certyfikatów, walidację przepływu oraz komunikację z bazą danych.

Projekt spełnia założenie przedmiotu, w którym główny nacisk ma być położony na wykorzystanie języka Python. Frontend pełni przede wszystkim rolę panelu administracyjnego i warstwy prezentacji, natomiast najważniejsze operacje PKI, takie jak inicjalizacja Root CA, podpisywanie certyfikatów, generowanie certyfikatów z formularza, unieważnianie certyfikatów oraz obsługa statusów żądań, są wykonywane w backendzie napisanym w Pythonie.

## Zakres projektu

Aplikacja obsługuje podstawowy, ale już rozszerzony przepływ pracy dla lokalnego, edukacyjnego PKI:

- inicjalizację Root CA przez panel administracyjny,
- zapis żądań CSR do bazy danych,
- przegląd i zarządzanie żądaniami certyfikatów,
- zatwierdzanie żądań i generowanie certyfikatów podpisanych przez Root CA,
- odrzucanie żądań CSR,
- generowanie certyfikatu bez ręcznego CSR, bezpośrednio z formularza w panelu,
- przegląd listy wystawionych certyfikatów,
- podgląd szczegółów pojedynczego certyfikatu,
- pobieranie certyfikatu PEM z poziomu interfejsu,
- unieważnianie certyfikatów wraz z zapisaniem powodu unieważnienia.

## Architektura

Projekt składa się z trzech usług uruchamianych przez Docker Compose:

| Usługa | Technologia | Port | Rola |
| --- | --- | --- | --- |
| `db` | PostgreSQL 15 Alpine | `5432` | Przechowywanie certyfikatów i żądań CSR. |
| `backend` | Python + FastAPI + SQLAlchemy + cryptography | `8000` | Główna logika systemu PKI, wystawianie certyfikatów, obsługa Root CA i API. |
| `frontend` | Next.js / Node 20 Alpine | `3000` | Panel administracyjny do obsługi CA, żądań i certyfikatów. |

Najważniejszą częścią projektu jest backend. To właśnie tam wykonywane są operacje kryptograficzne i biznesowe: generowanie klucza Root CA, podpisywanie certyfikatów z CSR, generowanie pary klucz prywatny + certyfikat z formularza, pobieranie danych z PostgreSQL, walidacja statusów `PENDING`, `APPROVED`, `REJECTED`, `VALID` i `REVOKED` oraz wystawianie odpowiedzi REST API dla frontendu.

Backend zapisuje klucz prywatny Root CA w katalogu `/app/certs`. Katalog ten jest mapowany do wolumenu `certs_data`, dzięki czemu dane pozostają dostępne po restarcie kontenerów.

## Wykorzystanie Pythona

Projekt został zaprojektowany w taki sposób, aby najważniejsze elementy rozwiązania były zrealizowane w Pythonie. Python nie jest tutaj dodatkiem pomocniczym, ale centralnym elementem systemu.

Po stronie Pythona zostały zaimplementowane między innymi:

- definicja REST API w FastAPI,
- modele danych wejściowych i walidacja przy pomocy Pydantic,
- połączenie z PostgreSQL i operacje na bazie przez SQLAlchemy,
- inicjalizacja urzędu certyfikacji Root CA,
- generowanie kluczy i certyfikatów przy użyciu biblioteki `cryptography`,
- podpisywanie certyfikatów na podstawie CSR,
- generowanie certyfikatu bezpośrednio z formularza, bez ręcznego CSR,
- unieważnianie certyfikatów i zapis powodu unieważnienia,
- logika statusów żądań i certyfikatów,
- udostępnienie danych dla panelu frontendowego przez endpointy API.

Frontend nie wykonuje operacji kryptograficznych. Jego zadaniem jest wyłącznie zebranie danych od użytkownika i przesłanie ich do backendu, a następnie wyświetlenie odpowiedzi zwróconej przez system napisany w Pythonie.

## Endpointy API

Backend udostępnia następujące endpointy:

| Metoda | Endpoint | Opis |
| --- | --- | --- |
| `POST` | `/api/ca/init` | Inicjalizacja Root CA. |
| `POST` | `/api/certs/request` | Zapis żądania CSR. |
| `GET` | `/api/requests` | Pobranie listy żądań CSR. |
| `POST` | `/api/requests/{request_id}/reject` | Odrzucenie żądania CSR. |
| `GET` | `/api/certificates` | Pobranie listy certyfikatów. |
| `GET` | `/api/certificates/{certificate_id}` | Pobranie szczegółów pojedynczego certyfikatu. |
| `GET` | `/api/certificates/{certificate_id}/pem` | Pobranie certyfikatu PEM. |
| `POST` | `/api/certificates/issue` | Wystawienie certyfikatu na podstawie `request_id`. |
| `POST` | `/api/certs/approve/{request_id}` | Alternatywne zatwierdzenie żądania i wystawienie certyfikatu. |
| `POST` | `/api/certificates/generate` | Generowanie nowego certyfikatu i klucza prywatnego bez ręcznego CSR. |
| `POST` | `/api/certificates/{certificate_id}/revoke` | Unieważnienie certyfikatu z podaniem powodu. |

Frontend korzysta z następującej konfiguracji środowiskowej:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Struktura danych

System wykorzystuje dwie główne tabele oraz powiązane statusy biznesowe obsługiwane przez backend.

### requests

Tabela przechowuje informacje o zgłoszonych żądaniach certyfikatów:

- `common_name`,
- `status`,
- `csr_pem_data`,
- `created_at`.

Status żądania może przyjmować wartości `PENDING`, `APPROVED` albo `REJECTED`.

### certificates

Tabela przechowuje wystawione certyfikaty oraz ich stan:

- numer seryjny,
- `common_name`,
- organizację,
- typ certyfikatu,
- status certyfikatu,
- daty ważności,
- certyfikat w formacie PEM,
- datę unieważnienia,
- powód unieważnienia.

Status certyfikatu może przyjmować wartości `VALID`, `REVOKED` albo `EXPIRED`.

## Uruchomienie

### Wymagania

- Docker,
- Docker Compose.

### Start projektu

Uruchom wszystkie usługi:

```bash
docker compose up --build
```

Frontend będzie dostępny pod adresem:

```text
http://localhost:3000
```

Dokumentacja API:

```text
http://localhost:8000/docs
```

### Restart po zmianach

Po zmianach w backendzie lub frontendzie zalecany jest pełny restart:

```bash
docker compose down
docker compose up --build
```

## Korzystanie z aplikacji

### 1. Inicjalizacja Root CA

W zakładce **Root CA** należy uruchomić inicjalizację urzędu certyfikacji. Operacja generuje klucz RSA 2048 bitów, tworzy samopodpisany certyfikat Root CA i zapisuje klucz prywatny na trwałym wolumenie Dockera.

Root CA może zostać utworzony tylko raz. Ponowna próba inicjalizacji zwraca błąd HTTP `400`.

### 2. Dodanie żądania CSR

W zakładce **Żądania CSR** można przełączyć się między listą żądań a formularzem **Prześlij CSR**. Formularz przyjmuje `common_name` oraz CSR w formacie PEM i wysyła dane do endpointu `POST /api/certs/request`.

Nowe żądanie otrzymuje status `PENDING` i pojawia się na liście requestów w panelu.

### 3. Zatwierdzenie lub odrzucenie żądania

Żądanie CSR można zatwierdzić albo odrzucić z poziomu listy żądań w panelu. Przy zatwierdzeniu backend pobiera zapisany CSR, podpisuje go przy użyciu Root CA, zapisuje nowy certyfikat w bazie danych i zmienia status requestu na `APPROVED`.

Odrzucenie żądania zmienia jego status na `REJECTED`, bez wystawiania certyfikatu.

### 4. Wystawienie certyfikatu na podstawie requestu

Zakładka **Wystaw certyfikat** pozwala na wystawienie certyfikatu na podstawie wcześniej zapisanego requestu CSR. Ten wariant odwzorowuje klasyczny przepływ PKI, w którym klucz prywatny i CSR powstają po stronie klienta, a urząd certyfikacji podpisuje gotowe żądanie.

### 5. Generowanie certyfikatu z formularza

Dodany został również uproszczony tryb pracy: **Generuj z formularza**. W tym wariancie użytkownik podaje `common_name`, organizację i typ certyfikatu, a backend sam generuje parę kluczy oraz podpisany certyfikat bez potrzeby ręcznego tworzenia CSR.

To rozwiązanie ma charakter demonstracyjny i edukacyjny. W środowisku produkcyjnym klucz prywatny nie powinien być standardowo generowany i zwracany przez backend, natomiast na potrzeby projektu uczelnianego upraszcza to prezentację działania systemu PKI.

### 6. Przegląd i szczegóły certyfikatów

Zakładka **Certyfikaty** wyświetla wszystkie certyfikaty wraz z typem, statusem i zakresem ważności. Z poziomu tabeli dostępne są akcje wyświetlenia szczegółów, pobrania certyfikatu PEM oraz unieważnienia certyfikatu, jeśli jego status to `VALID` i nie jest to Root CA.

Modal szczegółów pokazuje między innymi numer seryjny, daty ważności, status, dane PEM oraz informacje o ewentualnym unieważnieniu.

### 7. Unieważnianie certyfikatów

System obsługuje unieważnianie certyfikatów z poziomu panelu administracyjnego. Backend zapisuje status `REVOKED`, datę unieważnienia oraz powód unieważnienia.

Root CA nie może zostać unieważnione z poziomu panelu, co jest zabezpieczeniem logicznym w implementacji backendu.

## Zaimplementowane funkcjonalności

| Funkcjonalność | Status |
| --- | --- |
| Docker Compose | ✅ |
| PostgreSQL jako warstwa trwałego składowania | ✅ |
| Backend REST API w Pythonie (FastAPI) | ✅ |
| Obsługa bazy danych przez SQLAlchemy | ✅ |
| Operacje kryptograficzne przez bibliotekę `cryptography` | ✅ |
| Inicjalizacja Root CA | ✅ |
| Trwałe przechowywanie klucza Root CA | ✅ |
| Obsługa CORS | ✅ |
| Dodawanie CSR | ✅ |
| Lista żądań CSR | ✅ |
| Zatwierdzanie żądań CSR | ✅ |
| Odrzucanie żądań CSR | ✅ |
| Wystawianie certyfikatów z CSR | ✅ |
| Generowanie certyfikatu z formularza bez ręcznego CSR | ✅ |
| Lista certyfikatów | ✅ |
| Szczegóły pojedynczego certyfikatu | ✅ |
| Pobieranie certyfikatu PEM z UI | ✅ |
| Unieważnianie certyfikatów | ✅ |
| Dashboard ze statystykami | ✅ |
| Panel administracyjny w Next.js | ✅ |

## Ograniczenia i uproszczenia

| Funkcjonalność | Status |
| --- | --- |
| Uwierzytelnianie i autoryzacja użytkowników | ❌ |
| Obsługa CRL lub OCSP | ❌ |
| Rozbudowana polityka certyfikacji | ❌ |
| Obsługa wielu poziomów CA, np. Intermediate CA | ⚠️ |
| Rozszerzona walidacja pól CSR | ⚠️ |
| Produkcyjne zarządzanie kluczami prywatnymi | ⚠️ |
| Generowanie certyfikatów z formularza jako tryb produkcyjny | ⚠️ |

Aplikacja została przygotowana jako projekt edukacyjny, dlatego część decyzji została świadomie uproszczona. Najlepszym przykładem jest tryb generowania certyfikatu z formularza, w którym backend zwraca także klucz prywatny, co ułatwia prezentację działania systemu, ale nie powinno być traktowane jako wzorzec dla środowiska produkcyjnego.

## Uwagi techniczne

- Backend wykorzystuje pola `not_valid_before_utc` oraz `not_valid_after_utc`, co eliminuje ostrzeżenia deprecacyjne biblioteki `cryptography`.
- Komunikacja frontend-backend jest realizowana przez plik `api.ts`, który mapuje wywołania interfejsu użytkownika na endpointy FastAPI.
- Docker Compose uruchamia cały system lokalnie jako trzy współpracujące kontenery: bazę danych, backend i frontend.
- Logika biznesowa i kryptograficzna została skupiona po stronie backendu w Pythonie, dzięki czemu frontend pozostaje prostym klientem administracyjnym.

## Możliwe rozszerzenia

- dodanie Intermediate CA i łańcucha certyfikacji,
- obsługa list CRL lub mechanizmu OCSP,
- eksport certyfikatu i klucza jako archiwum ZIP,
- dodatkowa walidacja atrybutów Subject i Subject Alternative Name,
- autoryzacja dostępu do panelu administracyjnego,
- audyt operacji administracyjnych, np. kto wystawił lub unieważnił certyfikat.
