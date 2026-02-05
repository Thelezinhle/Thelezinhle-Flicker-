import React from "react";
import { View, Text, StyleSheet, Button } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>✅ FlickerSecure Mobile</Text>
      <Text style={styles.text}>React Native is working!</Text>
      <Button 
        title="Test GPS Location" 
        onPress={() => alert("GPS would work here!")} 
      />
      <Button 
        title="Test Bluetooth" 
        onPress={() => alert("Bluetooth would scan here!")} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#4F46E5",
    padding: 20,
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
  },
  text: {
    color: "white",
    fontSize: 18,
    marginBottom: 30,
  },
});
