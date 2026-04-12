import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export default function NewsDashboard() {
  const router = useRouter();
  
  const [weatherData, setWeatherData] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(true);
  const [weatherError, setWeatherError] = useState<string | null>(null);

  const [newsData, setNewsData] = useState<any[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  const [userName, setUserName] = useState('');

  useEffect(() => {
    //fetch user name
    (async () => {
      const storedName = await SecureStore.getItemAsync('userName');
      if (storedName) {
        setUserName(storedName);
      }
    })();
    //fetch location and weather
    (async () => {
      try {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setWeatherError('Location Disabled');
          setWeatherLoading(false);
          return;
        }

        let location = await Location.getCurrentPositionAsync({});
        //machine ip address
        const host = 'http://192.168.11.142:8001';
        
        const response = await axios.get(`${host}/weather?lat=${location.coords.latitude}&lon=${location.coords.longitude}`);
        
        if (response.data.error) {
          setWeatherError(response.data.error);
        } else {
          setWeatherData(response.data);
        }
      } catch (error) {
         setWeatherError('Network Error');
      } finally {
        setWeatherLoading(false);
      }
    })();

    //fetch news
    (async () => {
      try {
        const host = 'http://192.168.11.142:8001';
        const response = await axios.get(`${host}/news`);
        if (response.data.error) {
          setNewsError(response.data.error);
        } else {
          setNewsData(response.data.articles || []);
        }
      } catch (error) {
        setNewsError('Network Error fetching news');
      } finally {
        setNewsLoading(false);
      }
    })();
  }, []);

  const renderAIInsightCard = () => (
    <View style={styles.aiInsightCard}>
      <View style={styles.aiHeaderRow}>
        <Ionicons name="hardware-chip-outline" size={24} color="#2D7A4D" />
        <Text style={styles.aiHeaderText}>AI Insight</Text>
      </View>
      <View style={styles.aiBodyRow}>
        <View style={styles.aiTextContainer}>
          <Text style={styles.aiPromptText}>🔬 Is Your Wheat Safe? Check for Yellow Rust.</Text>
          
          <TouchableOpacity style={styles.aiButton} onPress={() => router.push('/analyse')}>
            <Text style={styles.aiButtonText}>[Start a Scan 🔬]</Text>
          </TouchableOpacity>
        </View>
        <Image source={require('@/assets/images/mock_ai_wheat.png')} style={styles.aiThumbnail} contentFit="cover" />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header Segment */}
        <View style={styles.headerRow}>
          <Text style={styles.greetingText}>Good Morning, <Text style={styles.boldName}>{userName}!</Text></Text>
          <View style={styles.avatar}>
            <Ionicons name="person" size={20} color="#aba49c" />
          </View>
        </View>

        {/* Weather Widget */}
        <View style={styles.weatherCard}>
          {weatherLoading ? (
            <View style={{height: 80, justifyContent: 'center', alignItems: 'center'}}>
               <ActivityIndicator color="#2D7A4D" />
            </View>
          ) : weatherError ? (
            <View style={{height: 80, justifyContent: 'center', alignItems: 'center'}}>
               <Text style={{color: '#888'}}>{weatherError}</Text>
            </View>
          ) : (
            <>
              <View style={styles.weatherTop}>
                <Text style={styles.locationTemp}>{weatherData.city} | <Text style={styles.tempBold}>{weatherData.current_temp}</Text> {weatherData.current_emoji}</Text>
              </View>
              <View style={styles.weatherBottom}>
                {weatherData.forecasts.map((dayObj: any, index: number) => (
                    <View key={index} style={styles.weatherDay}>
                       <Text style={styles.weatherDayText}>{dayObj.day} {dayObj.emoji}</Text>
                       <Text style={styles.weatherTempText}>{dayObj.temp}</Text>
                    </View>
                ))}
              </View>
            </>
          )}
        </View>


        {/* News Section */}
        {newsLoading ? (
          <>
            <ActivityIndicator style={{marginVertical: 20}} color="#2D7A4D" />
            {renderAIInsightCard()}
          </>
        ) : newsError ? (
          <>
            <Text style={{textAlign: 'center', color: '#888', marginVertical: 20}}>{newsError}</Text>
            {renderAIInsightCard()}
          </>
        ) : newsData.length > 0 ? (
          <>
            {/* Hero News Card */}
            <TouchableOpacity activeOpacity={0.9} style={styles.heroCard} onPress={() => newsData[0].url && Linking.openURL(newsData[0].url)}>
              <Image source={{ uri: newsData[0].image || 'https://via.placeholder.com/400x200' }} style={styles.heroImage} contentFit="cover" />
              <View style={styles.heroOverlay}>
                <Text style={styles.heroText} numberOfLines={2}>{newsData[0].title}</Text>
              </View>
            </TouchableOpacity>

           
            {newsData.slice(1, 3).map((news, index) => (
              <TouchableOpacity key={index} activeOpacity={0.8} style={styles.newsCard} onPress={() => news.url && Linking.openURL(news.url)}>
                <Image source={{ uri: news.image || 'https://via.placeholder.com/80' }} style={styles.newsThumbnail} contentFit="cover" />
                <View style={styles.newsContent}>
                  <Text style={styles.newsMeta}>[{news.source}]</Text>
                  <Text style={styles.newsTitle} numberOfLines={2}>{news.title}</Text>
                  <Text style={styles.newsTime}>{new Date(news.publishedAt).toLocaleDateString()}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* Injected AI Insight Card */}
            {renderAIInsightCard()}

            {/* Remaining Standard News Cards */}
            {newsData.slice(3).map((news, index) => (
              <TouchableOpacity key={index + 3} activeOpacity={0.8} style={styles.newsCard} onPress={() => news.url && Linking.openURL(news.url)}>
                <Image source={{ uri: news.image || 'https://via.placeholder.com/80' }} style={styles.newsThumbnail} contentFit="cover" />
                <View style={styles.newsContent}>
                  <Text style={styles.newsMeta}>[{news.source}]</Text>
                  <Text style={styles.newsTitle} numberOfLines={2}>{news.title}</Text>
                  <Text style={styles.newsTime}>{new Date(news.publishedAt).toLocaleDateString()}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        ) : (
          <>
            <Text style={{textAlign: 'center', marginVertical: 20}}>No news available.</Text>
            {renderAIInsightCard()}
          </>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFBF7',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingText: {
    fontSize: 22,
    color: '#1a1a1a',
  },
  boldName: {
    fontWeight: '800',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e3dfd8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weatherCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  weatherTop: {
    alignItems: 'center',
    marginBottom: 16,
  },
  locationTemp: {
    fontSize: 16,
    color: '#333',
  },
  tempBold: {
    fontWeight: '800',
    fontSize: 18,
  },
  weatherBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weatherDay: {
    backgroundColor: '#F6F2E6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
  },
  weatherDayText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
  weatherTempText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111',
  },
  marketRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 1,
  },
  marketItem: {
    fontSize: 12,
    color: '#444',
  },
  marketBold: {
    fontWeight: '700',
    color: '#000',
  },
  greenText: {
    color: '#2A7B4C',
    fontWeight: '600',
  },
  redText: {
    color: '#B54242',
    fontWeight: '600',
  },
  heroCard: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 16,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.4)', 
  },
  heroText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  newsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
  },
  newsThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 12,
    marginRight: 16,
  },
  newsContent: {
    flex: 1,
    justifyContent: 'center',
  },
  newsMeta: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111',
    lineHeight: 18,
    marginBottom: 6,
  },
  newsTime: {
    fontSize: 11,
    color: '#999',
  },
  aiInsightCard: {
    backgroundColor: '#E8F4EC',
    borderRadius: 16,
    padding: 16,
    borderColor: '#A6D5B4',
    borderWidth: 1,
    marginBottom: 24,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  aiHeaderText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#2D7A4D',
  },
  aiBodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  aiPromptText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
    lineHeight: 20,
  },
  aiButton: {
    backgroundColor: '#2D7A4D',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  aiButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  aiThumbnail: {
    width: 70,
    height: 90,
    borderRadius: 10,
  }
});
