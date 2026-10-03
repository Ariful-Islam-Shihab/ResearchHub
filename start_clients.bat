@echo off
echo ===================================================
echo     Starting ResearchHub Native Clients...
echo ===================================================
echo.
echo Make sure CentralBackend is running natively on port 8080!
echo.

cd LocalBackend
echo Building LocalBackend...
call .\mvnw clean package -DskipTests
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo Starting Client A (Port 3000)...
start "Client A" cmd /c "java -jar target\localbackend-0.0.1-SNAPSHOT.jar --server.port=3000 --spring.datasource.url=jdbc:sqlite:researchhub_client_A.db --central.backend.url=http://localhost:8080 --central.chat.host=localhost --central.chat.port=9090"

echo Starting Client B (Port 3001)...
start "Client B" cmd /c "java -jar target\localbackend-0.0.1-SNAPSHOT.jar --server.port=3001 --spring.datasource.url=jdbc:sqlite:researchhub_client_B.db --central.backend.url=http://localhost:8080 --central.chat.host=localhost --central.chat.port=9090"

echo.
echo ===================================================
echo Clients started in background windows!
echo - Client A: http://localhost:3000
echo - Client B: http://localhost:3001
echo ===================================================
pause
