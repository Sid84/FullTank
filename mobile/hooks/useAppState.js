import { AppState } from 'react-native';
import { useEffect, useRef, useState } from 'react';

export default function useAppState() {
  const appState = useRef(AppState.currentState);
  const [state, setState] = useState(appState.current);

  useEffect(() => {
    const onChange = (next) => {
      appState.current = next;
      setState(next);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  return state; // 'active' | 'background' | 'inactive'
}
