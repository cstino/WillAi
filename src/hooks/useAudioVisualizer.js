import { useState, useEffect, useRef } from 'react';

export const useAudioVisualizer = (isListening) => {
  const [audioData, setAudioData] = useState(new Uint8Array(0));
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    if (isListening) {
      const initAudio = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
          analyserRef.current = audioContextRef.current.createAnalyser();
          sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
          
          sourceRef.current.connect(analyserRef.current);
          analyserRef.current.fftSize = 64; // Piccola dimensione per visualizzazione semplice
          
          const bufferLength = analyserRef.current.frequencyBinCount;
          const dataArray = new Uint8Array(bufferLength);

          const update = () => {
            analyserRef.current.getByteFrequencyData(dataArray);
            setAudioData(new Uint8Array(dataArray));
            animationFrameRef.current = requestAnimationFrame(update);
          };
          
          update();
        } catch (err) {
          console.error('Errore accesso microfono per visualizer:', err);
        }
      };

      initAudio();
    } else {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
      setAudioData(new Uint8Array(0));
    }

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, [isListening]);

  return audioData;
};
