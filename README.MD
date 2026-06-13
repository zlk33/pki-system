# Studenckie PKI

Prosty system PKI z backendem w FastAPI, frontendem w Next.js oraz bazą PostgreSQL, uruchamiany przez Docker Compose.[file:41][file:30]

## Zakres projektu

Aplikacja obsługuje podstawowy przepływ pracy dla lokalnego, edukacyjnego PKI:
- inicjalizację Root CA przez panel administracyjny,[file:20][file:30]
- zapis żądań CSR do bazy danych,[file:23][file:30]
- przegląd żądań certyfikatów,[file:23][file:30]
- zatwierdzanie żądania i generowanie certyfikatu podpisanego przez Root CA,[file:33][file:30]
- przegląd listy wystawionych certyfikatów.[file:21][file:30]

## Architektura

Projekt składa się z trzech usług uruchamianych przez Docker Compose:[file:41]

| Usługa | Technologia | Port | Rola |
|---|---|---:|---|
| `db` | PostgreSQL 15 Alpine | `5432` | Przechowywanie certyfikatów i żądań CSR.[file:41][file:32] |
| `backend` | FastAPI | `8000` | REST API dla operacji PKI.[file:41][file:30] |
| `frontend` | Next.js / Node 20 Alpine | `3000` | Panel administracyjny do obsługi CA, requestów i certyfikatów.[file:41][file:27] |

Backend zapisuje klucz prywatny Root CA do katalogu `/app/certs`, a katalog ten jest mapowany do wolumenu `certs_data`, więc dane nie znikają po restarcie kontenera.[file:41][file:20][file:30]

## Endpointy API

Aktualnie backend udostępnia następujące endpointy:[file:30]

| Metoda | Endpoint | Opis |
|---|---|---|
| `POST` | `/api/ca/init` | Inicjalizacja Root CA.[file:30] |
| `POST` | `/api/certs/request` | Zapis żądania CSR.[file:30] |
| `GET` | `/api/requests` | Pobranie listy żądań CSR.[file:30] |
| `GET` | `/api/certificates` | Pobranie listy certyfikatów.[file:30] |
| `POST` | `/api/certificates/issue` | Wystawienie certyfikatu na podstawie `request_id`.[file:30] |
| `POST` | `/api/certs/approve/{request_id}` | Alias do zatwierdzenia requestu i wystawienia certyfikatu.[file:30] |

Frontend korzysta z `NEXT_PUBLIC_API_URL=http://localhost:8000`, więc żądania z panelu trafiają bezpośrednio do backendu wystawionego na porcie `8000`.[file:41][file:42]

## Struktura danych

W bazie danych są dwie główne tabele: `certificates` i `requests`.[file:32] Tabela `certificates` przechowuje m.in. numer seryjny, typ certyfikatu, zakres ważności, PEM oraz informacje o unieważnieniu, a tabela `requests` przechowuje `common_name`, status, CSR w PEM i datę utworzenia wpisu.[file:32]

## Uruchomienie

### Wymagania

- Docker
- Docker Compose

### Start projektu

1. Przejdź do katalogu projektu.
2. Uruchom usługi:

```bash
docker compose up --build
```

3. Otwórz aplikację frontendową pod adresem:

```text
http://localhost:3000
```

4. Dokumentacja backendu będzie dostępna pod adresem:

```text
http://localhost:8000/docs
```

### Restart po zmianach

Jeżeli zmieniane były pliki backendu lub frontendu, najbezpieczniej wykonać pełny restart:

```bash
docker compose down
docker compose up --build
```

## Jak używać aplikacji

### 1. Inicjalizacja Root CA

W zakładce **Root CA** kliknij przycisk inicjalizacji.[file:20] Operacja tworzy klucz RSA-2048 i samopodpisany certyfikat Root CA, a następnie zapisuje klucz prywatny na wolumenie Dockera.[file:20][file:30]

### 2. Dodanie żądania CSR

W zakładce **Żądania CSR** przejdź do formularza i wklej `common_name` oraz CSR w formacie PEM.[file:23] Formularz wysyła dane do `POST /api/certs/request`, a request zostaje zapisany ze statusem `PENDING`.[file:23][file:30]

### 3. Zatwierdzenie żądania

Żądanie można zatwierdzić z listy requestów albo z widoku **Wystaw certyfikat**, który wybiera oczekujący request z listy.[file:23][file:33] Backend pobiera zapisany CSR, podpisuje go przez Root CA i zapisuje wystawiony certyfikat do tabeli `certificates`.[file:30]

### 4. Podgląd certyfikatów

