import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, BorderRadius } from '@/constants/theme';

interface CallControlsProps {
  isMicMuted: boolean;
  isCamMuted: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onEndCall: () => void;
  onRefresh?: () => void;
  isCaptionsOn?: boolean;
  onToggleCaptions?: () => void;
}

export function CallControls({
  isMicMuted,
  isCamMuted,
  onToggleMic,
  onToggleCamera,
  onEndCall,
  onRefresh,
  isCaptionsOn,
  onToggleCaptions,
}: CallControlsProps) {
  return (
    <View style={styles.island}>
      <Pressable
        onPress={onToggleMic}
        style={({ pressed }) => [styles.btn, isMicMuted && styles.btnMuted, pressed && styles.btnPressed]}
      >
        <Ionicons name={isMicMuted ? 'mic-off' : 'mic'} size={22} color={isMicMuted ? '#F87171' : '#fff'} />
      </Pressable>

      <Pressable
        onPress={onEndCall}
        style={({ pressed }) => [styles.endBtn, pressed && { transform: [{ scale: 0.88 }], opacity: 0.85 }]}
      >
        <Ionicons name="call" size={26} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
      </Pressable>

      <Pressable
        onPress={onToggleCamera}
        style={({ pressed }) => [styles.btn, isCamMuted && styles.btnMuted, pressed && styles.btnPressed]}
      >
        <Ionicons name={isCamMuted ? 'videocam-off' : 'videocam'} size={22} color={isCamMuted ? '#F87171' : '#fff'} />
      </Pressable>

      {onToggleCaptions && (
        <Pressable
          onPress={onToggleCaptions}
          style={({ pressed }) => [styles.btn, isCaptionsOn && styles.btnActive, pressed && styles.btnPressed]}
        >
          <Ionicons name="text" size={20} color={isCaptionsOn ? '#00D4AA' : '#fff'} />
        </Pressable>
      )}

      {onRefresh && (
        <Pressable
          onPress={onRefresh}
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        >
          <Ionicons name="refresh" size={20} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  island: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm + 4,
    paddingVertical: 10,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnMuted: {
    backgroundColor: 'rgba(248,113,113,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
  },
  btnActive: {
    backgroundColor: 'rgba(0,212,170,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(0,212,170,0.5)',
  },
  btnPressed: {
    transform: [{ scale: 0.9 }],
    opacity: 0.7,
  },
  endBtn: {
    width: 54,
    height: 54,
    borderRadius: BorderRadius.full,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
});
