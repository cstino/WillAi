import { useState, useEffect, useCallback, useRef } from 'react';

export const useSpeechRecognition = (onResult) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.error('Web Speech API non supportata in questo browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'it-IT';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      setIsListening(true);
    };
    
    recognition.onend = () => {
      console.log('Speech recognition ended');
      setIsListening(false);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
    };
    
    recognition.onresult = (event) => {
      let currentTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        currentTranscript += event.results[i][0].transcript;
      }
      setTranscript(currentTranscript);
      if (event.results[event.results.length - 1].isFinal) {
        console.log('Speech recognition final result:', currentTranscript);
        onResult?.(currentTranscript);
        try {
          recognition.stop();
        } catch (e) {
          console.error('Error stopping recognition on final result:', e);
        }
      }
    };

    recognitionRef.current = recognition;
  }, [onResult]);

  const startListening = useCallback(() => {
    setTranscript('');
    try {
      recognitionRef.current?.start();
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setIsListening(true);
    }
  }, []);

  const stopListening = useCallback(() => {
    console.log('stopListening called manually');
    setIsListening(false);
    try {
      recognitionRef.current?.stop();
    } catch (e) {
      console.warn('Error on stop():', e);
    }
    try {
      recognitionRef.current?.abort();
    } catch (e) {
      console.warn('Error on abort():', e);
    }
  }, []);

  return {
    isListening,
    transcript,
    startListening,
    stopListening
  };
};
