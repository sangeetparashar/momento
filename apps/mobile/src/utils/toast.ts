import Toast from 'react-native-toast-message';

export function showErrorToast(message: string) {
  Toast.show({
    type: 'error',
    text1: 'Something went wrong',
    text2: message,
    position: 'top',
    visibilityTime: 3000,
  });
}

export function showSuccessToast(message: string) {
  Toast.show({
    type: 'success',
    text1: message,
    position: 'top',
    visibilityTime: 2000,
  });
}
