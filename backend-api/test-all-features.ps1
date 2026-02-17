# FlickerSecure Comprehensive Test Script
# Tests all backend features: Delivery, Bluetooth, UWB, NFC, Blockchain

$baseUrl = "http://localhost:5000"
$passed = 0
$failed = 0

function Test-Endpoint {
    param($Name, $Method, $Url, $Body)
    
    Write-Host "`n[$Method] $Name" -ForegroundColor Cyan
    try {
        if ($Body) {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 5) -ErrorAction Stop
        } else {
            $response = Invoke-RestMethod -Uri $Url -Method $Method -ErrorAction Stop
        }
        Write-Host "  PASS" -ForegroundColor Green
        $script:passed++
        return $response
    } catch {
        Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $script:failed++
        return $null
    }
}

Write-Host "============================================" -ForegroundColor Yellow
Write-Host "     FlickerSecure Feature Test Suite      " -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow

# ============== 1. DELIVERY TRACKING ==============
Write-Host "`n=== DELIVERY TRACKING ===" -ForegroundColor Magenta

Test-Endpoint "Get Demo Delivery" "GET" "$baseUrl/api/delivery/sample-order-123"

$newDelivery = Test-Endpoint "Create New Delivery" "POST" "$baseUrl/api/delivery/orders" @{
    orderId = "order-test-" + (Get-Date -Format 'yyyyMMddHHmmss')
    deliveryPersonId = "driver-test-001"
    customerId = "recipient-test-001"
    customerLocation = @{ latitude = -26.1917; longitude = 28.0328; address = "123 Test St" }
    restaurantLocation = @{ latitude = -26.2100; longitude = 28.0500; address = "Restaurant ABC" }
    estimatedDistance = 2500
}

if ($newDelivery) {
    $orderId = $newDelivery.data.orderId
    Test-Endpoint "Get Created Delivery" "GET" "$baseUrl/api/delivery/$orderId"
    
    Test-Endpoint "Update Driver Location" "POST" "$baseUrl/api/delivery/orders/$orderId/location" @{
        latitude = -26.1950
        longitude = 28.0350
        accuracy = 5
        speed = 10
    }
    
    Test-Endpoint "Get Location History" "GET" "$baseUrl/api/delivery/orders/$orderId/history"
}

Test-Endpoint "List Active Deliveries" "GET" "$baseUrl/api/delivery/orders"

# ============== 2. BLUETOOTH 6.0 CHANNEL SOUNDING ==============
Write-Host "`n=== BLUETOOTH 6.0 CHANNEL SOUNDING ===" -ForegroundColor Magenta

Test-Endpoint "Bluetooth Status" "GET" "$baseUrl/api/bluetooth/status"

$btSession = Test-Endpoint "Create Bluetooth Session" "POST" "$baseUrl/api/bluetooth/session" @{
    deliveryId = "test-delivery-bt-001"
    driverId = "driver-bt-001"
    recipientId = "recipient-bt-001"
}

if ($btSession) {
    $btSessionId = $btSession.data.sessionId
    
    Test-Endpoint "Start Bluetooth Discovery" "POST" "$baseUrl/api/bluetooth/discovery/start" @{
        sessionId = $btSessionId
    }
    
    Test-Endpoint "Submit Ranging Data (30m)" "POST" "$baseUrl/api/bluetooth/ranging" @{
        sessionId = $btSessionId
        deviceId = "device-bt-001"
        rssi = -70
        txPower = -59
    }
    
    Test-Endpoint "Submit Ranging Data (10m)" "POST" "$baseUrl/api/bluetooth/ranging" @{
        sessionId = $btSessionId
        deviceId = "device-bt-001"
        rssi = -60
        txPower = -59
    }
    
    Test-Endpoint "Get Device Distance" "GET" "$baseUrl/api/bluetooth/distance/device-bt-001"
    
    Test-Endpoint "Calibrate Device" "POST" "$baseUrl/api/bluetooth/calibrate" @{
        deviceId = "device-bt-001"
        knownDistance = 5
        measuredRssi = -65
        environment = "indoor"
    }
    
    Test-Endpoint "Stop Discovery" "POST" "$baseUrl/api/bluetooth/discovery/stop" @{
        sessionId = $btSessionId
    }
}

Test-Endpoint "Calculate Distance (Outdoor)" "POST" "$baseUrl/api/bluetooth/calculate-distance" @{
    rssi = -75
    txPower = -59
    environment = "outdoor"
}

