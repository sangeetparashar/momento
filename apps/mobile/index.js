// Polyfills — MUST be imported before anything else (Privy requirement)
import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Now load the app via expo-router
import 'expo-router/entry';
