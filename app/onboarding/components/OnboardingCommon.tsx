import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const PROGRESS_STEPS = 6;

type OnboardingHeaderProps = {
  currentStep: number;
};

type ContinueButtonProps = {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
};

type OnboardingFooterProps = ContinueButtonProps;

export function OnboardingHeader({ currentStep }: OnboardingHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.logo}>
        HOLD
        <Text style={styles.logoAccent}>YOU</Text>
      </Text>

      <View style={styles.progressRow}>
        {Array.from({ length: PROGRESS_STEPS }).map((_, index) => {
          const isActive = index + 1 === currentStep;
          return (
            <View
              key={index}
              style={[
                styles.progressItem,
                isActive ? styles.progressItemActive : styles.progressItemInactive,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

export function ContinueButton({
  label = 'Continue',
  onPress,
  disabled,
}: ContinueButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

export function OnboardingFooter({
  label = 'Continue',
  onPress,
  disabled,
}: OnboardingFooterProps) {
  return (
    <View style={styles.footer}>
      <ContinueButton label={label} onPress={onPress} disabled={disabled} />
      <Text style={styles.footerNote}>© 2025 HoldYou All rights reserved</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 40,
    paddingBottom: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logo: {
    fontSize: 32,
    fontWeight: '700',
    color: '#00B8D9',
    textAlign: 'center',
  },
  logoAccent: {
    color: '#FFFFFF',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    gap: 8,
  },
  progressItem: {
    width: 24,
    height: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  progressItemActive: {
    backgroundColor: '#00B8D9',
    borderColor: '#00B8D9',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 0.4,
  },
  progressItemInactive: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'transparent',
  },
  button: {
    width: 240,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.45,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textTransform: 'none',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 40,
    alignItems: 'center',
    gap: 14,
  },
  footerNote: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '400',
    textAlign: 'center',
  },
});

