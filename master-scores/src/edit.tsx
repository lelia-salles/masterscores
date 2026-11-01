import { useState, useEffect, useRef } from '@wordpress/element';
import { Play, Square, Save, Music, Settings } from 'lucide-react';
import { initialScoreMock } from './mockScore';
import { ScoreState } from './types/scores';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import * as Tone from 'tone';

interface MeasureProps {
  width?: number;
  height?: number;
}

export default function Edit({ width = 600, height = 200 }: MeasureProps) {
  const [score, setScore] = useState<ScoreState>(initialScoreMock);
  const [isPlaying, setIsPlaying] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  // ==========================================
  // EFEITO 1: VEXFLOW (Renderização Visual)
  // ==========================================
  useEffect(() => {
    if (!containerRef.current) return;

    // Limpa o canvas anterior
    containerRef.current.innerHTML = '';

    // 1. Criando o Renderer 
    const renderer = new Renderer(containerRef.current, Renderer.Backends.SGV);
    renderer.resize(width, height);

    const context = renderer.getContext();
    context.setFont('Arial', 10, '').setBackgroundFillStyle('#eed');

    const measureData = score.tracks[0].measures[0];
    const voiceData = measureData.voices[0];

    // 2. Criando a Pauta (Stave) diretamente
    const stave = new Stave(10, 40, width - 20);
    stave.addClef(measureData.clef).addTimeSignature(measureData.timeSignature);
    stave.setContext(context).draw();

    // 3. Processando as notas e criando StaveNote
    const notes = voiceData.notes.map(note => {
      let vfKeys = note.keys.map(k => k.toLowerCase().replace(/(\w)(#|b)?(\d)/, "$1$2/$3"));

      if (note.isRest || vfKeys.length === 0) {
        vfKeys = ['b/4'];
      }

      return new StaveNote({
        clef: measureData.clef,
        keys: vfKeys,
        duration: note.isRest ? note.duration + 'r' : note.duration
      });
    });

    const [numBeats, beatValue] = measureData.timeSignature.split('/').map(Number);

    // 4. Criando Voice e Formatter diretamente (CORRIGIDO PARA O TYPESCRIPT)
    const voice = new Voice({ numBeats, beatValue });
    voice.addTickables(notes);

    new Formatter().joinVoices([voice]).format([voice], width - 50);
    voice.draw(context, stave);

  }, [width, height, score]);


  // ==========================================
  // EFEITO 2: TONE.JS (Motor de Áudio)
  // ==========================================
  useEffect(() => {
    if (!isPlaying) {
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
      return;
    }

    const playScore = async () => {
      await Tone.start();

      const synth = new Tone.PolySynth(Tone.Synth).toDestination();
      const voiceData = score.tracks[0].measures[0].voices[0];

      let currentTime = Tone.now();

      voiceData.notes.forEach(note => {
        const toneDuration = note.duration === 'q' ? '4n' : '8n';

        if (!note.isRest && note.keys.length > 0) {
          synth.triggerAttackRelease(note.keys, toneDuration, currentTime);
        }

        currentTime += Tone.Time(toneDuration).toSeconds();
      });

      const totalTime = currentTime - Tone.now();
      setTimeout(() => setIsPlaying(false), totalTime * 1000);
    };

    playScore();

    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel(0);
    };
  }, [isPlaying, score]);

  // ==========================================
  // INTERATIVIDADE: O MOTOR DE EDIÇÃO (WYSIWYG)
  // ==========================================
  const handleCanvasClick = () => {
    const newScore = { ...score };
    const firstNote = newScore.tracks[0].measures[0].voices[0].notes[0];

    const scale = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
    const currentIndex = scale.indexOf(firstNote.keys[0]);

    const nextIndex = currentIndex + 1 >= scale.length ? 0 : currentIndex + 1;
    firstNote.keys = [scale[nextIndex]];

    setScore(newScore);
  };

  // ==========================================
  // INTERFACE
  // ==========================================
  return (
    <div className="min-h-screen bg-neutral-100 p-8 font-sans text-slate-800">
      <div className="max-w-4xl mx-auto bg-white rounded-t-xl shadow-sm border border-slate-200 p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="bg-indigo-600 p-2 rounded-lg text-white">
            <Music size={20} />
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Master Scores</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${
              isPlaying ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {isPlaying ? <Square size={16} /> : <Play size={16} />}
            {isPlaying ? 'Parar Áudio' : 'Tocar Áudio'}
          </button>

          <button className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-md font-medium">
            <Save size={16} />
            Salvar no WP
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto bg-white border-x border-b border-slate-200 rounded-b-xl shadow-sm min-h-[400px] p-8 flex flex-col items-center">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-serif text-slate-900">{score.metadata.title}</h2>
          <p className="text-slate-500 mt-2 font-serif italic">{score.metadata.composer}</p>
        </div>
        <div
          ref={containerRef}
          onClick={handleCanvasClick}
          className="bg-white group relative cursor-crosshair hover:bg-slate-50 transition-colors"
        ></div>
      </div>
    </div>
  );
}
