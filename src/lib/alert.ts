import { Alert, Platform, type AlertButton } from 'react-native';

/**
 * Alert.alert that also works in the web (Windows) version, where React
 * Native's Alert does nothing. On web, a two-choice alert becomes confirm().
 */
export function alert(title: string, message?: string, buttons?: AlertButton[]) {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }
  const text = message ? `${title}\n\n${message}` : title;
  if (!buttons || buttons.length < 2) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }
  const cancel = buttons.find((b) => b.style === 'cancel');
  const action = buttons.find((b) => b !== cancel);
  if (window.confirm(text)) action?.onPress?.();
  else cancel?.onPress?.();
}
