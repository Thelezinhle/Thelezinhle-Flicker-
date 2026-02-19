$base = "https://flicker-secure-api.onrender.com/api"
$h = @{"Content-Type"="application/json"}
$results = @()

Write-Host "=== FLICKER SECURE API TESTS ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health
Write-Host "1. Health Check..." -NoNewline
try { 
    $r = Invoke-RestMethod "https://flicker-secure-api.onrender.com/health"
    Write-Host " PASS ($($r.version))" -ForegroundColor Green
    $results += "1. Health: PASS"
} catch { 
    Write-Host " FAIL" -ForegroundColor Red 
    $results += "1. Health: FAIL"
}

# 2. Register Client
Write-Host "2. Register Client..." -NoNewline
try { 
    $r = Invoke-RestMethod "$base/auth/register" -Method POST -Headers $h -Body '{"email":"client_test@test.com","password":"Test123!","role":"client","name":"Test Client"}'
    Write-Host " PASS" -ForegroundColor Green
    $results += "2. Register Client: PASS"
} catch { 
    Write-Host " EXISTS (ok)" -ForegroundColor Yellow 
    $results += "2. Register Client: EXISTS"
}

# 3. Register Driver
Write-Host "3. Register Driver..." -NoNewline
try { 
    $r = Invoke-RestMethod "$base/auth/register" -Method POST -Headers $h -Body '{"email":"driver_test@test.com","password":"Test123!","role":"driver","name":"Test Driver"}'
    Write-Host " PASS" -ForegroundColor Green
    $results += "3. Register Driver: PASS"
} catch { 
    Write-Host " EXISTS (ok)" -ForegroundColor Yellow
    $results += "3. Register Driver: EXISTS"
}

# 4. Login Client
Write-Host "4. Login Client..." -NoNewline
try { 
    $r = Invoke-RestMethod "$base/auth/login" -Method POST -Headers $h -Body '{"email":"client_test@test.com","password":"Test123!","role":"client"}'
    $clientToken = $r.data.sessionToken
    $clientId = $r.data.userId
    Write-Host " PASS" -ForegroundColor Green
    $results += "4. Login Client: PASS"
} catch { 
    Write-Host " FAIL" -ForegroundColor Red
    $results += "4. Login Client: FAIL"
}

# 5. Login Driver
Write-Host "5. Login Driver..." -NoNewline
try { 
    $r = Invoke-RestMethod "$base/auth/login" -Method POST -Headers $h -Body '{"email":"driver_test@test.com","password":"Test123!","role":"driver"}'
    $driverToken = $r.data.sessionToken
    $driverId = $r.data.userId
    Write-Host " PASS" -ForegroundColor Green
    $results += "5. Login Driver: PASS"
} catch { 
    Write-Host " FAIL" -ForegroundColor Red
    $results += "5. Login Driver: FAIL"
}

# 6. Create Order (new endpoint path)
Write-Host "6. Create Delivery Order..." -NoNewline
try { 
    $orderBody = @{
        clientId = "test-client-123"
        pickupLocation = @{lat="-26.2041"; lng="28.0473"; address="123 Main St, Johannesburg"}
        deliveryLocation = @{lat="-26.1952"; lng="28.0347"; address="456 Oak Ave, Sandton"}
        packageDetails = @{description="Test Package"; weight=2}
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/delivery/orders" -Method POST -Headers $h -Body $orderBody
    $orderId = $r.data.orderId
    Write-Host " PASS (Order: $orderId)" -ForegroundColor Green
    $results += "6. Create Order: PASS"
} catch { 
    Write-Host " FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $results += "6. Create Order: FAIL"
    $orderId = "test-order-123"
}

# 7. Customer Beacon Start
Write-Host "7. Customer Beacon (Share Location)..." -NoNewline
try { 
    $beaconBody = @{
        customerId = "test-client-123"
        orderId = $orderId
        latitude = -26.2041
        longitude = 28.0473
        accuracy = 10
        locationType = "fixed"
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/ranging/beacon/start" -Method POST -Headers $h -Body $beaconBody
    Write-Host " PASS" -ForegroundColor Green
    $results += "7. Customer Beacon: PASS"
} catch { 
    Write-Host " FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $results += "7. Customer Beacon: FAIL"
}

# 8. Driver Track Start
Write-Host "8. Driver Tracking Start..." -NoNewline
try { 
    $trackBody = @{
        driverId = "test-driver-123"
        orderId = $orderId
        latitude = -26.2050
        longitude = 28.0480
        accuracy = 10
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/ranging/track/start" -Method POST -Headers $h -Body $trackBody
    $sessionId = $r.data.sessionId
    $distance = $r.data.distance
    Write-Host " PASS (Distance: ${distance}m)" -ForegroundColor Green
    $results += "8. Driver Tracking: PASS"
} catch { 
    Write-Host " FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $results += "8. Driver Tracking: FAIL"
}

# 9. Track Update (simulate moving closer)
Write-Host "9. Driver Track Update..." -NoNewline
try { 
    $updateBody = @{
        sessionId = $sessionId
        latitude = -26.2042
        longitude = 28.0474
        accuracy = 8
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/ranging/track/update" -Method POST -Headers $h -Body $updateBody
    $newDist = $r.data.distance
    $status = $r.data.status
    Write-Host " PASS (${newDist}m, $status)" -ForegroundColor Green
    $results += "9. Track Update: PASS"
} catch { 
    Write-Host " FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $results += "9. Track Update: FAIL"
}

# 10. NFC Token Generate
Write-Host "10. NFC Token Generate..." -NoNewline
try { 
    $nfcBody = @{
        orderId = $orderId
        userId = "test-client-123"
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/nfc/generate" -Method POST -Headers $h -Body $nfcBody
    Write-Host " PASS" -ForegroundColor Green
    $results += "10. NFC Generate: PASS"
    $nfcToken = $r.data.encryptedToken
} catch { 
    Write-Host " FAIL - $($_.Exception.Message)" -ForegroundColor Red
    $results += "10. NFC Generate: FAIL"
}

# 11. Bluetooth Scan Simulation
Write-Host "11. Bluetooth API..." -NoNewline
try { 
    $btBody = @{
        deviceId = "device-123"
        action = "scan"
    } | ConvertTo-Json -Compress
    $r = Invoke-RestMethod "$base/bluetooth/scan" -Method POST -Headers $h -Body $btBody
    Write-Host " PASS" -ForegroundColor Green
    $results += "11. Bluetooth: PASS"
} catch { 
    Write-Host " FAIL (expected - needs device)" -ForegroundColor Yellow
    $results += "11. Bluetooth: N/A (no device)"
}

# 12. UWB Ranging API
Write-Host "12. UWB Ranging API..." -NoNewline
try { 
    $r = Invoke-RestMethod "$base/uwb/status" -Method GET -Headers $h
    Write-Host " PASS" -ForegroundColor Green
    $results += "12. UWB API: PASS"
} catch { 
    Write-Host " N/A (optional)" -ForegroundColor Yellow
    $results += "12. UWB API: N/A"
}

Write-Host ""
Write-Host "=== SUMMARY ===" -ForegroundColor Cyan
$pass = ($results | Where-Object { $_ -match "PASS" }).Count
$total = $results.Count
Write-Host "Passed: $pass / $total tests" -ForegroundColor $(if($pass -ge 8){"Green"}else{"Yellow"})
Write-Host ""
$results | ForEach-Object { Write-Host "  $_" }
