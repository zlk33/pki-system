@echo off
REM Generuje dokumentacje HTML + PDF projektu Studenckie PKI
cd /d "%~dp0\.."
python -m pip install -r scripts/requirements-docs.txt -q
python scripts/generate_documentation.py
pause
