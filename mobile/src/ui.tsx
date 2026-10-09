import React from 'react'
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native'

export const colors = { ink: '#173f3a', sea: '#21695c', sand: '#fff7e4', gold: '#b77d20', muted: '#60736a' }
export function Button({ title, onPress, disabled = false, selected = false }: { title: string; onPress: () => void; disabled?: boolean; selected?: boolean }) {
    return <Pressable accessibilityRole="button" accessibilityState={{ disabled, selected }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, selected && styles.selected, { opacity: disabled ? .4 : pressed ? .7 : 1 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
    return <View style={{ gap: 6 }}><Text style={styles.text}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} style={styles.input} {...props} /></View>
}
export const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#e4eee5' },
    content: { padding: 16, gap: 16, paddingBottom: 40, width: '100%', maxWidth: 800, alignSelf: 'center' },
    panel: { padding: 16, backgroundColor: colors.sand, borderRadius: 18, gap: 12 },
    title: { fontSize: 32, fontWeight: '800', color: colors.ink },
    heading: { fontSize: 20, fontWeight: '700', color: colors.ink },
    text: { color: colors.ink, fontSize: 16, lineHeight: 23 },
    small: { color: colors.muted, fontSize: 13 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    button: { minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: colors.sea, borderRadius: 10 },
    buttonText: { color: '#fffaf0', fontSize: 16, fontWeight: '600' },
    selected: { borderWidth: 3, borderColor: colors.gold },
    input: { borderWidth: 1, borderColor: '#aebfb0', borderRadius: 10, padding: 12, minHeight: 48, backgroundColor: 'white', color: colors.ink, fontSize: 16 },
    error: { color: '#9b3724', backgroundColor: '#fff0e5', padding: 12, borderRadius: 10, fontSize: 15 },
})
