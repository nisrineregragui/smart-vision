import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

//analyse screen
export default function HomeScreen() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ prediction: string, confidence: number } | null>(null);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setResult(null);
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert("Permission required", "You've refused to allow this app to access your camera!! Please allow camera permission in settings <3");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      setImage(result.assets[0].uri);
      setResult(null);
    }
  }

  const handleScan = async () => {
    if (!image) return;

    setLoading(true);
    try {
      const formData = new FormData();
      const filename = image.split('/').pop() || 'image.jpg';
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image`;

      if (Platform.OS === 'web') {
        const res = await fetch(image);
        const blob = await res.blob();
        formData.append('file', blob, filename);
      } else {
        formData.append('file', { 
          uri: Platform.OS === 'ios' ? image.replace('file://', '') : image, 
          name: filename, 
          type 
        } as any);
      }

      //machine ip address
      const host = 'http://192.168.11.142:8001';

      const token = await SecureStore.getItemAsync('token');

      const response = await axios.post(`${host}/predict`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      setResult({
        prediction: response.data.prediction,
        confidence: response.data.confidence
      });
    } catch (error) {
      console.error(error);
      Alert.alert('Analysis Failed', 'Could not process the image. Is the backend server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.header}>Smart Vision</Text>
        <Text style={styles.subtitle}>Wheat Disease Detection</Text>

        <View style={styles.imageContainer}>
          {image ? (
            <Image source={{ uri: image }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Text style={styles.placeholderText}>NO IMAGE SELECTED</Text>
            </View>
          )}
        </View>

        {result && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultTitle}>{result.prediction.toUpperCase()}</Text>
            <Text style={styles.resultConfidence}>
              {Math.round(result.confidence * 100)}% Confidence
            </Text>
          </View>
        )}

        <View style={styles.controls}>
          {!image || result ? (
            <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.button, styles.actionButton, styles.buttonOutline]} onPress={takePhoto}>
                    <Text style={styles.buttonOutlineText}>Camera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.button, styles.actionButton, styles.buttonOutline]} onPress={pickImage}>
                    <Text style={styles.buttonOutlineText}>Gallery</Text>
                </TouchableOpacity>
            </View>
          ) : null}

          {image && !result ? (
            <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleScan} disabled={loading}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonPrimaryText}>ANALYZE</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
  },
  header: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 40,
  },
  imageContainer: {
    width: 320,
    height: 320,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#f4f4f4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderCurve: 'continuous',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: '#aaa',
    fontSize: 12,
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  controls: {
    width: '100%',
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 32,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 16,
  },
  button: {
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
  },
  buttonPrimary: {
    backgroundColor: '#000',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4,
  },
  buttonPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  buttonOutline: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#000',
  },
  buttonOutlineText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  resultContainer: {
    alignItems: 'center',
    marginTop: 8,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -0.5,
  },
  resultConfidence: {
    fontSize: 15,
    color: '#666',
    marginTop: 6,
    fontWeight: '500',
  }
});