Test-Endpoint "Calculate Distance (Indoor)" "POST" "$baseUrl/api/bluetooth/calculate-distance" @{
    rssi = -75
    txPower = -59
    environment = "indoor"
}

# ============== 3. UWB RANGING ==============
Write-Host "`n=== UWB RANGING ===" -ForegroundColor Magenta

Test-Endpoint "UWB Status" "GET" "$baseUrl/api/uwb/status"

Test-Endpoint "Register UWB Device (Driver)" "POST" "$baseUrl/api/uwb/device/register" @{
    deviceId = "uwb-driver-001"
    capabilities = @{
        hasAngleOfArrival = $true
        maxRangeMeters = 50
    }
}

Test-Endpoint "Register UWB Device (Recipient)" "POST" "$baseUrl/api/uwb/device/register" @{
    deviceId = "uwb-recipient-001"
    capabilities = @{
        hasAngleOfArrival = $true
        maxRangeMeters = 50
    }
}

$uwbSession = Test-Endpoint "Create UWB Session" "POST" "$baseUrl/api/uwb/session" @{
    deliveryId = "test-delivery-uwb-001"
    driverDeviceId = "uwb-driver-001"
    recipientDeviceId = "uwb-recipient-001"
}

if ($uwbSession) {
    $uwbSessionId = $uwbSession.data.sessionId
    
    Test-Endpoint "Start UWB Session" "POST" "$baseUrl/api/uwb/session/$uwbSessionId/start"
    
    Test-Endpoint "Submit UWB Ranging (5m)" "POST" "$baseUrl/api/uwb/ranging" @{
        sessionId = $uwbSessionId
        deviceId = "uwb-driver-001"
        distance = 5.0
        azimuth = 45
        elevation = 10
        confidence = 0.98
    }
    
    Test-Endpoint "Submit UWB Ranging (2m - Close)" "POST" "$baseUrl/api/uwb/ranging" @{
        sessionId = $uwbSessionId
        deviceId = "uwb-driver-001"
        distance = 2.0
        azimuth = 30
        elevation = 5
        confidence = 0.99
    }
    
    Test-Endpoint "Get UWB Distance" "GET" "$baseUrl/api/uwb/distance/$uwbSessionId"
}

# ============== 4. NFC VERIFICATION ==============
Write-Host "`n=== NFC VERIFICATION (PROOF OF PRESENCE) ===" -ForegroundColor Magenta

Test-Endpoint "NFC Status" "GET" "$baseUrl/api/nfc/status"

$nfcSession = Test-Endpoint "Create NFC Session" "POST" "$baseUrl/api/nfc/session" @{
    deliveryId = "test-delivery-nfc-001"
    driverId = "driver-nfc-001"
    recipientId = "recipient-nfc-001"
}

if ($nfcSession) {
    $nfcSessionId = $nfcSession.data.sessionId
    $verificationCode = $nfcSession.data.verificationCode
    Write-Host "  Verification Code: $verificationCode" -ForegroundColor Yellow
    
    Test-Endpoint "Prepare NFC Session" "POST" "$baseUrl/api/nfc/session/$nfcSessionId/prepare"
    
    Test-Endpoint "Get NFC Session Status" "GET" "$baseUrl/api/nfc/session/$nfcSessionId"
    
    $verification = Test-Endpoint "Verify NFC (Proof of Presence)" "POST" "$baseUrl/api/nfc/verify" @{
        sessionId = $nfcSessionId
        nfcData = "nfc-tap-data-123"
        deviceId = "device-nfc-001"
        location = @{
            latitude = -26.1917
            longitude = 28.0328
        }
    }
    
    if ($verification) {
        Write-Host "  Proof Hash: $($verification.data.proofOfPresence.hash.Substring(0, 32))..." -ForegroundColor Green
        Write-Host "  Signature: $($verification.data.proofOfPresence.signature.Substring(0, 32))..." -ForegroundColor Green
    }
    
    Test-Endpoint "Check Delivery Verified" "GET" "$baseUrl/api/nfc/delivery/test-delivery-nfc-001/verified"
}

Test-Endpoint "Generate Signature" "POST" "$baseUrl/api/nfc/signature" @{
    data = @{
        deliveryId = "test-123"
        timestamp = (Get-Date).ToString("o")
    }
}

# ============== 5. BLOCKCHAIN (SOLANA) ==============
Write-Host "`n=== BLOCKCHAIN (SOLANA) ===" -ForegroundColor Magenta

Test-Endpoint "Blockchain Status" "GET" "$baseUrl/api/blockchain/status"