Zakładka **Certyfikaty** pobiera dane z `GET /api/certificates` i pokazuje listę zapisanych certyfikatów wraz z typem, statusem oraz datami ważności.[file:21][file:30]

## Co działa

Poniższe elementy są gotowe i spójne z aktualnym kodem:

| Obszar | Status | Opis |
|---|---|---|
| Docker Compose | Działa | Baza, backend i frontend mają poprawnie zdefiniowane usługi, porty i wolumeny.[file:41] |
| Root CA init | Działa | `CAInit.tsx` korzysta z `api.initCA()`, a backend obsługuje `POST /api/ca/init`.[file:20][file:42][file:30] |
| CORS | Działa | Backend ma middleware CORS dopuszczający frontend z `http://localhost:3000`.[file:30][file:41] |
| Submit CSR | Działa | Formularz requestów wysyła `common_name` i `csr_pem_data`, a API mapuje to na `csr_pem` dla backendu.[file:23][file:42][file:30] |
| Lista requestów | Działa | Frontend pobiera dane z `GET /api/requests`.[file:23][file:42][file:30] |
| Approve / issue cert | Działa | Zatwierdzenie requestu generuje certyfikat i aktualizuje status requestu na `APPROVED`.[file:23][file:33][file:30] |
| Lista certyfikatów | Działa | Frontend pobiera dane z `GET /api/certificates` i renderuje tabelę certyfikatów.[file:21][file:42][file:30] |
| Pulpit | Działa | Dashboard liczy podstawowe statystyki na podstawie requestów i certyfikatów.[file:22][file:30] |
| Persistencja klucza Root CA | Działa | Klucz Root CA trafia do `/app/certs/root_ca.key` na trwałym wolumenie `certs_data`.[file:41][file:30] |

## Co nie działa albo nie jest dokończone

Poniższe obszary są jeszcze niezaimplementowane albo tylko częściowo przygotowane:

| Obszar | Status | Opis |
|---|---|---|
| Odrzucanie requestów | Brak | Model bazy przewiduje status `REJECTED`, ale backend nie ma endpointu `reject`.[file:32][file:30] |
| Unieważnianie certyfikatów | Brak | Model `Certificate` ma `revoked_at` i `revocation_reason`, ale backend nie ma endpointu revoke, a frontend nie ma gotowej obsługi końcowej.[file:32][file:21][file:30] |
| Szczegóły pojedynczego certyfikatu | Brak | API nie udostępnia `GET /api/certificates/{id}`.[file:30] |
| Pobieranie PEM z UI | Częściowo | PEM jest zapisywany w bazie, ale aktualny widok listy certyfikatów pokazuje głównie metadane, nie pełny eksport/pobieranie.[file:21][file:32] |
| Obsługa wielu typów certyfikatów przy issue | Ograniczone | Wystawienie z requestu zapisuje typ jako `SERVER`, bez osobnego przepływu dla `CLIENT` i `INTERMEDIATE`.[file:30][file:32] |
| Zaawansowana walidacja CSR | Ograniczone | Błędy niepoprawnego CSR są obsługiwane, ale nie ma rozbudowanej walidacji biznesowej po stronie UI.[file:30][file:23] |
| Produkcyjne zabezpieczenia | Brak | Konfiguracja jest edukacyjna i lokalna; nie ma auth, RBAC, sekretów produkcyjnych ani bezpiecznego zarządzania kluczami.[file:41][file:30] |

## Znane uwagi techniczne

Backend został poprawiony tak, aby używać `not_valid_before_utc` oraz `not_valid_after_utc`, co usuwa ostrzeżenia deprecacyjne biblioteki `cryptography` związane z naiwnymi obiektami datetime.[file:30] Root CA może zostać zainicjalizowane tylko raz; kolejna próba zwróci błąd `400`.[file:30]

Jeżeli frontend nie buduje się poprawnie, pierwszym miejscem do sprawdzenia powinien być plik `api.ts`, bo to on scala kontrakt między komponentami React i endpointami FastAPI.[file:42][file:23][file:33]

## Sugerowane kolejne kroki

Najbardziej naturalne rozszerzenia projektu to:
- dodanie endpointu do odrzucania requestów i przycisku `Reject`,[file:32][file:23]
- dodanie endpointu revoke dla certyfikatów,[file:32]
- dodanie widoku szczegółów certyfikatu wraz z PEM,[file:21][file:32]
- rozdzielenie typów wystawianych certyfikatów (`SERVER`, `CLIENT`, `INTERMEDIATE`),[file:32][file:30]
- dodanie autoryzacji do panelu administracyjnego.[file:41][file:30]
