@echo off
title Troca de escala - servidor local
rem Abre o app em http://localhost:8080 usando o PowerShell do Windows.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
