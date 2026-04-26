import { Tabs, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { HapticTab } from '@/components/haptic-tab';
import { Ionicons } from '@expo/vector-icons';

//tab bar layout
export default function TabLayout() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
//check if user is logged in
  useEffect(() => {
    async function checkAuth() {
      try {
        const token = await SecureStore.getItemAsync('token');
        if (!token) {
          router.replace('/');
        } else {
          setIsReady(true);
        }
      } catch {
        router.replace('/');
      }
    }
    checkAuth();
  }, [router]);
//loading screen
  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2D7A4D" />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2D7A4D', 
        tabBarInactiveTintColor: '#888888',
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: '#FDFBF7', 
          borderTopWidth: 0,
          elevation: 0, 
          shadowOpacity: 0, 
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        }
      }}>
      {/*tab bar screens*/}
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="chatbubble-outline" color={color} />,
        }}
      />
      {/*news tab*/}
      <Tabs.Screen
        name="index"
        options={{
          title: 'News',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="newspaper-outline" color={color} />,
        }}
      />
      {/*analyse tab*/}
      <Tabs.Screen
        name="analyse"
        options={{
          title: 'Analyse',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="flask-outline" color={color} />,
        }}
      />
      {/*history tab*/}
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <Ionicons size={24} name="pie-chart-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}
//styles
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FDFBF7',
  },
});
