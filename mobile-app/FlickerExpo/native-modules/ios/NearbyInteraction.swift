/**
 * iOS NearbyInteraction Native Module
 * 
 * This Swift file implements the native UWB functionality for iOS.
 * It will be compiled when you run: npx expo prebuild && npx expo run:ios
 * 
 * Place this file in: ios/FlickerSecure/NearbyInteraction.swift
 * after running prebuild.
 */

import Foundation
import NearbyInteraction
import React

@objc(NearbyInteraction)
class NearbyInteraction: RCTEventEmitter, NISessionDelegate {
    
    private var session: NISession?
    private var myToken: NIDiscoveryToken?
    private var hasListeners = false
    
    override init() {
        super.init()
    }
    
    // MARK: - RCTEventEmitter
    
    override static func requiresMainQueueSetup() -> Bool {
        return true
    }
    
    override func supportedEvents() -> [String]! {
        return ["onDistanceUpdate", "onDirectionUpdate", "onSessionError", "onPeerConnected", "onPeerDisconnected"]
    }
    
    override func startObserving() {
        hasListeners = true
    }
    
    override func stopObserving() {
        hasListeners = false
    }
    
    // MARK: - Exported Methods
    
    @objc
    func isSupported(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            resolve(NISession.isSupported)
        } else {
            resolve(false)
        }
    }
    
    @objc
    func startSession(_ targetIdentifier: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            guard NISession.isSupported else {
                reject("NOT_SUPPORTED", "NearbyInteraction is not supported on this device", nil)
                return
            }
            
            DispatchQueue.main.async {
                self.session = NISession()
                self.session?.delegate = self
                
                // Generate and store discovery token
                if let token = self.session?.discoveryToken {
                    self.myToken = token
                    // In a real implementation, you would exchange tokens with the peer
                    // For now, we create a simulated session
                    resolve(targetIdentifier)
                } else {
                    reject("NO_TOKEN", "Failed to get discovery token", nil)
                }
            }
        } else {
            reject("NOT_SUPPORTED", "iOS 14+ required for NearbyInteraction", nil)
        }
    }
    
    @objc
    func stopSession(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        if #available(iOS 14.0, *) {
            session?.invalidate()
            session = nil
            resolve(nil)
        } else {
            resolve(nil)
        }
    }
    
    @objc
    func getDistance(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        // This would return the last known distance
        // In real implementation, distance comes from delegate callbacks
        resolve(nil)
    }
    
    @objc
    func getDirection(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
        // This would return the last known direction
        // In real implementation, direction comes from delegate callbacks
        resolve(nil)
    }
    
    // MARK: - NISessionDelegate
    
    @available(iOS 14.0, *)
    func session(_ session: NISession, didUpdate nearbyObjects: [NINearbyObject]) {
        guard hasListeners else { return }
        
        for object in nearbyObjects {
            // Distance
            if let distance = object.distance {
                sendEvent(withName: "onDistanceUpdate", body: [
                    "identifier": object.discoveryToken.description,
                    "distance": distance
                ])
            }
            
            // Direction (azimuth/elevation)
            if let direction = object.direction {
                let azimuth = atan2(direction.x, direction.z) * 180 / .pi
                let elevation = atan2(direction.y, sqrt(direction.x * direction.x + direction.z * direction.z)) * 180 / .pi
                
                sendEvent(withName: "onDirectionUpdate", body: [
                    "identifier": object.discoveryToken.description,
                    "azimuth": azimuth,
                    "elevation": elevation
                ])
            }
        }
    }
    
    @available(iOS 14.0, *)
    func session(_ session: NISession, didRemove nearbyObjects: [NINearbyObject], reason: NINearbyObject.RemovalReason) {
        guard hasListeners else { return }
        
        for object in nearbyObjects {
            sendEvent(withName: "onPeerDisconnected", body: [
                "identifier": object.discoveryToken.description,
                "reason": reason == .timeout ? "timeout" : "peerEnded"
            ])
        }
    }
    
    @available(iOS 14.0, *)
    func sessionWasSuspended(_ session: NISession) {
        guard hasListeners else { return }
        sendEvent(withName: "onSessionError", body: ["error": "Session suspended"])
    }
    
    @available(iOS 14.0, *)
    func session(_ session: NISession, didInvalidateWith error: Error) {
        guard hasListeners else { return }
        sendEvent(withName: "onSessionError", body: ["error": error.localizedDescription])
    }
}
