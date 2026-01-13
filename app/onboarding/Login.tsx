// app/onboarding/login.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Image,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

const appleLogo = require('../../assets/images/apple-logo.png');
const googleLogo = require('../../assets/images/google-logo.png');
const emailIcon = require('../../assets/images/email-icon.png');

type ModalType = 'none' | 'login' | 'reset' | 'register' | 'confirm';

export default function Login() {
  const [modalType, setModalType] = useState<ModalType>('none');

  // поля
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [resetEmail, setResetEmail] = useState('');

  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // confirm-модалка: показываем сюда email, который только что зарегистрировали / пытались логиниться
  const [pendingEmail, setPendingEmail] = useState<string>('');

  // локальный loading на действия
  const [actionLoading, setActionLoading] = useState(false);

  const {
    loginWithEmail,
    registerWithEmail,
    sendPasswordReset,
    logout,
    refreshUser,
    authLoading,
    isAuthenticated,
    isEmailConfirmed,
  } = useAuth();

  const MIN_PASSWORD_LEN = 6;

  // live validation для register
  const registerPasswordTooShort =
    registerPassword.length > 0 && registerPassword.length < MIN_PASSWORD_LEN;

  const registerPasswordsMismatch =
    registerConfirm.length > 0 && registerPassword !== registerConfirm;

  const canSubmitRegister =
    !actionLoading &&
    registerEmail.trim().length > 0 &&
    registerName.trim().length > 0 &&
    registerPassword.length >= MIN_PASSWORD_LEN &&
    registerPassword === registerConfirm;

  // ✅ если есть сессия и email подтвержден — пускаем в приложение
  useEffect(() => {
    if (isAuthenticated && isEmailConfirmed) {
      router.replace('/(tabs)/talk');
    }
  }, [isAuthenticated, isEmailConfirmed]);

  // fade карточки
  const cardOpacity = useSharedValue(0);
  useEffect(() => {
    cardOpacity.value = withTiming(1, { duration: 700 });
  }, [cardOpacity]);

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cardOpacity.value,
  }));

  // fade модалок
  const modalOpacity = useSharedValue(0);
  useEffect(() => {
    if (modalType !== 'none') {
      modalOpacity.value = 0;
      modalOpacity.value = withTiming(1, { duration: 300 });
    }
  }, [modalType, modalOpacity]);

  const modalAnimatedStyle = useAnimatedStyle(() => ({
    opacity: modalOpacity.value,
  }));

  const handleAppleSignIn = () => {
    console.log('Apple sign-in pressed');
  };

  const handleGoogleSignIn = () => {
    console.log('Google sign-in pressed');
  };

  const renderInput = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    options?: { secureTextEntry?: boolean; placeholder?: string }
  ) => {
    const placeholder =
      options?.placeholder ??
      (label.toLowerCase().includes('name')
        ? 'John Doe'
        : label.toLowerCase().includes('password')
        ? '**********'
        : 'you@example.com');

    return (
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>{label}</Text>
        <TextInput
          style={styles.inputField}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#4C4949"
          secureTextEntry={options?.secureTextEntry}
          autoCapitalize="none"
        />
      </View>
    );
  };

  // ===== HANDLERS =====

  const handleLoginSubmit = async () => {
    setErrorMessage(null);
    setActionLoading(true);

    const email = loginEmail.trim();

    try {
      const user = await loginWithEmail(email, loginPassword);

      const anyUser = user as unknown as {
        email_confirmed_at?: string | null;
        confirmed_at?: string | null;
      } | null;

      const confirmed = Boolean(anyUser?.email_confirmed_at || anyUser?.confirmed_at);

      if (!confirmed) {
        setPendingEmail(email);

        try {
          await logout();
        } catch {}

        setModalType('confirm');
        return;
      }

      setModalType('none');
      router.replace('/(tabs)/talk');
    } catch (error: unknown) {
      const message =
        (error as { message?: string })?.message ??
        'Failed to log in. Please try again.';
      console.log('login error', error);
      setErrorMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegisterSubmit = async () => {
    setErrorMessage(null);

    const email = registerEmail.trim();
    const name = registerName.trim();

    // ✅ локальные проверки до запроса
    if (registerPassword.length < MIN_PASSWORD_LEN) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LEN} characters`);
      return;
    }

    if (registerPassword !== registerConfirm) {
      setErrorMessage('Passwords do not match');
      return;
    }

    setActionLoading(true);

    try {
      setPendingEmail(email);

      await registerWithEmail(name, email, registerPassword);

      // ❌ не логиним автоматически — ждём подтверждения
      setModalType('confirm');
    } catch (error: unknown) {
      const message =
        (error as { message?: string })?.message ??
        'Failed to sign up. Please try again later.';
      console.log('register error', error);
      setErrorMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResetSubmit = async () => {
    setErrorMessage(null);
    setActionLoading(true);

    try {
      await sendPasswordReset(resetEmail.trim());
      alert('Reset link has been sent to your email.');
      setModalType('login');
    } catch (error: unknown) {
      const message =
        (error as { message?: string })?.message ??
        'Failed to send reset link. Please try again.';
      console.log('reset error', error);
      setErrorMessage(message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenMail = async () => {
    try {
      await Linking.openURL('mailto:');
    } catch {}
  };

  const handleIConfirmed = async () => {
    setErrorMessage(null);
    setActionLoading(true);

    try {
      if (isAuthenticated) {
        const u = await refreshUser();
        const anyUser = u as unknown as {
          email_confirmed_at?: string | null;
          confirmed_at?: string | null;
        } | null;

        const confirmed = Boolean(anyUser?.email_confirmed_at || anyUser?.confirmed_at);

        if (confirmed) {
          setModalType('none');
          router.replace('/(tabs)/talk');
          return;
        }

        try {
          await logout();
        } catch {}
        setErrorMessage('Email is not confirmed yet. Please check your inbox.');
        setModalType('confirm');
        return;
      }

      if (pendingEmail) {
        setLoginEmail(pendingEmail);
      }
      setModalType('login');
    } catch (error: unknown) {
      const message =
        (error as { message?: string })?.message ??
        'Could not verify confirmation. Please try again.';
      console.log('confirm-check error', error);
      setErrorMessage(message);
      setModalType('confirm');
    } finally {
      setActionLoading(false);
    }
  };

  // ===== MODALS =====

  const renderModalContent = () => {
    if (modalType === 'login') {
      return (
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Welcome back</Text>
          {renderInput('Email', loginEmail, setLoginEmail)}
          {renderInput('Password', loginPassword, setLoginPassword, {
            secureTextEntry: true,
          })}

          <Pressable
            onPress={handleLoginSubmit}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalPrimaryButton,
              (pressed || actionLoading) && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#00B8D9" />
            ) : (
              <Text style={styles.modalPrimaryText}>Log in</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setModalType('none')}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalSecondaryButton,
              pressed && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.modalSecondaryText}>Back</Text>
          </Pressable>

          <Pressable onPress={() => setModalType('reset')} disabled={actionLoading}>
            <Text style={[styles.modalLink, styles.modalLinkAccent]}>
              Forgot password?
            </Text>
          </Pressable>

          <Pressable onPress={() => setModalType('register')} disabled={actionLoading}>
            <Text style={styles.modalLinkHighlight}>
              Don’t have an account? Register
            </Text>
          </Pressable>
        </View>
      );
    }

    if (modalType === 'reset') {
      return (
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Reset your password</Text>
          {renderInput('Email', resetEmail, setResetEmail)}

          <Pressable
            onPress={handleResetSubmit}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalPrimaryButton,
              (pressed || actionLoading) && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#00B8D9" />
            ) : (
              <Text style={styles.modalPrimaryText}>Send reset link</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setModalType('login')}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalSecondaryButton,
              pressed && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.modalSecondaryText}>Back</Text>
          </Pressable>

          <Pressable onPress={() => setModalType('login')} disabled={actionLoading}>
            <Text style={styles.modalLinkHighlight}>
              Remembered your password? Log in
            </Text>
          </Pressable>
        </View>
      );
    }

    if (modalType === 'register') {
      return (
        <View style={[styles.modalCard, styles.modalTallCard]}>
          <Text style={styles.modalTitle}>Create your account</Text>

          {renderInput('Full name', registerName, setRegisterName)}
          {renderInput('Email', registerEmail, setRegisterEmail)}

          {/* Password + helper */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Password</Text>
            <TextInput
              style={styles.inputField}
              value={registerPassword}
              onChangeText={setRegisterPassword}
              placeholder="**********"
              placeholderTextColor="#4C4949"
              secureTextEntry
              autoCapitalize="none"
            />
            <Text
              style={[
                styles.helperText,
                registerPasswordTooShort && styles.helperTextError,
              ]}
            >
              At least {MIN_PASSWORD_LEN} characters
            </Text>
          </View>

          {/* Confirm password */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Confirm password</Text>
            <TextInput
              style={styles.inputField}
              value={registerConfirm}
              onChangeText={setRegisterConfirm}
              placeholder="**********"
              placeholderTextColor="#4C4949"
              secureTextEntry
              autoCapitalize="none"
            />
            {registerPasswordsMismatch && (
              <Text style={[styles.helperText, styles.helperTextError]}>
                Passwords do not match
              </Text>
            )}
          </View>

          <Pressable
            onPress={handleRegisterSubmit}
            disabled={!canSubmitRegister}
            style={({ pressed }) => [
              styles.modalPrimaryButton,
              (pressed || actionLoading) && styles.pressed,
              !canSubmitRegister && { opacity: 0.6 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#00B8D9" />
            ) : (
              <Text style={styles.modalPrimaryText}>Sign up</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => setModalType('login')}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalSecondaryButton,
              pressed && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.modalSecondaryText}>Back</Text>
          </Pressable>

          <Pressable onPress={() => setModalType('login')} disabled={actionLoading}>
            <Text style={styles.modalLinkHighlight}>
              Already have an account? Log in
            </Text>
          </Pressable>
        </View>
      );
    }

    if (modalType === 'confirm') {
      return (
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Confirm your email</Text>

          <Text style={styles.confirmText}>
            We sent a confirmation link to:{'\n'}
            <Text style={styles.confirmEmail}>{pendingEmail || 'your email'}</Text>
            {'\n\n'}Open the email and tap the link to activate your account.
          </Text>

          <Pressable
            onPress={handleOpenMail}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalPrimaryButton,
              (pressed || actionLoading) && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            {actionLoading ? (
              <ActivityIndicator size="small" color="#00B8D9" />
            ) : (
              <Text style={styles.modalPrimaryText}>Open Mail</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleIConfirmed}
            disabled={actionLoading}
            style={({ pressed }) => [
              styles.modalSecondaryButton,
              (pressed || actionLoading) && styles.pressed,
              actionLoading && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.modalSecondaryText}>I’ve confirmed</Text>
          </Pressable>

          <Pressable onPress={() => setModalType('login')} disabled={actionLoading}>
            <Text style={[styles.modalLink, styles.modalLinkAccent]}>
              Back to login
            </Text>
          </Pressable>
        </View>
      );
    }

    return null;
  };

  const socialButtons = useMemo(
    () => [
      {
        id: 'apple',
        label: 'Sign in with Apple',
        icon: appleLogo,
        onPress: handleAppleSignIn,
      },
      {
        id: 'google',
        label: 'Sign in with Google',
        icon: googleLogo,
        onPress: handleGoogleSignIn,
      },
      {
        id: 'email',
        label: 'Continue with Email',
        icon: emailIcon,
        onPress: () => setModalType('login'),
      },
    ],
    []
  );

  if (authLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#00B8D9" />
          <Text style={styles.loadingText}>Checking session...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.card, cardAnimatedStyle]}>
          <Text style={styles.title}>Welcome to HoldYou</Text>
          <Text style={styles.subtitle}>
            Choose how you’d like to continue — safely and easily
          </Text>

          <View style={styles.buttonStack}>
            {socialButtons.map((button, index) => (
              <Pressable
                key={button.id}
                onPress={button.onPress}
                disabled={actionLoading}
                style={({ pressed }) => [
                  styles.socialButton,
                  index > 0 && styles.socialButtonSpacing,
                  (pressed || actionLoading) && styles.pressed,
                ]}
              >
                <View style={styles.iconWrapper}>
                  <Image source={button.icon} style={styles.buttonIcon} resizeMode="contain" />
                </View>
                <Text style={styles.socialLabel}>{button.label}</Text>
              </Pressable>
            ))}
          </View>

          {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

          <Text style={styles.terms}>
            By continuing, you agree to HoldYou's{'\n'}
            <Text style={styles.termsLink}>Terms and Privacy Policy</Text>
            {'\n\n'}AI recreates tone — not the person{'\n'}
            HoldYou keeps their warmth, not their image
          </Text>
        </Animated.View>
      </ScrollView>

      {modalType !== 'none' && (
        <View style={styles.modalBackdrop}>
          <Animated.View style={modalAnimatedStyle}>
            {renderModalContent()}
          </Animated.View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  card: {
    width: 304,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    paddingVertical: 32,
    paddingHorizontal: 24,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.52,
    shadowRadius: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '600',
    lineHeight: 36,
    color: '#00B8D9',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 16,
    color: '#FFFFFF',
    opacity: 0.76,
    textAlign: 'center',
  },
  buttonStack: {
    width: '100%',
    marginTop: 40,
  },
  socialButtonSpacing: {
    marginTop: 16,
  },
  socialButton: {
    width: '100%',
    height: 44,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  iconWrapper: {
    width: 40,
    alignItems: 'center',
  },
  buttonIcon: {
    width: 24,
    height: 24,
  },
  socialLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  terms: {
    marginTop: 32,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    color: '#FFFFFF',
    opacity: 0.72,
    textAlign: 'center',
  },
  termsLink: {
    color: '#00B8D9',
  },
  errorText: {
    marginTop: 16,
    fontSize: 12,
    fontWeight: '500',
    color: '#ff6b6b',
    textAlign: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: 304,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    paddingHorizontal: 24,
    paddingVertical: 32,
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    minHeight: 360,
    justifyContent: 'center',
  },
  modalTallCard: {
    paddingBottom: 32,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  inputField: {
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#AEACAC',
    color: '#111111',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '500',
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
    opacity: 0.7,
  },
  helperTextError: {
    color: '#ff6b6b',
    opacity: 1,
  },
  modalPrimaryButton: {
    marginTop: 8,
    height: 38,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00B8D9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  modalPrimaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  modalSecondaryButton: {
    marginTop: 12,
    height: 38,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: '#00B8D9',
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  modalLink: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  modalLinkAccent: {
    color: '#00B8D9',
  },
  modalLinkHighlight: {
    marginTop: 12,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
    color: '#0BBC96',
  },
  confirmText: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    color: '#FFFFFF',
    opacity: 0.82,
    textAlign: 'center',
    marginBottom: 6,
  },
  confirmEmail: {
    color: '#0BBC96',
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#FFFFFF',
  },
});
