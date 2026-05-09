export const speak = (text) => {
  if (!('speechSynthesis' in window)) {
    console.error('Speech Synthesis non supportata.');
    return;
  }

  // Cancella eventuali code di parlato precedenti
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'it-IT';
  
  // Cerchiamo una voce italiana di qualità se disponibile
  const voices = window.speechSynthesis.getVoices();
  const italianVoice = voices.find(v => v.lang.startsWith('it')) || voices[0];
  if (italianVoice) utterance.voice = italianVoice;

  utterance.pitch = 1;
  utterance.rate = 1;

  window.speechSynthesis.speak(utterance);
};
