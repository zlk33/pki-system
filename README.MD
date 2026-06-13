# Studenckie PKI

Prosty system PKI z backendem w FastAPI, frontendem w Next.js oraz bazą PostgreSQL, uruchamiany przy użyciu Docker Compose.

## Zakres projektu

Aplikacja obsługuje podstawowy przepływ pracy dla lokalnego, edukacyjnego PKI:

* inicjalizację Root CA przez panel administracyjny,
* zapis żądań CSR do bazy danych,
* przegląd żądań certyfikatów,
* zatwierdzanie żądań i generowanie certyfikatów podpisanych przez Root CA,
* przegląd listy wystawionych certyfikatów.

## Architektura

Projekt składa się z trzech usług uruchamianych przez Docker Compose:

| Usługa     | Technologia              | Port   | Rola                                                      |
| ---------- | ------------------------ | ------ | --------------------------------------------------------- |
| `db`       | PostgreSQL 15 Alpine     | `5432` | Przechowywanie certyfikatów i żądań CSR                   |
| `backend`  | FastAPI                  | `8000` | REST API dla operacji PKI                                 |
| `frontend` | Next.js / Node 20 Alpine | `3000` | Panel administracyjny do obsługi CA, żądań i certyfikatów |

Backend zapisuje klucz prywatny Root CA w katalogu `/app/certs`. Katalog ten jest mapowany do wolumenu `certs_data`, dzięki czemu dane pozostają dostępne po restarcie kontenerów.

## Endpointy API

Backend udostępnia następujące endpointy:

| Metoda | Endpoint                          | Opis                                              |
| ------ | --------------------------------- | ------------------------------------------------- |
| `POST` | `/api/ca/init`                    | Inicjalizacja Root CA                             |
| `POST` | `/api/certs/request`              | Zapis żądania CSR                                 |
| `GET`  | `/api/requests`                   | Pobranie listy żądań CSR                          |
| `GET`  | `/api/certificates`               | Pobranie listy certyfikatów                       |
| `POST` | `/api/certificates/issue`         | Wystawienie certyfikatu na podstawie `request_id` |
| `POST` | `/api/certs/approve/{request_id}` | Zatwierdzenie żądania i wystawienie certyfikatu   |

Frontend korzysta z następującej konfiguracji:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Struktura danych

System wykorzystuje dwie główne tabele.

### requests

Przechowuje informacje o zgłoszonych żądaniach certyfikatów:

* `common_name`
* `status`
* `csr_pem`
* `created_at`

### certificates

Przechowuje wystawione certyfikaty:

* numer seryjny,
* typ certyfikatu,
* daty ważności,
* certyfikat w formacie PEM,
* informacje o unieważnieniu.

## Uruchomienie

### Wymagania

* Docker
* Docker Compose

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

W zakładce **Root CA** kliknij przycisk inicjalizacji.

Operacja:

* generuje klucz RSA 2048 bitów,
* tworzy samopodpisany certyfikat Root CA,
* zapisuje klucz prywatny na trwałym wolumenie Dockera.

### 2. Dodanie żądania CSR

Przejdź do zakładki **Żądania CSR** i uzupełnij:

* `common_name`,
* CSR w formacie PEM.

Po wysłaniu formularza dane trafiają do endpointu:

```http
POST /api/certs/request
```

Nowe żądanie otrzymuje status:

```text
PENDING
```

### 3. Zatwierdzenie żądania

Żądanie można zatwierdzić z poziomu listy requestów lub widoku **Wystaw certyfikat**.

Backend:

1. pobiera zapisany CSR,
2. podpisuje go przy użyciu Root CA,
3. zapisuje nowy certyfikat w bazie danych,
4. zmienia status requestu na `APPROVED`.

### 4. Przegląd certyfikatów

Zakładka **Certyfikaty** wyświetla wszystkie wystawione certyfikaty wraz z:

* typem,
* statusem,
* datą wystawienia,
* datą wygaśnięcia.

## Zaimplementowane funkcjonalności

| Funkcjonalność                       | Status |
| ------------------------------------ | ------ |
| Docker Compose                       | ✅      |
| Inicjalizacja Root CA                | ✅      |
| Obsługa CORS                         | ✅      |
| Dodawanie CSR                        | ✅      |
| Lista żądań CSR                      | ✅      |
| Wystawianie certyfikatów             | ✅      |
| Lista certyfikatów                   | ✅      |
| Dashboard ze statystykami            | ✅      |
| Trwałe przechowywanie klucza Root CA | ✅      |

## Ograniczenia i brakujące funkcje

| Funkcjonalność                     | Status |
| ---------------------------------- | ------ |
| Odrzucanie żądań CSR               | ❌      |
| Unieważnianie certyfikatów         | ❌      |
| Szczegóły pojedynczego certyfikatu | ❌      |
| Pobieranie certyfikatów PEM z UI   | ⚠️     |
| Obsługa wielu typów certyfikatów   | ⚠️     |
| Rozszerzona walidacja CSR          | ⚠️     |
| Uwierzytelnianie i autoryzacja     | ❌      |

## Uwagi techniczne

* Backend wykorzystuje pola `not_valid_before_utc` oraz `not_valid_after_utc`, co eliminuje ostrzeżenia deprecacyjne biblioteki `cryptography`.
* Root CA może zostać utworzone tylko raz. Kolejna próba inicjalizacji zwraca błąd HTTP `400`.
* W przypadku problemów z frontendem pierwszym miejscem do sprawdzenia powinien być plik `api.ts`, który odpowiada za komunikację pomiędzy frontendem a backendem.

## Możliwe rozszerzenia

* dodanie endpointu odrzucania żądań CSR,
* dodanie mechanizmu unieważniania certyfikatów,
* widok szczegółów certyfikatu wraz z PEM,
* obsługa typów certyfikatów:

  * `SERVER`,
  * `CLIENT`,
  * `INTERMEDIATE`,
* dodanie autoryzacji do panelu administracyjnego.
