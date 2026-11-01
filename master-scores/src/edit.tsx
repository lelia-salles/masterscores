import { useEffect, useRef } from '@wordpress/element';
import { useBlockProps } from '@wordpress/block-editor';
import { __ } from '@wordpress/i18n';
import { Play, Square, Save, Music } from 'lucide-react';
import { Renderer, Stave, StaveNote, Formatter, Voice } from 'vexflow';
import * as Tone from 'tone';

import { initialScoreMock } from './mockScore';
import { ScoreState } from './types/scores';

const cloneScore = (score: ScoreState): ScoreState =>
  JSON.parse(JSON.stringify(score));

const renderScoreToCanvas = (
  container: HTMLDivElement | null,
  width: number,
  height: number,
  score: ScoreState | undefined
) => {
  if ( ! container || ! score?.tracks?.length ) {
    return;
  }

  container.innerHTML = '';

  const renderer = new Renderer( container, Renderer.Backends.CANVAS );
  renderer.resize( width, height );

  const context = renderer.getContext();
  context.setFont( 'Arial', 10, '' ).setBackgroundFillStyle( '#f8fafc' );

  const track = score.tracks[0];
  const measure = track.measures[0];
  const voiceData = measure.voices[0];

  const stave = new Stave( 10, 40, width - 20 );
  stave.addClef( measure.clef ).addTimeSignature( measure.timeSignature );
  stave.setContext( context ).draw();

  const notes = voiceData.notes.map( ( note ) => {
    const mappedKeys =
      note.isRest || note.keys.length === 0
        ? [ 'b/4' ]
        : note.keys.map( ( key ) =>
            key
              .toLowerCase()
              .replace( /(\w)(#|b)?(\d)/, '$1$2/$3' )
          );

    return new StaveNote( {
      clef: measure.clef,
      keys: mappedKeys,
      duration: note.isRest ? `${ note.duration }r` : note.duration,
    } );
  } );

  const [ numBeats, beatValue ] = measure.timeSignature.split( '/' ).map( Number );

  const voice = new Voice( { numBeats, beatValue } );
  voice.addTickables( notes );

  new Formatter().joinVoices( [ voice ] ).format( [ voice ], width - 40 );
  voice.draw( context, stave );
};

const playScore = async ( score: ScoreState ) => {
  await Tone.start();

  const synth = new Tone.PolySynth( Tone.Synth ).toDestination();
  const track = score.tracks[0];
  const measure = track.measures[0];
  const voiceData = measure.voices[0];

  let currentTime = Tone.now();

  voiceData.notes.forEach( ( note ) => {
    const toneDuration =
      note.duration === 'w' ? '1n' :
      note.duration === 'h' ? '2n' :
      note.duration === 'q' ? '4n' :
      '8n';

    if ( ! note.isRest && note.keys.length > 0 ) {
      synth.triggerAttackRelease( note.keys, toneDuration, currentTime );
    }

    currentTime += Tone.Time( toneDuration ).toSeconds();
  } );

  return currentTime;
};

export default function Edit( { attributes, setAttributes } ) {
  const blockProps = useBlockProps( {
    className: 'wp-block-create-block-master-scores',
  } );

  const score: ScoreState = attributes.score ?? initialScoreMock;
  const containerRef = useRef<HTMLDivElement>( null );
  const isPlayingRef = useRef( false );

  useEffect( () => {
    renderScoreToCanvas( containerRef.current, 600, 220, score );
  }, [ score ] );

  const updateFirstNote = () => {
    const nextScore = cloneScore( score );
    const firstNote =
      nextScore.tracks[0].measures[0].voices[0].notes[0];

    const scale = [ 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5' ];
    const currentIndex = scale.indexOf( firstNote.keys[0] || 'C4' );
    const nextIndex =
      currentIndex + 1 >= scale.length ? 0 : currentIndex + 1;

    firstNote.keys = [ scale[ nextIndex ] ];

    setAttributes( { score: nextScore } );
  };

  const handleTogglePlayback = async () => {
    const nextValue = ! isPlayingRef.current;

    isPlayingRef.current = nextValue;

    if ( ! nextValue ) {
      Tone.Transport.stop();
      Tone.Transport.cancel( 0 );
      return;
    }

    const totalPlayTime = await playScore( score );

    const durationSeconds = totalPlayTime - Tone.now();
    window.setTimeout( () => {
      isPlayingRef.current = false;
      Tone.Transport.stop();
      Tone.Transport.cancel( 0 );
    }, Math.max( durationSeconds * 1000, 100 ) );
  };

  return (
    <div { ...blockProps }>
      <div className="master-scores-editor">
        <div className="master-scores-toolbar">
          <div className="master-scores-brand">
            <div className="master-scores-brand-icon">
              <Music size={ 18 } />
            </div>
            <div>
              <strong>{ score.metadata.title }</strong>
            </div>
          </div>

          <div className="master-scores-actions">
            <button
              type="button"
              className="master-scores-button master-scores-button-primary"
              onClick={ handleTogglePlayback }
            >
              { isPlayingRef.current ? <Square size={ 16 } /> : <Play size={ 16 } /> }
              { isPlayingRef.current ? __( 'Stop audio', 'master-scores' ) : __( 'Play audio', 'master-scores' ) }
            </button>

            <button
              type="button"
              className="master-scores-button"
              onClick={ () => setAttributes( { score: cloneScore( score ) } ) }
            >
              <Save size={ 16 } />
              { __( 'Save score', 'master-scores' ) }
            </button>
          </div>
        </div>

        <div className="master-scores-score-panel">
          <div className="master-scores-header">
            <h2>{ score.metadata.title }</h2>
            <p>{ score.metadata.composer }</p>
          </div>

          <div
            ref={ containerRef }
            onClick={ updateFirstNote }
            className="master-scores-canvas"
          />
        </div>
      </div>
    </div>
  );
}