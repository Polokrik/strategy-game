@echo off
rem Met a jour Conquete (git pull + dependances), puis lance le jeu.
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo Git est introuvable : mise a jour impossible.
  pause
  exit /b 1
)
git pull
if errorlevel 1 (
  echo La mise a jour a echoue : modifications locales ou pas de reseau.
  pause
  exit /b 1
)
call npm.cmd install
if errorlevel 1 (
  echo L'installation des dependances a echoue.
  pause
  exit /b 1
)
call "%~dp0jouer.bat"
