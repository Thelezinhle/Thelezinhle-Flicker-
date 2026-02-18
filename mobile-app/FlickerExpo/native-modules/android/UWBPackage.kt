/**
 * Android UWB Package Registration
 * 
 * This file registers the UWB native module with React Native.
 * Place this file in: android/app/src/main/java/com/flickersecure/UWBPackage.kt
 * after running: npx expo prebuild
 */

package com.flickersecure

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

class UWBPackage : ReactPackage {
    
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(UWBModule(reactContext))
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, ReactShadowNode<*>>> {
        return emptyList()
    }
}
