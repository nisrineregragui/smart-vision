import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import axios from 'axios';
import { PieChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
//machine ip address
const HOST = 'http://192.168.11.142:8001';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Scan = {
  id: string;
  prediction: string;
  confidence: number;
  created_at: string;
};

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#2D7A4D',
  Blast: '#E05C5C',
  'Brown Rust': '#D4833F',
  Septoria: '#7B61FF',
  'Yellow Rust': '#F5C842',
};

const DISEASE_ICONS: Record<string, string> = {
  Healthy: 'checkmark-circle',
  Blast: 'warning',
  'Brown Rust': 'alert-circle',
  Septoria: 'alert',
  'Yellow Rust': 'alert-circle',
};


function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      if (!token) {
        setError('You must be logged in to view history');
        return;
      }
      const response = await axios.get(`${HOST}/scans/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setScans(response.data.scans || []);
      setError(null);
    } catch (e: any) {
      console.error(e);
      setError('Failed to load scan history. Is the server running?');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHistory();
  }, [fetchHistory]);

 //pie chart data 
  const healthyCount = scans.filter((s) => s.prediction === 'Healthy').length;
  const diseasedCount = scans.length - healthyCount;

  const ALL_CLASSES = ['Healthy', 'Blast', 'Brown Rust', 'Septoria', 'Yellow Rust'] as const;

  const pieData = ALL_CLASSES
    .map((cls) => ({
      name: cls,
      count: scans.filter((s) => s.prediction === cls).length,
      color: DISEASE_COLORS[cls],
      legendFontColor: '#444',
      legendFontSize: 12,
    }))
    .filter((entry) => entry.count > 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#2D7A4D"
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Scan History</Text>
          <Text style={styles.headerSubtitle}>Last 30 days</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2D7A4D" />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Ionicons name="cloud-offline-outline" size={48} color="#ccc" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchHistory}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : scans.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="time-outline" size={60} color="#ccc" />
            <Text style={styles.emptyTitle}>No scans yet</Text>
            <Text style={styles.emptySubtitle}>
              Analyse a wheat image from the Analyse tab and it will appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* Stats Strip */}
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{scans.length}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#2D7A4D' }]}>
                <Text style={[styles.statValue, { color: '#2D7A4D' }]}>
                  {healthyCount}
                </Text>
                <Text style={styles.statLabel}>Healthy</Text>
              </View>
              <View style={[styles.statCard, { borderColor: '#E05C5C' }]}>
                <Text style={[styles.statValue, { color: '#E05C5C' }]}>
                  {diseasedCount}
                </Text>
                <Text style={styles.statLabel}>Diseased</Text>
              </View>
            </View>

            {/* Pie Chart */}
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Breakdown by Disease</Text>
              <PieChart
                data={pieData}
                width={SCREEN_WIDTH - 64}
                height={180}
                chartConfig={{
                  color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                  backgroundColor: '#fff',
                  backgroundGradientFrom: '#fff',
                  backgroundGradientTo: '#fff',
                }}
                accessor="count"
                backgroundColor="transparent"
                paddingLeft="12"
                absolute
              />
            </View>

            {/* Timeline */}
            <Text style={styles.sectionTitle}>Timeline</Text>
            <View style={styles.timeline}>
              {scans.map((scan, index) => {
                const isHealthy = scan.prediction === 'Healthy';
                const color = DISEASE_COLORS[scan.prediction] ?? '#888';
                const icon = (DISEASE_ICONS[scan.prediction] ?? 'help-circle') as any;
                const isLast = index === scans.length - 1;

                return (
                  <View key={scan.id} style={styles.timelineItem}>
                    {/* Left connector line */}
                    <View style={styles.timelineLeft}>
                      <View
                        style={[
                          styles.timelineDot,
                          { backgroundColor: color },
                        ]}
                      >
                        <Ionicons name={icon} size={14} color="#fff" />
                      </View>
                      {!isLast && <View style={styles.timelineLine} />}
                    </View>

                    {/* Card */}
                    <View style={styles.scanCard}>
                      <View style={styles.scanCardHeader}>
                        <Text
                          style={[styles.scanPrediction, { color }]}
                        >
                          {scan.prediction}
                        </Text>
                        <View
                          style={[
                            styles.confidenceBadge,
                            { backgroundColor: color + '18' },
                          ]}
                        >
                          <Text
                            style={[styles.confidenceText, { color }]}
                          >
                            {Math.round(scan.confidence * 100)}%
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.scanDate}>
                        {formatDate(scan.created_at)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
    flexGrow: 1,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.8,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
    gap: 12,
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 260,
  },
  retryButton: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#111',
    borderRadius: 24,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111',
    marginBottom: 16,
    letterSpacing: -0.2,
  },
  timeline: {
    gap: 0,
  },
  timelineItem: {
    flexDirection: 'row',
    gap: 16,
  },
  timelineLeft: {
    alignItems: 'center',
    width: 32,
  },
  timelineDot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#eee',
    marginVertical: 4,
    minHeight: 16,
  },
  scanCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  scanCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scanPrediction: {
    fontSize: 15,
    fontWeight: '700',
  },
  confidenceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  confidenceText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scanDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    fontWeight: '500',
  },
});
