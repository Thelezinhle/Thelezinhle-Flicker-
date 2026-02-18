/**
 * Android UWB Native Module
 * 
 * This Kotlin file implements native UWB functionality for Android.
 * Requires Android 12+ (API 31+) with UWB hardware support.
 * 
 * Place this file in: android/app/src/main/java/com/flickersecure/UWBModule.kt
 * after running: npx expo prebuild
 */

package com.flickersecure

import android.content.Context
import android.os.Build
import androidx.core.uwb.RangingCapabilities
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbClientSessionScope
import androidx.core.uwb.UwbControleeSessionScope
import androidx.core.uwb.UwbManager
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.collect

class UWBModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var uwbManager: UwbManager? = null
    private var sessionScope: UwbClientSessionScope? = null
    private var rangingJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName(): String = "AndroidUWB"

    init {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                uwbManager = UwbManager.createInstance(reactContext)
            } catch (e: Exception) {
                // UWB not available on this device
            }
        }
    }

    /**
     * Check if UWB is supported on this device
     */
    @ReactMethod
    fun isSupported(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            promise.resolve(false)
            return
        }

        scope.launch {
            try {
                val capabilities = uwbManager?.clientSessionScope()
                promise.resolve(capabilities != null)
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }
    }

    /**
     * Get UWB capabilities
     */
    @ReactMethod
    fun getCapabilities(promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || uwbManager == null) {
            promise.resolve(null)
            return
        }

        scope.launch {
            try {
                val sessionScope = uwbManager?.clientSessionScope()
                val capabilities = sessionScope?.rangingCapabilities
                
                val result = Arguments.createMap().apply {
                    putBoolean("supportsDistance", capabilities?.isDistanceSupported ?: false)
                    putBoolean("supportsAzimuth", capabilities?.isAzimuthalAngleSupported ?: false)
                    putBoolean("supportsElevation", capabilities?.isElevationAngleSupported ?: false)
                    putInt("minRangingInterval", capabilities?.minRangingInterval?.toInt() ?: 0)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("UWB_ERROR", e.message)
            }
        }
    }

    /**
     * Start UWB ranging session
     * @param address The peer's UWB address (hex string)
     */
    @ReactMethod
    fun startRanging(address: String, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || uwbManager == null) {
            promise.reject("NOT_SUPPORTED", "UWB not supported on this device")
            return
        }

        scope.launch {
            try {
                // Get session scope
                val clientScope = uwbManager?.clientSessionScope()
                sessionScope = clientScope
                
                if (clientScope == null) {
                    promise.reject("NO_SESSION", "Failed to create UWB session")
                    return@launch
                }

                // Parse peer address
                val peerAddress = UwbAddress(address.hexToByteArray())
                
                // Create ranging parameters
                val params = RangingParameters(
                    uwbConfigType = RangingParameters.CONFIG_UNICAST_DS_TWR,
                    sessionId = System.currentTimeMillis().toInt(),
                    subSessionId = 0,
                    sessionKeyInfo = null,
                    subSessionKeyInfo = null,
                    complexChannel = null,
                    peerDevices = listOf(
                        RangingParameters.PeerDevice(peerAddress)
                    ),
                    updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC
                )

                // Start ranging
                rangingJob = scope.launch {
                    clientScope.prepareSession(params).collect { result ->
                        handleRangingResult(result)
                    }
                }

                promise.resolve(address)
            } catch (e: Exception) {
                promise.reject("START_ERROR", e.message)
            }
        }
    }

    /**
     * Stop UWB ranging session
     */
    @ReactMethod
    fun stopRanging(promise: Promise) {
        rangingJob?.cancel()
        rangingJob = null
        sessionScope = null
        promise.resolve(null)
    }

    /**
     * Get current ranging result
     */
    @ReactMethod
    fun getRangingResult(promise: Promise) {
        // In real implementation, return last cached result
        promise.resolve(null)
    }

    /**
     * Handle ranging results and emit events to JS
     */
    private fun handleRangingResult(result: RangingResult) {
        when (result) {
            is RangingResult.RangingResultPosition -> {
                val distance = result.position.distance?.value ?: return
                val azimuth = result.position.azimuth?.value ?: 0f
                val elevation = result.position.elevation?.value ?: 0f

                val params = Arguments.createMap().apply {
                    putDouble("distance", distance.toDouble())
                    putDouble("azimuth", azimuth.toDouble())
                    putDouble("elevation", elevation.toDouble())
                    putString("peerAddress", result.device.address.toString())
                }

                sendEvent("onUWBDistanceUpdate", params)
            }
            is RangingResult.RangingResultPeerDisconnected -> {
                sendEvent("onUWBPeerDisconnected", Arguments.createMap())
            }
        }
    }

    /**
     * Send event to JavaScript
     */
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    /**
     * Helper extension to convert hex string to byte array
     */
    private fun String.hexToByteArray(): ByteArray {
        val len = length
        val data = ByteArray(len / 2)
        var i = 0
        while (i < len) {
            data[i / 2] = ((Character.digit(this[i], 16) shl 4) + Character.digit(this[i + 1], 16)).toByte()
            i += 2
        }
        return data
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
    }
}
