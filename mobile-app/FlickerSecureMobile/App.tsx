import React from "react";
import { View, Text, StyleSheet } from "react-native";

function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FlickerSecure Mobile</Text>
      <Text style={styles.text}>App is starting...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
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
  },
});

export default App;
