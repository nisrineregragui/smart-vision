import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useLocalSearchParams, useRouter } from 'expo-router';
import { CommonActions } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';

//machine ip address
const HOST = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.11.121:9001';

type Conversation = {
  id: string;
  title: string;
  updated_at: string;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  agent_name?: string;
};

type ChatSummary = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  deleted_at: string;
  summary: string;
  messages: Message[];
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}

//chat view   
//individual conversation
function ChatView({
  conversation,
  onBack,
  onArchive,
  readOnly = false,
  archiveMessages = [],
  initialInput = '',
}: {
  conversation: Conversation | ChatSummary;
  onBack: () => void;
  onArchive?: () => void;
  readOnly?: boolean;
  archiveMessages?: Message[];
  initialInput?: string;
}) {
  const [messages, setMessages] = useState<Message[]>(readOnly ? archiveMessages : []);
  const [input, setInput] = useState(initialInput);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!readOnly);
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const flatListRef = useRef<FlatList>(null);

  //get gps location once on mount
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCoords({ lat: loc.coords.latitude, lon: loc.coords.longitude });
        }
      } catch {
        //location unavailable agents will work without it
      }
    })();
  }, []);

  const fetchMessages = useCallback(async () => {
    if (readOnly) return;
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await axios.get(
        `${HOST}/chat/conversations/${conversation.id}/messages`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setMessages(res.data.messages || []);
    } catch {

    } finally {
      setFetching(false);
    }
  }, [conversation.id, readOnly]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;


    const tempMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await axios.post(
        `${HOST}/chat/conversations/${conversation.id}/messages`,
        { content: text, ...(coords ? { lat: coords.lat, lon: coords.lon } : {}) },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const assistantMsg: Message = {
        id: res.data.id,
        role: 'assistant',
        content: res.data.content,
        created_at: new Date().toISOString(),
        agent_name: res.data.agent_name,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (e: any) {
      const serverMsg = e?.response?.data?.detail || e?.message || 'Unknown error';
      Alert.alert('Error', `Failed to send message:\n${serverMsg}`);
    } finally {
      setLoading(false);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.msgRow, isUser ? styles.msgRowUser : styles.msgRowAssistant]}>
        {!isUser && (
          <View style={styles.avatarBot}>
            <Ionicons name="leaf" size={14} color="#fff" />
          </View>
        )}
        <View style={styles.msgColumn}>
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
              {item.content}
            </Text>
          </View>
          {!isUser && item.agent_name && (
            <Text style={styles.agentBadge}>{item.agent_name}</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        {/* Header */}
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#111" />
          </TouchableOpacity>
          <Text style={styles.chatHeaderTitle} numberOfLines={1}>
            {conversation.title}
          </Text>
          {!readOnly && onArchive ? (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Validate Chat',
                  'Finish and archive this conversation? A summary will be saved to your history',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Validate & Archive', onPress: onArchive }
                  ]
                );
              }}
              style={styles.validateBtn}
            >
              <Ionicons name="checkmark-circle-outline" size={26} color="#2D7A4D" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>

        {/* Messages */}
        {fetching ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#2D7A4D" />
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyChatContainer}>
                <Ionicons name="leaf-outline" size={48} color="#ccc" />
                <Text style={styles.emptyChatTitle}>Ask me anything about agronomy</Text>
                <Text style={styles.emptyChatSub}>
                  Wheat diseases, soil health, irrigation, fertilizers…
                </Text>
              </View>
            }
          />
        )}

        {/* Typing indicator */}
        {loading && (
          <View style={styles.typingRow}>
            <View style={styles.avatarBot}>
              <Ionicons name="leaf" size={14} color="#fff" />
            </View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color="#2D7A4D" />
            </View>
          </View>
        )}

        {/* Input bar */}
        {!readOnly && (
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about crops, diseases, soil…"
              placeholderTextColor="#aaa"
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

//conversations list
export default function ChatsScreen() {
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ autoStartMessage?: string; scanContext?: string }>();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [activeSummary, setActiveSummary] = useState<ChatSummary | null>(null);
  const [prefillMsg, setPrefillMsg] = useState('');

  const fetchConversations = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await axios.get(`${HOST}/chat/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations(res.data.conversations || []);
    } catch {

    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummaries = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await axios.get(`${HOST}/chat/summaries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSummaries(res.data.summaries || []);
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    fetchSummaries();
  }, [fetchConversations, fetchSummaries]);

  const createConversation = async (msgToPrefill?: string, scanContext?: string) => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const res = await axios.post(
        `${HOST}/chat/conversations`,
        scanContext ? { scan_context: scanContext } : {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const newConv: Conversation = {
        id: res.data.id,
        title: res.data.title,
        updated_at: new Date().toISOString(),
      };
      setConversations((prev) => [newConv, ...prev]);
      if (msgToPrefill) {
        setPrefillMsg(msgToPrefill);
      } else {
        setPrefillMsg('');
      }
      setActiveConv(newConv);
    } catch {
      Alert.alert('Error', 'Could not create a new chat. Is the server running?');
    }
  };

  useEffect(() => {
    if (params?.autoStartMessage) {
      const msg = params.autoStartMessage;
      const ctx = params.scanContext;
      router.setParams({ autoStartMessage: undefined, scanContext: undefined });
      createConversation(msg, ctx);
    }
  }, [params?.autoStartMessage]);

  const deleteConversation = (conv: Conversation) => {
    Alert.alert('Hard Delete', `Permanently delete "${conv.title}"?\nIt will NOT be archived.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await SecureStore.getItemAsync('token');
            await axios.delete(`${HOST}/chat/conversations/${conv.id}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setConversations((prev) => prev.filter((c) => c.id !== conv.id));
          } catch {
            Alert.alert('Error', 'Could not delete conversation.');
          }
        },
      },
    ]);
  };

  const archiveConversation = async (conv: Conversation) => {
    try {
      const token = await SecureStore.getItemAsync('token');
      await axios.post(`${HOST}/chat/conversations/${conv.id}/archive`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConversations((prev) => prev.filter((c) => c.id !== conv.id));
      setActiveConv(null);
      fetchSummaries();
    } catch {
      Alert.alert('Error', 'Could not archive conversation.');
    }
  };

  const handleSignOut = async () => {
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    await SecureStore.deleteItemAsync('userName');
    const rootNav = navigation.getParent() ?? navigation;
    rootNav.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name: 'index' }] })
    );
  };


  if (activeConv) {
    return (
      <ChatView
        conversation={activeConv}
        initialInput={prefillMsg}
        onBack={() => {
          fetchConversations();
          fetchSummaries();
          setActiveConv(null);
          setPrefillMsg('');
        }}
        onArchive={() => archiveConversation(activeConv)}
      />
    );
  }

  if (activeSummary) {
    return (
      <ChatView
        conversation={activeSummary}
        onBack={() => {
          setActiveSummary(null);
        }}
        readOnly={true}
        archiveMessages={activeSummary.messages}
      />
    );
  }

  //conversation list
  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.newChatBtn} onPress={() => createConversation()}>
            <Ionicons name="create-outline" size={22} color="#2D7A4D" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={22} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color="#2D7A4D" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.convRow}
              onPress={() => setActiveConv(item)}
              onLongPress={() => deleteConversation(item)}
              activeOpacity={0.7}
            >
              <View style={styles.convIcon}>
                <Ionicons name="chatbubble-outline" size={20} color="#2D7A4D" />
              </View>
              <View style={styles.convInfo}>
                <Text style={styles.convTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.convTime}>{formatTime(item.updated_at)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => deleteConversation(item)}
                style={styles.deleteBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="trash-outline" size={18} color="#D32F2F" />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={60} color="#ddd" />
              <Text style={styles.emptyTitle}>No active chats</Text>
              <Text style={styles.emptySub}>Tap the pencil icon to start a new agronomist conversation</Text>
              <TouchableOpacity style={styles.newChatFab} onPress={() => createConversation()}>
                <Text style={styles.newChatFabText}>+ New Chat</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 12 }}
          ListFooterComponent={
            summaries.length > 0 ? (
              <View style={styles.archiveSection}>
                <View style={styles.archiveHeader}>
                  <Ionicons name="archive-outline" size={18} color="#888" />
                  <Text style={styles.archiveTitle}>Validated Chats</Text>
                </View>
                {summaries.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    style={styles.archiveRow}
                    onPress={() => setActiveSummary(s)}
                  >
                    <View style={styles.archiveIconWrap}>
                      <Ionicons name="document-text-outline" size={16} color="#aaa" />
                    </View>
                    <View style={styles.archiveInfo}>
                      <Text style={styles.archiveConvTitle} numberOfLines={1}>{s.title}</Text>
                      {s.summary ? (
                        <Text style={styles.archivePreview} numberOfLines={1}>
                          {s.summary}
                        </Text>
                      ) : null}
                      <Text style={styles.archiveMeta}>
                        {s.message_count} messages · {new Date(s.created_at).toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' })} → validated {new Date(s.deleted_at).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

//styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FDFBF7',
  },


  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
  },
  listTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  newChatBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F4EC',
  },
  signOutBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
  },

  //conversation row
  convRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  convIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F4EC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  convInfo: {
    flex: 1,
  },
  convTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  convTime: {
    fontSize: 12,
    color: '#aaa',
  },
  separator: {
    height: 1,
    backgroundColor: '#F5F3EF',
    marginLeft: 74,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },

  //archive section
  archiveSection: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  archiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E4E0',
  },
  archiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F3EF',
  },
  archiveIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F5F3EF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  archiveInfo: {
    flex: 1,
  },
  archiveConvTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
    marginBottom: 2,
  },
  archivePreview: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
    marginBottom: 2,
  },
  archiveMeta: {
    fontSize: 11,
    color: '#bbb',
  },

  //empty states    
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  emptySub: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    maxWidth: 260,
  },
  newChatFab: {
    marginTop: 8,
    backgroundColor: '#2D7A4D',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  newChatFabText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },

  //chat header
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EDE8',
    backgroundColor: '#FDFBF7',
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  validateBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
  },

  //messages
  messageList: {
    padding: 16,
    flexGrow: 1,
  },
  msgRow: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  msgRowUser: {
    justifyContent: 'flex-end',
  },
  msgRowAssistant: {
    justifyContent: 'flex-start',
  },
  avatarBot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2D7A4D',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  msgColumn: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    maxWidth: '100%',
  },
  agentBadge: {
    fontSize: 10,
    color: '#2D7A4D',
    fontWeight: '700',
    marginTop: 6,
    marginLeft: 2,
    letterSpacing: 0.3,
    backgroundColor: '#E8F4EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bubbleUser: {
    backgroundColor: '#2D7A4D',
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(45, 122, 77, 0.1)',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 23,
    letterSpacing: 0.1,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  bubbleTextAssistant: {
    color: '#1a1a1a',
  },

  //typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  typingBubble: {
    backgroundColor: '#fff',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#F0EDE8',
  },

  //empty chat
  emptyChatContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
    gap: 10,
  },
  emptyChatTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#333',
  },
  emptyChatSub: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
    maxWidth: 240,
  },

  //input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: '#F0EDE8',
    backgroundColor: '#FDFBF7',
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 15,
    color: '#111',
    borderWidth: 1,
    borderColor: '#E6E4E0',
    maxHeight: 120,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2D7A4D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#A8C9B5',
  },
});
