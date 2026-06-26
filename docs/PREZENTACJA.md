# Prezentacja — Studenckie PKI

> Skrypt do wygłoszenia na obronę / prezentację projektu.  
> Szacowany czas: **12–15 minut** + demo na żywo.

---

## Slajd 1 — Tytuł

**Studenckie PKI**  
System zarządzania infrastrukturą klucza publicznego

**Zespół projektowy:**
- Jakub Zalewski
- Hubert Rachwalik
- Jakub Zaborski
- Mateusz Rutkowski
- Michał Dęby
- Robert Graff
- Wojciech Bojko

- Stack: Python (FastAPI) + PostgreSQL + Next.js + Docker

**Co powiedzieć:**  
Przedstawiamy projekt edukacyjnego PKI — od utworzenia urzędu certyfikacji, przez wystawianie certyfikatów użytkownikom, po podpisywanie i weryfikację dokumentów.

---

## Slajd 2 — Cel projektu

**Cel:** zbudować działający, lokalny system PKI z panelem webowym.

Użytkownik powinien móc:
- zarejestrować się i zalogować,
- uzyskać certyfikat podpisany przez Root CA,
- podpisać dokument i pobrać plik podpisu,
- zweryfikować podpis na innym komputerze,
- (admin) zarządzać użytkownikami, CRL i dziennikiem zdarzeń.

**Co powiedzieć:**  
To nie jest produkcyjne HSM-PKI, ale kompletny przepływ zgodny z ideą X.509, CSR, CRL i podpisów odłączonych.

---

## Slajd 3 — Architektura

```
┌─────────────┐     REST/JWT      ┌──────────────┐     SQL      ┌────────────┐
│  Frontend   │ ◄──────────────► │   Backend    │ ◄──────────► │ PostgreSQL │
│  Next.js    │   localhost:8000 │   FastAPI    │              │            │
│  :3000      │                  │   Python     │              │            │
└─────────────┘                  └──────┬───────┘              └────────────┘
                                        │
                                 /app/certs (wolumen Docker)
                                 Root CA key + klucze użytkowników
```

**Co powiedzieć:**  
Trzy kontenery Docker Compose. Cała kryptografia jest w Pythonie — frontend tylko zbiera dane i wyświetla wyniki.

---

## Slajd 4 — Warstwa backendu (Python)

Moduły w `backend/app/`:

| Plik | Odpowiedzialność |
|------|------------------|
| `main.py` | REST API, auth JWT, orchestracja |
| `ca_manager.py` | Generowanie Root CA |
| `cert_manager.py` | Podpisywanie CSR → certyfikat |
| `crl_manager.py` | Generowanie listy CRL (PEM) |
| `audit.py` | Dziennik zdarzeń |
| `db.py` | Modele SQLAlchemy |

**Co powiedzieć:**  
Backend jest sercem projektu — spełnia wymaganie przedmiotu dotyczące Pythona.

---

## Slajd 5 — Baza danych

Tabele:
- `users` — konta, role (`admin` / `user`)
- `certificates` — certyfikaty PEM, status, unieważnienie
- `requests` — żądania CSR
- `signed_documents` — metadane podpisów
- `audit_logs` — dziennik operacji

**Co powiedzieć:**  
Schemat w `db/init.sql`. Migracje lekkie przy starcie backendu (np. nowe kolumny audytu).

---

## Slajd 6 — Uwierzytelnianie i role

- Rejestracja — pierwszy użytkownik = **admin**
- Logowanie — JWT Bearer (`/api/auth/login`)
- Role:
  - **admin** — CA, użytkownicy, wystawianie certów, CRL, dziennik
  - **user** — własne certyfikaty, CSR, podpisywanie

**Co powiedzieć:**  
Każde żądanie API (poza login/register) wymaga tokenu. Admin ma rozszerzony panel.

---

## Slajd 7 — Root CA

1. Admin → **Root CA** → Inicjalizuj
2. Generowany jest RSA-2048, certyfikat samopodpisany (10 lat)
3. Klucz prywatny w `/app/certs/root_ca.key` (wolumen Docker)

**Co powiedzieć:**  
Operacja jednorazowa. Bez Root CA nie da się wystawiać certyfikatów użytkowników.

---

## Slajd 8 — Wystawianie certyfikatów

Dwa tryby:

**A) CSR (klasyczny PKI)**  
Użytkownik generuje CSR lokalnie → składa wniosek → admin zatwierdza.

