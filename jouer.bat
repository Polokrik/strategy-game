@echo off
rem Lance Conquete : installe les dependances au premier lancement, puis ouvre le jeu dans le navigateur.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js est introuvable. Installe-le depuis https://nodejs.org puis relance ce fichier.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Premier lancement : installation des dependances...
  call npm.cmd install
  if errorlevel 1 (
    echo L'installation a echoue.
    pause
    exit /b 1
  )
)
echo Le jeu s'ouvre dans le navigateur. Ferme cette fenetre pour l'arreter.
call npm.cmd run dev -- --open
pause
