#!/bin/bash
# Avvia un server locale Python sulla porta 8000
cd "$(dirname "$0")"
echo "Server in avvio su http://localhost:8000 ..."
python3 -m http.server 8000 