import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';

import HardwareService from '../services/HardwareService';

export default function SettingsScreen() {
  const [capabilities, setCapabilities] = useState<any>(null);
  const [settings, setSettings] = useState({
    enableUWB: true,
    enableBluetooth: true,
    enableNFC: true,
    enableLightID: true,
    highAccuracy: true,
  });

  useEffect(() => {
    loadCapabilities();
  }, []);

  const loadCapabilities = async () => {
    try {
      const caps = await HardwareService.getDeviceCapabilities();
      setCapabilities(caps);
      
      // Update settings based on capabilities
      setSettings(prev => ({
        ...prev,
        enableUWB: caps.hasUWB,
        enableBluetooth: caps.hasBLE,
        enableNFC: caps.hasNFC,
      }));
    } catch (error) {
      Alert.alert('Error', 'Failed to load device capabilities');
    }
  };

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const saveSettings = () => {
    // In a real app, save to AsyncStorage or backend
    Alert.alert('Success', 'Settings saved successfully');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.title}>Device Capabilities</Text>
        
        {capabilities ? (
          <View style={styles.capabilitiesCard}>
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityText}>UWB Support</Text>
              <Text style={[styles.capabilityValue, capabilities.hasUWB ? styles.enabled : styles.disabled]}>
                {capabilities.hasUWB ? '✓ Available' : '✗ Not Available'}
              </Text>
            </View>
            
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityText}>Bluetooth</Text>
              <Text style={[styles.capabilityValue, capabilities.hasBLE ? styles.enabled : styles.disabled]}>
                {capabilities.hasBLE ? '✓ Available' : '✗ Not Available'}
              </Text>
            </View>
            
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityText}>NFC</Text>
              <Text style={[styles.capabilityValue, capabilities.hasNFC ? styles.enabled : styles.disabled]}>
                {capabilities.hasNFC ? '✓ Available' : '✗ Not Available'}
              </Text>
            </View>
            
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityText}>Flashlight</Text>
              <Text style={[styles.capabilityValue, capabilities.hasFlashlight ? styles.enabled : styles.disabled]}>
                {capabilities.hasFlashlight ? '✓ Available' : '✗ Not Available'}
              </Text>
            </View>
            
            <View style={styles.capabilityRow}>
              <Text style={styles.capabilityText}>Camera</Text>
              <Text style={[styles.capabilityValue, capabilities.hasCamera ? styles.enabled : styles.disabled]}>
                {capabilities.hasCamera ? '✓ Available' : '✗ Not Available'}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.loadingText}>Loading capabilities...</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>Feature Settings</Text>
        
        <View style={styles.settingCard}>
          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>UWB Tracking</Text>
              <Text style={styles.settingDescription}>
                Enable Ultra-Wideband for precise distance measurement
              </Text>
            </View>
            <Switch
              value={settings.enableUWB}
              onValueChange={() => toggleSetting('enableUWB')}
              disabled={!capabilities?.hasUWB}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Bluetooth Scanning</Text>
              <Text style={styles.settingDescription}>
                Scan for nearby devices using Bluetooth
              </Text>
            </View>
            <Switch
              value={settings.enableBluetooth}
              onValueChange={() => toggleSetting('enableBluetooth')}
              disabled={!capabilities?.hasBLE}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>NFC Handshake</Text>
              <Text style={styles.settingDescription}>
                Use NFC for final verification tap
              </Text>
            </View>
            <Switch
              value={settings.enableNFC}
              onValueChange={() => toggleSetting('enableNFC')}
              disabled={!capabilities?.hasNFC}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Light-ID Signaling</Text>
              <Text style={styles.settingDescription}>
                Use LED patterns for visual verification
              </Text>
            </View>
            <Switch
              value={settings.enableLightID}
              onValueChange={() => toggleSetting('enableLightID')}
            />
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>High Accuracy Mode</Text>
              <Text style={styles.settingDescription}>
                Better precision but uses more battery
              </Text>
            </View>
            <Switch
              value={settings.highAccuracy}
              onValueChange={() => toggleSetting('highAccuracy')}
            />
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={saveSettings}>
        <Text style={styles.saveButtonText}>Save Settings</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  capabilitiesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  capabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  capabilityText: {
    fontSize: 14,
    color: '#374151',
  },
  capabilityValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  enabled: {
    color: '#10B981',
  },
  disabled: {
    color: '#EF4444',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  settingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  saveButton: {
    backgroundColor: '#4F46E5',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 32,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