**B) Wystaw przez admina**  
Admin wybiera użytkownika, wypełnia formularz → backend generuje klucz + certyfikat → klucz na serwerze.

**Co powiedzieć:**  
Tryb B umożliwia podpisywanie dokumentów w panelu (klucz musi być na serwerze).

---

## Slajd 9 — Podpisywanie dokumentów

1. Użytkownik wgrywa plik
2. Backend podpisuje RSA-SHA256 (PKCS#1 v1.5)
3. Pobierany plik **`nazwa.pki.sig.json`** zawiera:
   - hash SHA-256 dokumentu,
   - podpis,
   - podpis znacznika czasu (`signed_at`),
   - certyfikat PEM

Oryginalny plik **zostaje u użytkownika** — to podpis odłączony (detached).

**Co powiedzieć:**  
To ważne — nie modyfikujemy oryginału, tylko dostarczamy plik podpisu do weryfikacji.

---

## Slajd 10 — Weryfikacja podpisu

Użytkownik wgrywa:
- oryginalny dokument,
- plik `.pki.sig.json`.

System sprawdza:
- zgodność hasha,
- poprawność podpisu kryptograficznego,
- podpis znacznika czasu,
- ważność i status certyfikatu (w tym unieważnienie).

**Co powiedzieć:**  
Można to zrobić na innym komputerze — plik podpisu jest samowystarczalny.

---

## Slajd 11 — CRL i unieważnianie

- Admin unieważnia certyfikat → status `REVOKED` + powód
- **CRL** (Certificate Revocation List) — pobierany PEM z Root CA
- Weryfikacja odrzuca podpis certyfikatu unieważnionego

**Co powiedzieć:**  
CRL to standardowy element PKI — lista numerów seryjnych revoked certów.

---

## Slajd 12 — Zarządzanie użytkownikami (admin)

Panel **Użytkownicy**:
- lista kont,
- tworzenie użytkownika,
- zmiana roli,
- reset hasła,
- usuwanie (z zabezpieczeniem ostatniego admina).

**Co powiedzieć:**  
Pierwszy zarejestrowany użytkownik zostaje adminem — typowy bootstrap bez osobnej konfiguracji.

---

## Slajd 13 — Dziennik zdarzeń (audit log)

Każda istotna operacja zapisuje:
- **kto** wykonał (imię, email, rola — snapshot),
- **co** (akcja, opis po polsku),
- **na czym** (cel, ID zasobu),
- **metadane** (np. zmiany pól przy edycji użytkownika).

**Co powiedzieć:**  
Przydatne na obronie — widać pełną historię działań w systemie.

---

## Slajd 14 — Demo na żywo (scenariusz)

1. `docker compose up --build`
2. Rejestracja admina → init Root CA
3. Utworzenie użytkownika (admin)
4. Wystawienie certyfikatu dla użytkownika
5. Logowanie jako user → podpisanie pliku → pobranie `.pki.sig.json`
6. Weryfikacja podpisu
7. Unieważnienie certyfikatu → ponowna weryfikacja (błąd)
8. Pobranie CRL + podgląd dziennika

**Co powiedzieć:**  
Przejdź scenariusz spokojnie — to najważniejsza część prezentacji.

---

## Slajd 15 — Ograniczenia i dalszy rozwój

**Świadome uproszczenia:**
- brak HSM / klucz Root CA w pliku na dysku,
- brak OCSP (tylko CRL),
- brak Intermediate CA w pełnym łańcuchu,
- klucze użytkowników na serwerze (tryb demo).

**Możliwe rozszerzenia:**
- Intermediate CA, PKCS#12, OCSP, TSA zewnętrzny.

**Co powiedzieć:**  
Projekt jest edukacyjny — wiemy co by było potrzebne w produkcji.

---

## Slajd 16 — Podsumowanie

✅ Działające PKI w Dockerze  
✅ Python jako rdzeń kryptograficzny  
✅ Auth, role, panel admina  
✅ Certyfikaty, CSR, CRL, podpisy, weryfikacja  
✅ Audit log i dokumentacja  

**Pytania?**

---

## Notatki dla prowadzącego

- API docs: http://localhost:8000/docs
- Panel: http://localhost:3000
- Dokumentacja PDF: `python scripts/generate_documentation.py`
- Pierwszy user = admin — przygotuj konto przed prezentacją lub zarejestruj się na żywo
