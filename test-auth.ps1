# Auth Routes Testing Script
# Run this from PowerShell to test all authentication endpoints

$baseUrl = "http://localhost:5000/api/auth"
Write-Host "`n=== Testing Authentication Routes ===" -ForegroundColor Cyan
Write-Host "Base URL: $baseUrl`n" -ForegroundColor Gray

# Test 1: Register a new user
Write-Host "1. Testing POST /register" -ForegroundColor Yellow
$registerBody = @{
    name = "Test User"
    email = "testuser@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $registerResponse = Invoke-WebRequest -Uri "$baseUrl/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json" `
        -SessionVariable session
    
    Write-Host "✓ Register successful" -ForegroundColor Green
    $registerData = $registerResponse.Content | ConvertFrom-Json
    Write-Host "User ID: $($registerData.user._id)" -ForegroundColor Gray
    Write-Host "Name: $($registerData.user.name)" -ForegroundColor Gray
    Write-Host "Email: $($registerData.user.email)" -ForegroundColor Gray
    Write-Host "Role: $($registerData.user.role)" -ForegroundColor Gray
    Write-Host "Access Token received: $($registerData.accessToken.Length) chars`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Register failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)`n" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Test 2: Try to register duplicate user
Write-Host "2. Testing POST /register (duplicate email)" -ForegroundColor Yellow
try {
    $dupResponse = Invoke-WebRequest -Uri "$baseUrl/register" `
        -Method POST `
        -Body $registerBody `
        -ContentType "application/json"
    
    Write-Host "✗ Should have failed with duplicate email error" -ForegroundColor Red
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.message -match "already exists") {
        Write-Host "✓ Correctly rejected duplicate email" -ForegroundColor Green
        Write-Host "Error: $($errorMessage.message)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($errorMessage.message)`n" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# Test 3: Login with correct credentials
Write-Host "3. Testing POST /login (valid credentials)" -ForegroundColor Yellow
$loginBody = @{
    email = "testuser@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-WebRequest -Uri "$baseUrl/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json" `
        -SessionVariable loginSession
    
    Write-Host "✓ Login successful" -ForegroundColor Green
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $accessToken = $loginData.accessToken
    Write-Host "Access Token: ${accessToken.Substring(0, 20)}..." -ForegroundColor Gray
    Write-Host "User: $($loginData.user.name) ($($loginData.user.email))`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)`n" -ForegroundColor Red
    exit
}

Start-Sleep -Seconds 1

# Test 4: Login with wrong password
Write-Host "4. Testing POST /login (invalid password)" -ForegroundColor Yellow
$wrongPasswordBody = @{
    email = "testuser@example.com"
    password = "wrongpassword"
} | ConvertTo-Json

try {
    $wrongResponse = Invoke-WebRequest -Uri "$baseUrl/login" `
        -Method POST `
        -Body $wrongPasswordBody `
        -ContentType "application/json"
    
    Write-Host "✗ Should have failed with invalid credentials" -ForegroundColor Red
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.message -match "Invalid") {
        Write-Host "✓ Correctly rejected invalid password" -ForegroundColor Green
        Write-Host "Error: $($errorMessage.message)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($errorMessage.message)`n" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# Test 5: Login with non-existent email
Write-Host "5. Testing POST /login (non-existent email)" -ForegroundColor Yellow
$noUserBody = @{
    email = "nonexistent@example.com"
    password = "password123"
} | ConvertTo-Json

try {
    $noUserResponse = Invoke-WebRequest -Uri "$baseUrl/login" `
        -Method POST `
        -Body $noUserBody `
        -ContentType "application/json"
    
    Write-Host "✗ Should have failed with invalid credentials" -ForegroundColor Red
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.message -match "Invalid") {
        Write-Host "✓ Correctly rejected non-existent email" -ForegroundColor Green
        Write-Host "Error: $($errorMessage.message)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($errorMessage.message)`n" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# Test 6: Access protected route /me
Write-Host "6. Testing GET /me (with valid token)" -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $accessToken"
}

try {
    $meResponse = Invoke-WebRequest -Uri "$baseUrl/me" `
        -Method GET `
        -Headers $headers
    
    Write-Host "✓ Successfully accessed protected route" -ForegroundColor Green
    $meData = $meResponse.Content | ConvertFrom-Json
    Write-Host "User: $($meData.user.name) ($($meData.user.email))" -ForegroundColor Gray
    Write-Host "Role: $($meData.user.role)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ /me failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)`n" -ForegroundColor Red
}

Start-Sleep -Seconds 1

# Test 7: Access /me without token
Write-Host "7. Testing GET /me (without token)" -ForegroundColor Yellow
try {
    $noTokenResponse = Invoke-WebRequest -Uri "$baseUrl/me" -Method GET
    Write-Host "✗ Should have failed without token" -ForegroundColor Red
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.message -match "No token provided") {
        Write-Host "✓ Correctly rejected request without token" -ForegroundColor Green
        Write-Host "Error: $($errorMessage.message)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($errorMessage.message)`n" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# Test 8: Access /me with invalid token
Write-Host "8. Testing GET /me (with invalid token)" -ForegroundColor Yellow
$invalidHeaders = @{
    "Authorization" = "Bearer invalid_token_here"
}

try {
    $invalidResponse = Invoke-WebRequest -Uri "$baseUrl/me" `
        -Method GET `
        -Headers $invalidHeaders
    Write-Host "✗ Should have failed with invalid token" -ForegroundColor Red
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.message -match "Invalid token") {
        Write-Host "✓ Correctly rejected invalid token" -ForegroundColor Green
        Write-Host "Error: $($errorMessage.message)`n" -ForegroundColor Gray
    } else {
        Write-Host "✗ Unexpected error: $($errorMessage.message)`n" -ForegroundColor Red
    }
}

Start-Sleep -Seconds 1

# Test 9: Logout
Write-Host "9. Testing POST /logout" -ForegroundColor Yellow
try {
    $logoutResponse = Invoke-WebRequest -Uri "$baseUrl/logout" `
        -Method POST `
        -WebSession $loginSession
    
    Write-Host "✓ Logout successful" -ForegroundColor Green
    $logoutData = $logoutResponse.Content | ConvertFrom-Json
    Write-Host "Message: $($logoutData.message)`n" -ForegroundColor Gray
} catch {
    Write-Host "✗ Logout failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)`n" -ForegroundColor Red
}

Write-Host "`n=== Auth Routes Testing Complete ===" -ForegroundColor Cyan
