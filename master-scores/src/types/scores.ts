// types/score.ts

/**
 * A Raiz da Partitura. Representa o arquivo completo.
 */
export interface ScoreState {
  id: string;
  metadata: {
    title: string;
    composer: string;
  };
  playback: {
    bpm: number;         // Crucial para o Tone.js ditar o tempo
    swing: boolean;
  };
  tracks: Track[];       // Lista de instrumentos (ex: Piano = 2 tracks para 2 pautas)
}

/**
 * Uma Pista (ou Instrumento). 
 */
export interface Track {
  id: string;
  name: string;
  instrumentId: string;  // Mapeia para o SoundFont do Tone.js (ex: 'acoustic_grand_piano')
  measures: Measure[];
}

/**
 * O Compasso. Onde a mágica de divisão matemática acontece.
 */
export interface Measure {
  id: string;
  index: number;
  clef: 'treble' | 'bass' | 'alto' | 'tenor'; // VexFlow precisa disso para desenhar
  timeSignature: string;                      // ex: "4/4", "3/4" - Tone.js usa para agendar
  keySignature: string;                       // ex: "C", "G", "F#"
  voices: Voice[];                            // Permite polifonia (múltiplas melodias na mesma pauta)
}

/**
 * Uma Voz contínua dentro de um compasso.
 */
export interface Voice {
  id: string;
  notes: NoteEvent[];
}

/**
 * A Entidade Musical (Nota ou Pausa).
 */
export interface NoteEvent {
  id: string;
  keys: string[];        // Array para acordes. Ex: ["C4", "E4", "G4"]. Vazio se for pausa.
  duration: string;      // Formato neutro: 'w'(semibreve), 'h'(mínima), 'q'(semínima), '8'(colcheia)
  isRest: boolean;       // Se true, o VexFlow desenha uma pausa e o Tone.js silencia
  dots: number;          // Quantidade de pontos de aumento (0, 1, 2)
  articulation?: 'staccato' | 'accent' | 'tenuto';
  tie?: 'start' | 'stop';// Ligaduras de valor
}