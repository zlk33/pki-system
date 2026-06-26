@echo off
REM Generuje prezentacje PPTX projektu Studenckie PKI
cd /d "%~dp0\.."
python -m pip install -r scripts/requirements-docs.txt -q
python scripts/generate_presentation.py
pause