$wallet = Test-Endpoint "Generate Wallet" "GET" "$baseUrl/api/blockchain/generate-wallet"
if ($wallet) {
    Write-Host "  Wallet: $($wallet.data.publicKey)" -ForegroundColor Yellow
    Write-Host "  Network: $($wallet.data.network)" -ForegroundColor Yellow
}

Test-Endpoint "Get Balance" "GET" "$baseUrl/api/blockchain/balance"

# ============== 6. FULL DELIVERY FLOW ==============
Write-Host "`n=== FULL DELIVERY FLOW TEST ===" -ForegroundColor Magenta

# Step 1: Create delivery
$delivery = Test-Endpoint "1. Create Delivery" "POST" "$baseUrl/api/delivery/orders" @{
    orderId = "order-flow-" + (Get-Date -Format 'yyyyMMddHHmmss')
    deliveryPersonId = "driver-flow-001"
    customerId = "recipient-flow-001"
    customerLocation = @{ latitude = -26.1917; longitude = 28.0328; address = "123 Customer St" }
    restaurantLocation = @{ latitude = -26.2100; longitude = 28.0500; address = "Restaurant XYZ" }
    estimatedDistance = 2500
}

if ($delivery) {
    $flowOrderId = $delivery.data.orderId
    
    # Step 2: Bluetooth ranging while approaching (50m)
    $btFlow = Test-Endpoint "2. Bluetooth Session (50m range)" "POST" "$baseUrl/api/bluetooth/session" @{
        deliveryId = $flowOrderId
        driverId = "driver-flow-001"
        recipientId = "recipient-flow-001"
    }
    
    if ($btFlow) {
        Test-Endpoint "   Submit BT Ranging (45m)" "POST" "$baseUrl/api/bluetooth/ranging" @{
            sessionId = $btFlow.data.sessionId
            deviceId = "flow-device-001"
            rssi = -80
            txPower = -59
        }
    }
    
    # Step 3: UWB handover when close (3-10m)
    $uwbFlow = Test-Endpoint "3. UWB Handover (3-10m range)" "POST" "$baseUrl/api/uwb/session" @{
        deliveryId = $flowOrderId
        driverDeviceId = "driver-flow-001"
        recipientDeviceId = "recipient-flow-001"
    }
    
    if ($uwbFlow) {
        Test-Endpoint "   UWB Start" "POST" "$baseUrl/api/uwb/session/$($uwbFlow.data.sessionId)/start"
        Test-Endpoint "   Submit UWB Ranging (2.5m)" "POST" "$baseUrl/api/uwb/ranging" @{
            sessionId = $uwbFlow.data.sessionId
            deviceId = "driver-flow-001"
            distance = 2.5
            azimuth = 20
            confidence = 0.97
        }
    }
    
    # Step 4: NFC verification for handoff (<1m)
    $nfcFlow = Test-Endpoint "4. NFC Verification (<1m)" "POST" "$baseUrl/api/nfc/session" @{
        deliveryId = $flowOrderId
        driverId = "driver-flow-001"
        recipientId = "recipient-flow-001"
    }
    
    if ($nfcFlow) {
        Test-Endpoint "   NFC Prepare" "POST" "$baseUrl/api/nfc/session/$($nfcFlow.data.sessionId)/prepare"
        $proof = Test-Endpoint "   NFC Verify + Proof of Presence" "POST" "$baseUrl/api/nfc/verify" @{
            sessionId = $nfcFlow.data.sessionId
            nfcData = "handoff-tap"
            deviceId = "recipient-flow-device"
            location = @{ latitude = -26.1917; longitude = 28.0328 }
        }
        
        if ($proof) {
            Write-Host "`n  DELIVERY VERIFIED!" -ForegroundColor Green
            Write-Host "  Proof Hash: $($proof.data.proofOfPresence.hash)" -ForegroundColor White
        }
    }
    
    # Step 5: Mark delivery complete
    Test-Endpoint "5. Complete Delivery" "PUT" "$baseUrl/api/delivery/orders/$flowOrderId/complete"
}

# ============== SUMMARY ==============
Write-Host "`n============================================" -ForegroundColor Yellow
Write-Host "              TEST SUMMARY                  " -ForegroundColor Yellow
Write-Host "============================================" -ForegroundColor Yellow
Write-Host "  Passed: $passed" -ForegroundColor Green
Write-Host "  Failed: $failed" -ForegroundColor $(if($failed -gt 0){"Red"}else{"Green"})
Write-Host "  Total:  $($passed + $failed)" -ForegroundColor White
Write-Host "============================================`n" -ForegroundColor Yellow
